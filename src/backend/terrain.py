"""
terrain.py - builds the computational valley grid shared by BOTH solvers.

Coordinates: s = distance along the river centre-line (dam at s=0), n = lateral offset
(positive to the left of the flow). The grid follows the river exactly like a Delft3D
curvilinear grid; curvature terms are neglected (valid while the bend radius is much
larger than the flood width).

Bed elevation
-------------
  * default  : parametric valley = thalweg profile (slopes from dam_data.py) + cross-section
               (valley floor, walls, flood-plain) + width pulsations + channel wandering
               (seeded per dam, so a given dam always gives the same terrain).
  * optional : real DEM. Put a GeoTIFF (EPSG:4326, e.g. SRTM/Cartosat) at
               backend/dem/<dam_id>.tif and it is sampled onto the same grid
               (needs `pip install rasterio`).   <-- not exercised in the unit tests.
"""
import math
import os
import zlib
import numpy as np
from dam_data import TERRAIN_CLASSES

R_EARTH = 6371000.0
DEM_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dem")


class Projector:
    def __init__(self, lat0, lng0):
        self.lat0, self.lng0 = lat0, lng0
        self.kx = R_EARTH * math.cos(math.radians(lat0)) * math.pi / 180.0
        self.ky = R_EARTH * math.pi / 180.0

    def fwd(self, lat, lng):
        return (np.asarray(lng) - self.lng0) * self.kx, (np.asarray(lat) - self.lat0) * self.ky

    def inv(self, e, n):
        return self.lat0 + np.asarray(n) / self.ky, self.lng0 + np.asarray(e) / self.kx


def _smooth_path(pts_en, length_m, step):
    """Chord-length parametrised smoothing spline through the waypoints, extended along the
    last direction until it is `length_m` long, then resampled every `step` metres."""
    pts = np.asarray(pts_en, float)
    # drop duplicates
    keep = [0]
    for i in range(1, len(pts)):
        if np.hypot(*(pts[i] - pts[keep[-1]])) > 1.0:
            keep.append(i)
    pts = pts[keep]
    seg = np.hypot(*np.diff(pts, axis=0).T)
    total = seg.sum()
    if total < length_m:                      # extend along last tangent
        d = pts[-1] - pts[-2]
        d /= np.hypot(*d)
        pts = np.vstack([pts, pts[-1] + d * (length_m - total + 2 * step)])
        seg = np.hypot(*np.diff(pts, axis=0).T)
    u = np.concatenate([[0], np.cumsum(seg)])
    if len(pts) >= 4:
        from scipy.interpolate import PchipInterpolator
        fe, fn = PchipInterpolator(u, pts[:, 0]), PchipInterpolator(u, pts[:, 1])
    else:
        fe = lambda x: np.interp(x, u, pts[:, 0])
        fn = lambda x: np.interp(x, u, pts[:, 1])
    uu = np.linspace(0, u[-1], int(u[-1] / (step * 0.25)) + 1)
    e, n = fe(uu), fn(uu)
    # re-parametrise by true arc length
    arc = np.concatenate([[0], np.cumsum(np.hypot(np.diff(e), np.diff(n)))])
    ss = np.arange(0, min(arc[-1], length_m) + 1e-6, step)
    return np.interp(ss, arc, e), np.interp(ss, arc, n)


def _synthetic_path(bearing_deg, length_m, step, rng):
    """straight line + gentle meander (amplitude ~6 % of wavelength)"""
    s = np.arange(0, length_m + step, step)
    lam = rng.uniform(9000.0, 15000.0)
    amp = 0.06 * lam
    lat_off = amp * np.sin(2 * np.pi * s / lam + rng.uniform(0, 6.28)) * np.minimum(1.0, s / 4000.0)
    b = math.radians(bearing_deg)
    te, tn = math.sin(b), math.cos(b)
    e = s * te + lat_off * (-tn)
    n = s * tn + lat_off * te
    return e, n


class Valley:
    def __init__(self, dam_id, dam, reach_km=None, overrides=None, use_dem=True):
        ov = overrides or {}
        self.dam_id, self.dam = dam_id, dam
        cls = TERRAIN_CLASSES[dam["cls"]]
        self.cls = dam["cls"]
        self.ds = float(ov.get("ds", cls["ds"]))
        self.dn = float(ov.get("dn", cls["dn"]))
        self.W = float(ov.get("W", cls["W"]))
        self.manning = float(ov.get("manning", cls["n"]))
        reach_m = 1000.0 * float(reach_km or dam.get("reach_km", 100))
        seed = zlib.crc32(dam_id.encode()) & 0xffffffff
        rng = np.random.default_rng(seed)
        self.proj = Projector(dam["lat"], dam["lng"])

        # ---- centre-line ------------------------------------------------------------
        if dam.get("path"):
            wp = [self.proj.fwd(la, lo) for la, lo in dam["path"]]
            pts = np.array([[float(a), float(b)] for a, b in wp])
            ce, cn = _smooth_path(pts, reach_m, self.ds)
            self.path_source = "waypoints"
        else:
            ce, cn = _synthetic_path(dam.get("bearing", 180.0), reach_m, self.ds, rng)
            self.path_source = "bearing"
        ns = len(ce) - 1
        self.ns = ns
        # cell-centre line
        self.ce = 0.5 * (ce[:-1] + ce[1:])
        self.cn = 0.5 * (cn[:-1] + cn[1:])
        te, tn = np.diff(ce), np.diff(cn)
        mag = np.hypot(te, tn)
        te, tn = te / mag, tn / mag
        # light smoothing of the tangent to avoid kinks
        k = np.ones(5) / 5.0
        te = np.convolve(np.pad(te, 2, mode="edge"), k, "valid")
        tn = np.convolve(np.pad(tn, 2, mode="edge"), k, "valid")
        mag = np.hypot(te, tn); te, tn = te / mag, tn / mag
        self.te, self.tn_ = te, tn
        self.ne, self.nn_ = -tn, te             # left normal (east, north)
        self.s = (np.arange(ns) + 0.5) * self.ds
        self.length = ns * self.ds

        self.nn = int(round(self.W / self.dn))
        if self.nn % 2 == 1:
            self.nn += 1
        self.n = (np.arange(self.nn) + 0.5) * self.dn - 0.5 * self.nn * self.dn

        # ---- thalweg profile --------------------------------------------------------
        s_near, s_far, brk_km = dam["slope"]
        brk = brk_km * 1000.0
        sl = np.where(self.s < brk, s_near, s_far)
        self.zt = -np.cumsum(sl * self.ds) + sl[0] * self.ds     # 0 at the dam toe
        self.slope_s = sl

        # ---- cross-section --------------------------------------------------------------
        if self.cls == "gorge":
            Wf0, ch_w, ch_d = cls["floor_w"], cls["floor_w"], 0.0
        elif self.cls == "valley":
            Wf0, ch_w, ch_d = cls["floor_w"], 140.0, 4.0
        else:
            Wf0, ch_w, ch_d = 0.8 * self.W, 700.0, 5.0
        lam1 = rng.uniform(7000, 12000); lam2 = rng.uniform(2500, 4500)
        ph1, ph2, ph3 = rng.uniform(0, 6.28, 3)
        mod = 1 + 0.35 * np.sin(2 * np.pi * self.s / lam1 + ph1) + 0.15 * np.sin(2 * np.pi * self.s / lam2 + ph2)
        mod = np.clip(mod, 0.55, 1.6)
        # valley opens out downstream (smooth step between open_km and open_km + open_len_km)
        o0 = 1000.0 * float(dam.get("open_km", cls.get("open_km", 0.0)))
        olen = 1000.0 * float(cls.get("open_len_km", 1.0))
        x = np.clip((self.s - o0) / max(olen, 1.0), 0.0, 1.0)
        g = x * x * (3.0 - 2.0 * x)
        gain = float(cls.get("floor_gain", 1.0))
        self.floor_w = Wf0 * (1.0 + (gain - 1.0) * g) * mod         # (ns,)
        wall_s = cls["wall"] + (cls.get("wall_end", cls["wall"]) - cls["wall"]) * g   # wall slope along the valley
        if self.cls == "gorge":
            self.n_c = np.zeros(self.ns)
        else:
            amp = 0.18 * Wf0 if self.cls == "valley" else 0.06 * self.W
            self.n_c = amp * np.sin(2 * np.pi * self.s / (lam1 * 1.3) + ph3) * np.minimum(1.0, self.s / 3000.0)
        n2 = self.n[None, :] - self.n_c[:, None]                    # offset from channel axis
        an = np.abs(n2)
        half = 0.5 * self.floor_w[:, None]
        rise = cls["flat"] * an + wall_s[:, None] * np.maximum(an - half, 0.0)
        if ch_d > 0:
            x = np.clip(2 * n2 / ch_w, -1, 1)
            rise = rise - ch_d * (1 - x ** 2)
        # low-amplitude bed roughness (smooth, seeded) so the flow is not perfectly symmetric
        rough = np.zeros_like(rise)
        for _ in range(4):
            ls, ln = rng.uniform(1500, 5000), rng.uniform(max(200, 3 * self.dn), max(900, 0.2 * self.W))
            rough += rng.uniform(0.2, 0.7) * np.sin(2 * np.pi * self.s[:, None] / ls + rng.uniform(0, 6.28)) \
                * np.sin(2 * np.pi * self.n[None, :] / ln + rng.uniform(0, 6.28))
        scale = {"gorge": 0.6, "valley": 0.5, "plain": 0.3}[self.cls]
        self.z = self.zt[:, None] + rise + scale * rough
        self.z_source = "parametric"
        if use_dem:
            self._try_dem()
        # injection section (dam outlet): channel cells at s ~ 0
        self.inj_cols = 2
        # clip very wide valley floor in injection to channel
        self.inj_width = float(min(self.floor_w[0], ov.get("inj_width", 1e9)))

        self._stations(dam)

    # ------------------------------------------------------------------------------------
    def _try_dem(self):
        path = os.path.join(DEM_DIR, "%s.tif" % self.dam_id)
        if not os.path.exists(path):
            return
        try:
            import rasterio
        except ImportError:
            print("[terrain] rasterio not installed - using parametric valley")
            return
        try:
            with rasterio.open(path) as src:
                band = src.read(1).astype(float)
                nodata = src.nodata
                e = self.ce[:, None] + self.ne[:, None] * self.n[None, :]
                nn = self.cn[:, None] + self.nn_[:, None] * self.n[None, :]
                lat, lng = self.proj.inv(e, nn)
                rows, cols = rasterio.transform.rowcol(src.transform, lng.ravel(), lat.ravel())
                rows = np.clip(np.array(rows), 0, band.shape[0] - 1)
                cols = np.clip(np.array(cols), 0, band.shape[1] - 1)
                z = band[rows, cols].reshape(lat.shape)
                if nodata is not None:
                    z[z == nodata] = np.nan
                if np.isnan(z).mean() > 0.2:
                    print("[terrain] DEM covers <80 %% of the grid - ignored")
                    return
                z = np.where(np.isnan(z), np.nanmean(z), z)
                # smooth to the cell size and make the dam toe the datum
                from scipy.ndimage import uniform_filter
                z = uniform_filter(z, size=3)
                self.z = z - z[0, self.nn // 2]
                self.z_source = "DEM:" + os.path.basename(path)
        except Exception as exc:                    # pragma: no cover
            print("[terrain] DEM sampling failed (%s) - using parametric valley" % exc)

    # ------------------------------------------------------------------------------------
    def to_latlng(self, s, n):
        """s,n (metres, arrays of same shape) -> lat, lng (bilinear along the centre-line)"""
        s = np.asarray(s, float); n = np.asarray(n, float)
        f = np.clip(s / self.ds - 0.5, 0, self.ns - 1.001)
        i0 = f.astype(int); w = f - i0
        ce = self.ce[i0] * (1 - w) + self.ce[i0 + 1] * w
        cn = self.cn[i0] * (1 - w) + self.cn[i0 + 1] * w
        ne = self.ne[i0] * (1 - w) + self.ne[i0 + 1] * w
        nn_ = self.nn_[i0] * (1 - w) + self.nn_[i0 + 1] * w
        mag = np.hypot(ne, nn_)
        e = ce + ne / mag * n
        no = cn + nn_ / mag * n
        # extend beyond the ends along the end tangent
        lo = s < 0.5 * self.ds
        if np.any(lo):
            e = np.where(lo, self.ce[0] - self.te[0] * (0.5 * self.ds - s) + self.ne[0] * n, e)
            no = np.where(lo, self.cn[0] - self.tn_[0] * (0.5 * self.ds - s) + self.nn_[0] * n, no)
        return self.proj.inv(e, no)

    def centerline_latlng(self, step_cells=2):
        idx = np.arange(0, self.ns, step_cells)
        lat, lng = self.proj.inv(self.ce[idx], self.cn[idx])
        return np.column_stack([lat, lng]), self.s[idx]

    def bed_sample(self, s, n):
        """bilinear bed elevation and gradient (dz/ds, dz/dn) at arbitrary (s,n)"""
        fs = np.clip(s / self.ds - 0.5, 0, self.ns - 1.001)
        fn = np.clip((n + 0.5 * self.nn * self.dn) / self.dn - 0.5, 0, self.nn - 1.001)
        i0 = fs.astype(int); j0 = fn.astype(int)
        a = fs - i0; b = fn - j0
        z = self.z
        z00, z10, z01, z11 = z[i0, j0], z[i0 + 1, j0], z[i0, j0 + 1], z[i0 + 1, j0 + 1]
        zz = z00 * (1 - a) * (1 - b) + z10 * a * (1 - b) + z01 * (1 - a) * b + z11 * a * b
        dzds = ((z10 - z00) * (1 - b) + (z11 - z01) * b) / self.ds
        dzdn = ((z01 - z00) * (1 - a) + (z11 - z10) * a) / self.dn
        return zz, dzds, dzdn

    # ------------------------------------------------------------------------------------
    def _stations(self, dam):
        st = []
        for name, la, lo in dam.get("stations", []):
            e, n = self.proj.fwd(la, lo)
            d = np.hypot(self.ce - e, self.cn - n)
            i = int(np.argmin(d))
            if d[i] < max(20000.0, 1.2 * self.W) and i > 2:
                st.append((name, float(self.s[i]), float(la), float(lo)))
        if not st:
            for frac in (0.1, 0.25, 0.5, 0.75, 0.95):
                s = frac * self.length
                la, lo = self.to_latlng(np.array([s]), np.array([0.0]))
                st.append(("%.0f km downstream" % (s / 1000.0), float(s), float(la[0]), float(lo[0])))
        self.stations = sorted(st, key=lambda x: x[1])

    def summary(self):
        return dict(ns=self.ns, nn=self.nn, ds=self.ds, dn=self.dn, length_km=self.length / 1000.0,
                    width_km=self.W / 1000.0, class_=self.cls, manning=self.manning,
                    path_source=self.path_source, z_source=self.z_source, cells=self.ns * self.nn)


if __name__ == "__main__":
    from dam_data import DAMS
    for k in ("tehri", "bhakra", "hirakud", "kosi", "south_lhonak"):
        v = Valley(k, DAMS[k])
        print(k, v.summary(), "stations:", [(n, round(s / 1000, 1)) for n, s, *_ in v.stations])

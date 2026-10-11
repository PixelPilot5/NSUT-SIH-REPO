"""
sph2d.py - depth-integrated (shallow-water) Smoothed Particle Hydrodynamics.

Each particle is a column of water carrying a fixed VOLUME V_p.  Depth is not stored; it is
obtained by kernel summation, exactly like density in ordinary SPH:

        h_i = sum_j V_p * W(|x_i - x_j|, hs_ij)                     (units: m3 / m2 = m)

Momentum (hydrostatic pressure p = g h^2 / 2 with "density" h  ->  p/h^2 = g/2):

        dv_i/dt = - g * V_p * sum_j grad_i W_ij          (pressure / water-surface slope)
                  - g * grad(z_bed)(x_i)                  (bed slope, sampled from the DEM/valley grid)
                  - sum_j V_p * Pi_ij * grad_i W_ij       (Monaghan artificial viscosity: shocks, bores)
                  - g n^2 |v| v / h^(4/3)                 (Manning friction, semi-implicit)

The smoothing length follows the local particle spacing, hs_i = eta*sqrt(V_p/h_i), so the
kernel widens in the thin flood front and narrows in deep water (variable-resolution SPH).
XSPH smoothing keeps the particle motion visually smooth.  The dam hydrograph Q(t) is
released as particles of equal volume at the dam outlet.

This is the standard "SPH-SWE" formulation (Wang & Liu 2000, Ata & Soulaimani 2005,
Vacondio et al. 2012) - a different numerical method from the grid solver, so the two
engines can be compared.
"""
import time
import numpy as np
from scipy.spatial import cKDTree

G = 9.81
SIGMA = 10.0 / (7.0 * np.pi)


def kernel(r, hs):
    q = r / hs
    f = np.where(q < 1.0, 1.0 - 1.5 * q * q + 0.75 * q ** 3, np.where(q < 2.0, 0.25 * (2.0 - q) ** 3, 0.0))
    return SIGMA / (hs * hs) * f


def dkernel(r, hs):
    q = r / hs
    f = np.where(q < 1.0, -3.0 * q + 2.25 * q * q, np.where(q < 2.0, -0.75 * (2.0 - q) ** 2, 0.0))
    return SIGMA / hs ** 3 * f


class SPH2D:
    def __init__(self, valley, t_q, q, duration_s, n_particles=2500, n_frames=72,
                 eta=1.3, alpha=0.6, xsph=0.5, cfl=0.35, gauges=None, seed=7):
        self.v = valley
        self.t_q = np.asarray(t_q, float)
        self.q = np.asarray(q, float)
        self.T = float(duration_s)
        self.N = int(n_particles)
        self.nf = n_frames
        self.eta, self.alpha, self.xsph, self.cfl = eta, alpha, xsph, cfl
        self.gauges = gauges or []              # list of s (metres)
        self.rng = np.random.default_rng(seed)
        tt = np.linspace(0, self.T, 4000)
        qq = np.interp(tt, self.t_q, self.q)
        vtot = float(np.trapezoid(qq, tt) if hasattr(np, "trapezoid") else np.trapz(qq, tt))
        self.V = max(vtot, 1.0) / self.N * 1.0005
        self.vtotal = vtot
        v = valley
        self.hs_lo = 0.6 * v.ds * 0.5 if False else 40.0
        self.hs_hi = 2500.0
        inj_w = float(np.clip(max(v.inj_width, 3 * v.dn), 3 * v.dn, 0.8 * v.W))
        self.inj_w = inj_w

    def Q_at(self, t):
        return float(np.interp(t, self.t_q, self.q))

    # ------------------------------------------------------------------------------------
    def _pairs(self, P, hs):
        """all (i,j) with |xi-xj| < hs_i + hs_j (each pair once, listed from the larger-hs particle)"""
        tree = cKDTree(P)
        lists = tree.query_ball_point(P, 2.0 * hs, workers=-1)
        counts = np.fromiter((len(x) for x in lists), dtype=np.int64, count=len(lists))
        if counts.sum() == 0:
            e = np.zeros(0, dtype=np.int64)
            return e, e, e.astype(float), e.astype(float), e.astype(float)
        ii = np.repeat(np.arange(len(P)), counts)
        jj = np.fromiter((k for x in lists for k in x), dtype=np.int64, count=int(counts.sum()))
        dx = P[ii, 0] - P[jj, 0]
        dy = P[ii, 1] - P[jj, 1]
        r = np.hypot(dx, dy)
        hij = 0.5 * (hs[ii] + hs[jj])
        keep = (ii != jj) & (r < 2.0 * hij) & ((hs[ii] > hs[jj]) | ((hs[ii] == hs[jj]) & (ii < jj)))
        return ii[keep], jj[keep], dx[keep], dy[keep], r[keep]

    def run(self, progress=None):
        v = self.v
        N, V = self.N, self.V
        s = np.zeros(N); n = np.zeros(N); vs = np.zeros(N); vn = np.zeros(N)
        hs = np.full(N, 300.0); h = np.zeros(N)
        alive = np.ones(N, bool)
        ne = 0
        carry = 0.0
        t = 0.0
        step = 0
        s_end = v.length - 1.5 * v.ds
        half_w = 0.5 * v.nn * v.dn - 1.5 * v.dn
        centre = v.n_c[0]
        n_man2 = v.manning ** 2
        frame_dt = self.T / (self.nf - 1)
        next_frame = 0.0
        F_s, F_n, F_h, F_v, F_t = [], [], [], [], []
        s_g = list(self.gauges)
        cross = {g: [] for g in s_g}              # (time, volume) crossing events
        g_depth = {g: [] for g in s_g}            # (time, max depth, max speed)
        next_g = 0.0
        g_dt = 60.0
        released = 0.0
        # depth-map support (coarse grid = the terrain grid itself)
        gs, gn = np.meshgrid(v.s, v.n, indexing="ij")
        gridP = np.column_stack([gs.ravel(), gn.ravel()])
        gtree = cKDTree(gridP)
        maxdepth = np.zeros(v.ns * v.nn)
        arrival = np.full(v.ns * v.nn, np.nan)
        t0 = time.time()
        last_rep = -1
        a_s = np.zeros(N); a_n = np.zeros(N)

        def snapshot():
            ss = np.full(N, np.nan); nn_ = np.full(N, np.nan); hh = np.full(N, np.nan); vv = np.full(N, np.nan)
            m = np.zeros(N, bool); m[:ne] = alive[:ne]
            ss[m] = s[m]; nn_[m] = n[m]; hh[m] = h[m]; vv[m] = np.hypot(vs[m], vn[m])
            F_s.append(ss.astype(np.float32)); F_n.append(nn_.astype(np.float32))
            F_h.append(hh.astype(np.float32)); F_v.append(vv.astype(np.float32)); F_t.append(t)

        zgrid = v.z.ravel()

        def depth_map():
            """Depth on the terrain grid from the particles.  The water-SURFACE elevation
            (bed + depth at each particle) is kernel-averaged (Shepard) and the grid bed is
            subtracted, so water cannot leak up valley walls through the kernel tail."""
            m = np.nonzero(alive[:ne])[0]
            if len(m) == 0:
                return np.zeros(v.ns * v.nn)
            P = np.column_stack([s[m], n[m]])
            zb, _, _ = v.bed_sample(s[m], n[m])
            wse = zb + h[m]
            lists = gtree.query_ball_point(P, 2.0 * hs[m], workers=-1)
            counts = np.fromiter((len(x) for x in lists), dtype=np.int64, count=len(lists))
            if counts.sum() == 0:
                return np.zeros(v.ns * v.nn)
            pi = np.repeat(np.arange(len(m)), counts)
            gj = np.fromiter((k for x in lists for k in x), dtype=np.int64, count=int(counts.sum()))
            rr = np.hypot(P[pi, 0] - gridP[gj, 0], P[pi, 1] - gridP[gj, 1])
            w = kernel(rr, hs[m][pi]) * hs[m][pi] ** 2          # dimensionless, particle-size neutral
            sw = np.bincount(gj, weights=w, minlength=v.ns * v.nn)
            sz = np.bincount(gj, weights=w * wse[pi], minlength=v.ns * v.nn)
            # a cell needs real particle support (not just a far kernel tail)
            support = np.bincount(gj, weights=(rr < hs[m][pi]).astype(float), minlength=v.ns * v.nn)
            W = np.where(sw > 1e-9, sz / np.maximum(sw, 1e-9), -1e9)
            d = np.maximum(W - zgrid, 0.0)
            d[support < 1] = 0.0
            return d

        while t < self.T - 1e-9:
            # ---------------- time step ----------------
            if ne > 1:
                c = np.sqrt(G * np.maximum(h[:ne], 0.05))
                sp = np.hypot(vs[:ne], vn[:ne])
                dt_c = self.cfl * np.min(np.where(alive[:ne], hs[:ne] / (c + sp + 1e-6), 1e9))
                dt = float(np.clip(dt_c, 0.05, 40.0))
            else:
                dt = 1.0
            dt = min(dt, self.T - t)
            if next_frame - t > 1e-9 and dt > next_frame - t:
                dt = next_frame - t

            # ---------------- emission ----------------
            qin = self.Q_at(t + 0.5 * dt)
            if qin > 0 and ne < N:
                carry += qin * dt / V
                k = int(carry)
                if k > 0:
                    k = min(k, N - ne)
                    carry -= k
                    hc = (qin * qin / (G * self.inj_w ** 2)) ** (1 / 3.0)
                    uc = float(np.sqrt(G * hc))
                    idx = np.arange(ne, ne + k)
                    strat = (np.arange(k) + self.rng.random(k)) / k - 0.5
                    n[idx] = centre + strat * self.inj_w
                    s[idx] = 0.6 * v.ds + self.rng.random(k) * uc * dt
                    vs[idx] = uc; vn[idx] = 0.0
                    hs[idx] = np.clip(self.eta * np.sqrt(V / max(hc, 0.5)), self.hs_lo, self.hs_hi)
                    h[idx] = hc
                    ne += k
                    released += k * V

            if ne >= 2:
                a = np.nonzero(alive[:ne])[0]
                na = len(a)
                P = np.column_stack([s[a], n[a]])
                hsa = hs[a]
                ii, jj, dx, dy, r = self._pairs(P, hsa)
                hij = 0.5 * (hsa[ii] + hsa[jj])
                W = kernel(r, hij)
                dW = dkernel(r, hij)
                rs = np.where(r > 1e-9, r, 1.0)
                ex, ey = dx / rs, dy / rs
                # depth by kernel summation (+ self contribution)
                hh = V * (SIGMA / hsa ** 2 + np.bincount(ii, W, na) + np.bincount(jj, W, na))
                h[a] = hh
                # pressure + viscosity pair accelerations
                gx, gy = dW * ex, dW * ey                      # grad_i W_ij
                vx_ij = vs[a][ii] - vs[a][jj]; vy_ij = vn[a][ii] - vn[a][jj]
                vr = vx_ij * dx + vy_ij * dy
                mu = hij * vr / (r * r + 0.01 * hij * hij)
                hbar = 0.5 * (hh[ii] + hh[jj])
                cbar = np.sqrt(G * hbar)
                pi_ = np.where(vr < 0, -self.alpha * cbar * mu / np.maximum(hbar, 1e-3), 0.0)
                coef = -V * (G + pi_)
                fx = coef * gx; fy = coef * gy
                ax = np.bincount(ii, fx, na) - np.bincount(jj, fx, na)
                ay = np.bincount(ii, fy, na) - np.bincount(jj, fy, na)
                # XSPH velocity correction
                wx = V / np.maximum(hbar, 1e-3) * W
                xs = -self.xsph * (np.bincount(ii, wx * vx_ij, na) - np.bincount(jj, wx * vx_ij, na))
                xn = -self.xsph * (np.bincount(ii, wx * vy_ij, na) - np.bincount(jj, wx * vy_ij, na))
                # bed slope
                zb, dzds, dzdn = v.bed_sample(s[a], n[a])
                ax -= G * dzds
                ay -= G * dzdn
                # integrate (semi-implicit Euler)
                vs[a] += dt * ax
                vn[a] += dt * ay
                spd = np.hypot(vs[a], vn[a])
                fr = 1.0 + dt * G * n_man2 * spd / np.maximum(hh, 0.05) ** (4.0 / 3.0)
                vs[a] /= fr; vn[a] /= fr
                s_old = s[a].copy()
                s[a] += dt * (vs[a] + xs)
                n[a] += dt * (vn[a] + xn)
                # new smoothing lengths (lagged one step)
                hs[a] = np.clip(self.eta * np.sqrt(V / np.maximum(hh, 1e-3)), self.hs_lo, self.hs_hi)
                # walls
                low = s[a] < 0.3 * v.ds
                s[a[low]] = 0.6 * v.ds - s[a[low]]; vs[a[low]] = np.abs(vs[a[low]])
                lat_hi = n[a] > half_w; lat_lo = n[a] < -half_w
                n[a[lat_hi]] = 2 * half_w - n[a[lat_hi]]; vn[a[lat_hi]] = -np.abs(vn[a[lat_hi]])
                n[a[lat_lo]] = -2 * half_w - n[a[lat_lo]]; vn[a[lat_lo]] = np.abs(vn[a[lat_lo]])
                # section crossings (for discharge at the stations)
                for g in s_g:
                    cr = (s_old < g) & (s[a] >= g)
                    if cr.any():
                        cross[g].append((t + dt, float(cr.sum()) * V))
                # outflow
                out = s[a] > s_end
                if out.any():
                    alive[a[out]] = False
                    s[a[out]] = s_end + 5.0e4 + 1.0e3 * a[out]
                    n[a[out]] = 0.0; vs[a[out]] = 0.0; vn[a[out]] = 0.0; h[a[out]] = 0.0
            t += dt
            step += 1

            # gauges: depth by kernel sum at section points
            if s_g and t >= next_g and ne > 3:
                next_g += g_dt
                a = np.nonzero(alive[:ne])[0]
                if len(a):
                    tree = cKDTree(np.column_stack([s[a], n[a]]))
                    for g in s_g:
                        pts = np.column_stack([np.full(25, g), np.linspace(-half_w, half_w, 25)])
                        res = tree.query_ball_point(pts, 2.0 * hs[a].max() * 0.5 + 1.0, workers=-1)
                        dep = 0.0
                        for k_, lst in enumerate(res):
                            if lst:
                                lst = np.array(lst)
                                rr = np.hypot(s[a][lst] - pts[k_, 0], n[a][lst] - pts[k_, 1])
                                hk = float((V * kernel(rr, hs[a][lst])).sum())
                                dep = max(dep, hk)
                        g_depth[g].append((t, dep))

            if t >= next_frame - 1e-6:
                snapshot()
                dm = depth_map()
                maxdepth = np.maximum(maxdepth, dm)
                newly = (dm > 0.5) & np.isnan(arrival)
                arrival[newly] = t
                next_frame += frame_dt
            if progress and int(100 * t / self.T) != last_rep:
                last_rep = int(100 * t / self.T)
                progress(t / self.T)

        if len(F_t) < self.nf:
            snapshot()
        # discharge at stations from crossing events (30 min trailing bins -> smoothed hydrograph)
        gq = {}
        for g in s_g:
            ev = np.array(cross[g]) if cross[g] else np.zeros((0, 2))
            if len(ev):
                bins = np.arange(0, self.T + 300, 300.0)
                vol, _ = np.histogram(ev[:, 0], bins=bins, weights=ev[:, 1])
                gq[g] = np.column_stack([0.5 * (bins[1:] + bins[:-1]), vol / 300.0])
            else:
                gq[g] = np.zeros((0, 2))
        return dict(t_frames=np.array(F_t), s=np.array(F_s), n=np.array(F_n), h=np.array(F_h), speed=np.array(F_v),
                    max_depth=maxdepth.reshape(v.ns, v.nn), arrival=arrival.reshape(v.ns, v.nn), V_p=V, N=N, emitted=ne, volume_released=released,
                    gauge_Q=gq, gauge_depth={g: np.array(d) for g, d in g_depth.items()},
                    steps=step, wall_s=time.time() - t0)

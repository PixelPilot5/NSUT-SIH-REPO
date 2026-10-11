"""
swe2d.py - depth-averaged 2D shallow-water solver on the curvilinear valley grid.

This is the "Delft3D-type" engine: the same governing equations and the same kind of
structured (curvilinear) grid that Delft3D-FLOW uses (depth-averaged mode), solved with a
finite-volume HLL scheme.  It is NOT the Delft3D executable - it is an independent
implementation of the same physics, written so it runs inside the FastAPI process.

  d h /dt   + d(hu)/ds + d(hv)/dn = S_in
  d(hu)/dt  + d(hu^2 + g h^2/2)/ds + d(huv)/dn = -g h dz/ds - g n^2 |u| u / h^(1/3)
  d(hv)/dt  + d(huv)/ds + d(hv^2 + g h^2/2)/dn = -g h dz/dn - g n^2 |u| v / h^(1/3)

Numerics: first-order Godunov/HLL fluxes, Audusse hydrostatic reconstruction (well-balanced,
positivity preserving, handles wet/dry fronts), semi-implicit Manning friction, CFL-limited
explicit time step.  Source hydrograph is injected as critical flow through the dam outlet.
"""
import time
import numpy as np

G = 9.81


def _hll(hL, unL, utL, hR, unR, utR, zL, zR, eps=1e-6):
    """HLL flux through interfaces with hydrostatic reconstruction.
    Returns flux of (h, h*un, h*ut) for left / right cells (they differ only in the
    normal-momentum well-balancing correction)."""
    zs = np.maximum(zL, zR)
    hLs = np.maximum(0.0, hL + zL - zs)
    hRs = np.maximum(0.0, hR + zR - zs)
    cL = np.sqrt(G * hLs)
    cR = np.sqrt(G * hRs)
    dryL = hLs <= eps
    dryR = hRs <= eps
    sL = np.minimum(unL - cL, unR - cR)
    sR = np.maximum(unL + cL, unR + cR)
    sL = np.where(dryL, unR - 2.0 * cR, sL)
    sR = np.where(dryL, unR + cR, sR)
    sL = np.where(dryR, unL - cL, sL)
    sR = np.where(dryR, unL + 2.0 * cL, sR)
    both = dryL & dryR
    sL = np.where(both, -1.0, sL)
    sR = np.where(both, 1.0, sR)

    qL = hLs * unL
    qR = hRs * unR
    FhL, FhR = qL, qR
    FnL = qL * unL + 0.5 * G * hLs * hLs
    FnR = qR * unR + 0.5 * G * hRs * hRs
    FtL, FtR = qL * utL, qR * utR

    denom = sR - sL
    a = np.where(sL >= 0, 1.0, np.where(sR <= 0, 0.0, sR / denom))
    b = np.where(sL >= 0, 0.0, np.where(sR <= 0, 1.0, -sL / denom))
    c = np.where((sL < 0) & (sR > 0), sL * sR / denom, 0.0)
    Fh = a * FhL + b * FhR + c * (hRs - hLs)
    Fn = a * FnL + b * FnR + c * (hRs * unR - hLs * unL)
    Ft = a * FtL + b * FtR + c * (hRs * utR - hLs * utL)
    corrL = 0.5 * G * (hL * hL - hLs * hLs)
    corrR = 0.5 * G * (hR * hR - hRs * hRs)
    return Fh, Fn + corrL, Fn + corrR, Ft


class SWE2D:
    def __init__(self, valley, t_q, q, duration_s, n_frames=72, hmin=0.02, cfl=0.8,
                 arrival_depth=0.5, gauges=None, h_cap=None):
        self.v = valley
        self.h_cap = h_cap            # reservoir head: water just below the dam cannot be deeper than this (m)
        self.t_q = np.asarray(t_q, float)
        self.q = np.asarray(q, float)
        self.T = float(duration_s)
        self.nf = n_frames
        self.hmin = hmin
        self.cfl = cfl
        self.arrival_depth = arrival_depth
        self.gauges = gauges or []          # list of s-indices
        v = valley
        self.z = v.z.copy()
        self.ns, self.nn = v.ns, v.nn
        self.n_man = v.manning
        # injection cells
        inj_w = float(np.clip(max(v.inj_width, 3 * v.dn), 3 * v.dn, 0.8 * v.W))
        centre = v.n_c[0]
        mask = np.abs(v.n - centre) <= inj_w / 2
        if mask.sum() < 3:
            j0 = int(np.argmin(np.abs(v.n - centre)))
            mask = np.zeros(self.nn, bool); mask[max(0, j0 - 1):j0 + 2] = True
        self.inj_mask = mask
        self.inj_w = mask.sum() * v.dn
        self.inj_cells = int(mask.sum()) * v.inj_cols

    def Q_at(self, t):
        return float(np.interp(t, self.t_q, self.q))

    def run(self, progress=None):
        v = self.v
        ns, nn, ds, dn = self.ns, self.nn, v.ds, v.dn
        z = self.z
        h = np.zeros((ns, nn))
        hu = np.zeros((ns, nn))
        hv = np.zeros((ns, nn))
        # padded bed (x: wall at dam / transmissive at the end, y: walls)
        zx = np.empty((ns + 2, nn)); zx[1:-1] = z; zx[0] = z[0]; zx[-1] = z[-1]
        zy = np.empty((ns, nn + 2)); zy[:, 1:-1] = z; zy[:, 0] = z[:, 0]; zy[:, -1] = z[:, -1]
        hmin = self.hmin
        t = 0.0
        step = 0
        frame_dt = self.T / (self.nf - 1)
        next_frame = 0.0
        frames_h, frames_s, frame_t = [], [], []
        hmax = np.zeros_like(h)
        smax = np.zeros_like(h)
        arrival = np.full(h.shape, np.nan)
        g_idx = list(self.gauges)
        g_rec = {i: [] for i in g_idx}
        vol_in = 0.0
        owed = 0.0                   # released volume waiting because the tailwater is at head level
        vol_out = 0.0
        t0 = time.time()
        wet_eps = 1e-3
        n_man2 = self.n_man ** 2
        inj = self.inj_mask
        n_inj_cols = v.inj_cols
        last_report = -1

        while t < self.T - 1e-9:
            wet = h > hmin
            hs = np.where(wet, h, 1.0)
            u = np.where(wet, hu / hs, 0.0)
            w = np.where(wet, hv / hs, 0.0)
            c = np.sqrt(G * h)
            smax_x = float(np.max(np.abs(u) + c))
            smax_y = float(np.max(np.abs(w) + c))
            # injection also sets a speed scale
            qin = self.Q_at(t)
            hc_in = (qin * qin / (G * self.inj_w ** 2)) ** (1 / 3.0) if qin > 0 else 0.0
            uc_in = np.sqrt(G * hc_in) if hc_in > 0 else 0.0
            smax_x = max(smax_x, uc_in + np.sqrt(G * hc_in)) if hc_in > 0 else smax_x
            dt = self.cfl / (max(smax_x, 1e-3) / ds + max(smax_y, 1e-3) / dn)
            dt = min(dt, 60.0, self.T - t)
            if dt > next_frame - t and next_frame - t > 1e-9:
                dt = next_frame - t

            # ---------------- x fluxes (s direction) ----------------
            hx = np.empty((ns + 2, nn)); ux = np.empty_like(hx); wx = np.empty_like(hx)
            hx[1:-1] = h; ux[1:-1] = u; wx[1:-1] = w
            hx[0] = h[0]; ux[0] = -u[0]; wx[0] = w[0]          # wall at dam face
            hx[-1] = h[-1]; ux[-1] = u[-1]; wx[-1] = w[-1]     # open end
            Fh, FnL, FnR, Ft = _hll(hx[:-1], ux[:-1], wx[:-1], hx[1:], ux[1:], wx[1:], zx[:-1], zx[1:])
            # ---------------- y fluxes (n direction) ----------------
            hy = np.empty((ns, nn + 2)); uy = np.empty_like(hy); wy = np.empty_like(hy)
            hy[:, 1:-1] = h; uy[:, 1:-1] = u; wy[:, 1:-1] = w
            hy[:, 0] = h[:, 0]; wy[:, 0] = -w[:, 0]; uy[:, 0] = u[:, 0]
            hy[:, -1] = h[:, -1]; wy[:, -1] = -w[:, -1]; uy[:, -1] = u[:, -1]
            Gh, GnL, GnR, Gt = _hll(hy[:, :-1], wy[:, :-1], uy[:, :-1], hy[:, 1:], wy[:, 1:], uy[:, 1:], zy[:, :-1], zy[:, 1:])

            vol_out += float(Fh[-1].sum()) * dn * dt
            h_new = h - dt / ds * (Fh[1:] - Fh[:-1]) - dt / dn * (Gh[:, 1:] - Gh[:, :-1])
            hu_new = hu - dt / ds * (FnL[1:] - FnR[:-1]) - dt / dn * (Gt[:, 1:] - Gt[:, :-1])
            hv_new = hv - dt / ds * (Ft[1:] - Ft[:-1]) - dt / dn * (GnL[:, 1:] - GnR[:, :-1])

            # ---------------- inflow source ----------------
            tm = t + 0.5 * dt
            qd = self.Q_at(tm)
            if qd > 0 or owed > 0:
                demand = qd * dt + owed
                sl = np.s_[0:n_inj_cols, :]
                block = h_new[sl]
                area = self.inj_cells * ds * dn
                dh = demand / area
                if self.h_cap is not None:
                    room = max(0.0, self.h_cap - float(block[:, inj].max()))
                    dh = min(dh, room)
                dV = dh * area
                owed = demand - dV
                if dV > 0:
                    q_act = dV / dt
                    hc = (q_act * q_act / (G * self.inj_w ** 2)) ** (1 / 3.0)
                    uc = np.sqrt(G * hc)
                    block[:, inj] += dh
                    h_new[sl] = block
                    mb = hu_new[sl]
                    mb[:, inj] += dh * uc
                    hu_new[sl] = mb
                    vol_in += dV

            h_new = np.maximum(h_new, 0.0)
            dry = h_new <= hmin
            hu_new[dry] = 0.0; hv_new[dry] = 0.0
            # ---------------- Manning friction (semi-implicit) ----------------
            hs2 = np.where(dry, 1.0, h_new)
            sp = np.sqrt((hu_new / hs2) ** 2 + (hv_new / hs2) ** 2)
            fric = 1.0 + dt * G * n_man2 * sp / np.power(hs2, 4.0 / 3.0)
            hu_new /= fric; hv_new /= fric
            hu_new[dry] = 0.0; hv_new[dry] = 0.0

            h, hu, hv = h_new, hu_new, hv_new
            t += dt
            step += 1

            # ---------------- diagnostics ----------------
            wet = h > hmin
            hmax = np.maximum(hmax, h)
            hs3 = np.where(wet, h, 1.0)
            spd = np.where(wet, np.hypot(hu, hv) / hs3, 0.0)
            smax = np.maximum(smax, spd)
            newly = wet & (h > self.arrival_depth) & np.isnan(arrival)
            if newly.any():
                arrival[newly] = t
            for gi in g_idx:
                col_h = h[gi]; col_hu = hu[gi]
                g_rec[gi].append((t, float(col_h.max()), float(spd[gi].max()), float(col_hu.sum() * dn)))

            if t >= next_frame - 1e-6:
                frames_h.append(h.astype(np.float32).copy())
                frames_s.append(spd.astype(np.float32).copy())
                frame_t.append(t)
                next_frame += frame_dt
            if progress and int(100 * t / self.T) != last_report:
                last_report = int(100 * t / self.T)
                progress(t / self.T)

        # ensure the very last frame exists
        if len(frames_h) < self.nf:
            frames_h.append(h.astype(np.float32).copy()); frames_s.append(spd.astype(np.float32).copy()); frame_t.append(t)
        mass_in_domain = float(h.sum() * ds * dn)
        err = abs(vol_in - vol_out - mass_in_domain) / max(vol_in, 1.0)
        return dict(
            t_frames=np.array(frame_t), depth=np.array(frames_h), speed=np.array(frames_s),
            max_depth=hmax, max_speed=smax, arrival=arrival,
            gauges={i: np.array(r) for i, r in g_rec.items()},
            mass=dict(unreleased_m3=owed, inflow_m3=vol_in, outflow_m3=vol_out, in_domain_m3=mass_in_domain, rel_error=err),
            steps=step, wall_s=time.time() - t0)

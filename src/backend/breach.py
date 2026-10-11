"""
breach.py - source hydrographs for dam failure / outburst scenarios.

This is the same two-step approach used in practice (HEC-RAS, BREACH, DAMBRK):
  1. a breach model gives Q(t) leaving the reservoir (this file);
  2. the 2D flood solvers (swe2d.py / sph2d.py) route that hydrograph downstream.

Reservoir drawdown is solved with a broad-crested trapezoidal-weir equation through a
breach that widens and deepens linearly over the failure time:
        Q = 1.7 * b * H^1.5 + 1.35 * z * H^2.5        (SI units)
Breach geometry / failure time come from:
  * Froehlich (2008)  B_ave = 0.27*Ko*Vw^0.32*hb^0.04 ;  tf = 63.2*sqrt(Vw/(g*hb^2))
    (embankment dams; Ko = 1.3 overtopping, 1.0 piping; z = 0.7 / 1.0)
  * concrete / masonry gravity and arch dams: partial or full monolith removal
    (fractions of crest length, failure times of minutes) - USBR (1988) / FERC practice.
  * Evans (1986) moraine / natural-dam outburst peak:  Qp = 0.72 * V^0.53
The empirical Froehlich (1995) peak  Qp = 0.607 * Vw^0.295 * hw^1.24  is returned as an
independent sanity check on the modelled peak.
"""
import math
import numpy as np
from dam_data import STORAGE_K

G = 9.81
EMBANKMENT = {"earthrock", "earth", "earth_composite", "rockfill_cfrd", "composite"}
GRAVITY = {"gravity"}
ARCH = {"arch"}


def froehlich_1995_peak(vw_m3, hw_m):  # SI units
    return 0.607 * vw_m3 ** 0.295 * hw_m ** 1.24


def froehlich_2008(vw_m3, hb_m, overtopping=True):
    ko = 1.3 if overtopping else 1.0
    b_ave = 0.27 * ko * vw_m3 ** 0.32 * hb_m ** 0.04
    tf = 63.2 * math.sqrt(vw_m3 / (G * hb_m ** 2))
    z = 0.7 if overtopping else 1.0
    return b_ave, tf, z


def evans_1986_peak(v_m3):
    return 0.72 * v_m3 ** 0.53


# scenario -> scaling of an observed *event* (for glacial lakes / debris / river breaches)
EVENT_SCALE = {
    "Full Dam Break": 1.0, "Partial Dam Break": 0.5, "Slow Water Release": 0.3,
    "River Blockage": 0.7, "Sudden Lake Outburst": 1.0, "Overtopping Failure": 0.6,
}


def _triangle(volume_m3, peak, t_peak_frac, t_end):
    """Triangular hydrograph with prescribed volume and peak."""
    t_base = 2.0 * volume_m3 / peak
    t_pk = t_peak_frac * t_base
    n = max(60, int(t_end / 30))
    t = np.linspace(0, t_end, n)
    q = np.where(t <= t_pk, peak * t / max(t_pk, 1.0),
                 np.maximum(0.0, peak * (t_base - t) / max(t_base - t_pk, 1.0)))
    return t, q


def _event_hydrograph(dam, scenario, t_end, overrides):
    ev = dam["event"]
    f = EVENT_SCALE.get(scenario, 1.0)
    notes = []
    if dam["kind"] == "river_breach":
        # river avulsion: flow diverted through the breach, ramping up as it widens
        base = ev["base_cms"] * f
        ramp_h = {"Slow Water Release": 36.0}.get(scenario, 12.0)
        n = 400
        t = np.linspace(0, t_end, n)
        q = base * np.minimum(1.0, (t / 3600.0) / ramp_h) ** 0.7
        q = np.where(t / 3600.0 > ev["hours"], q * np.maximum(0.0, 1 - (t / 3600.0 - ev["hours"]) / 12.0), q)
        vol = float(np.trapezoid(q, t)) if hasattr(np, "trapezoid") else float(np.trapz(q, t))
        notes.append("Embankment-breach avulsion: ~3,675 m3/s diverted through the breach (Kosi 2008 observed), scaled by scenario")
        return t, q, dict(mode="river_avulsion", Qp=float(q.max()), t_peak_s=float(t[q.argmax()]),
                          volume_mcm=vol / 1e6, scale=f, notes=notes)
    v0 = ev["volume_mcm"] * 1e6
    v = overrides.get("volume_mcm", None)
    v = v * 1e6 if v else v0 * f
    if ev.get("peak_cms"):
        qp = ev["peak_cms"] * (v / v0) ** 0.53
        notes.append("Peak discharge from the published event reconstruction, scaled with V^0.53")
    else:
        qp = evans_1986_peak(v)
        notes.append("Peak discharge from Evans (1986) Qp = 0.72 V^0.53")
    if scenario == "Slow Water Release":
        qp *= 0.4
        notes.append("Slow release: peak reduced to 40 % (extended hydrograph)")
    t, q = _triangle(v, qp, ev.get("shape", 0.3), max(t_end, 2.0 * v / qp * 1.05))
    return t, q, dict(mode="event_outburst", Qp=float(qp), t_peak_s=float(t[q.argmax()]),
                      volume_mcm=v / 1e6, scale=f, notes=notes)


def breach_hydrograph(dam, scenario, t_end_s, overrides=None):
    """Return (t_s, Q_cms, meta)."""
    overrides = overrides or {}
    if dam["kind"] in ("event_debris", "glacial_lake", "river_breach") and "event" in dam:
        return _event_hydrograph(dam, scenario, t_end_s, overrides)

    kind = dam["kind"]
    cls = dam["cls"]
    k = STORAGE_K[cls]
    H = float(dam["H"])
    L = float(dam["L"])
    Vg = float(overrides.get("volume_mcm") or dam["Vg"]) * 1e6
    hw = 0.92 * H                       # normal pool depth above thalweg
    notes = []

    if kind in EMBANKMENT:
        family = "embankment"
    elif kind in ARCH:
        family = "arch"
    else:
        family = "gravity"

    def V_of(h):
        return Vg * (max(h, 0.0) / hw) ** k

    def h_of(V):
        return hw * (max(V, 0.0) / Vg) ** (1.0 / k)

    # ---- scenario -> breach definition -------------------------------------------------
    sc = scenario
    tf = None; b_final = None; z = 1.0; r_inv = 0.0; overtop = True; spill_only = False
    h0 = hw
    if sc == "River Blockage":
        hd = float(np.clip(0.4 * H, 15.0, 60.0))
        Vg_b = V_of(hd)
        hw_b, Vw = hd, Vg_b
        b_ave, tf, z = froehlich_2008(Vw, hd, overtopping=True)
        b_final = b_ave
        r_inv = 0.3
        # replace the reservoir by the impounded lake behind the blockage
        Vg, hw, H = Vg_b, hd, hd / 0.92
        h0 = hd
        notes.append("Landslide/debris dam of %.0f m impounding %.1f MCM fails by overtopping (Froehlich 2008, Ko=1.3)" % (hd, Vg_b / 1e6))
    elif family == "embankment":
        hb = hw
        if sc == "Full Dam Break":
            b_final, tf, z = froehlich_2008(Vg, hb, True); r_inv = 0.0
            notes.append("Embankment overtopping breach to base (Froehlich 2008, Ko=1.3)")
        elif sc == "Partial Dam Break":
            r_inv = 0.35
            Vw = Vg * (1 - r_inv ** k); hb = hw * (1 - r_inv)
            b_final, tf, z = froehlich_2008(Vw, hb, False)
            notes.append("Piping breach, invert at 35 % of dam depth (Froehlich 2008, Ko=1.0)")
        elif sc == "Overtopping Failure":
            b_final, tf, z = froehlich_2008(Vg, hb, True); tf *= 1.5; r_inv = 0.1
            h0 = hw + 1.0
            notes.append("Overtopping with 1 m of head above pool; slower erosion (tf x1.5)")
        elif sc == "Slow Water Release":
            r_inv = 0.4
            Vw = Vg * (1 - r_inv ** k); hb = hw * (1 - r_inv)
            b_final, tf, z = froehlich_2008(Vw, hb, False); tf *= 4.0
            notes.append("Slow piping breach (tf x4), invert at 40 % depth")
        else:  # Sudden Lake Outburst
            b_final, tf, z = froehlich_2008(Vg, hb, True); b_final *= 1.3; tf *= 0.25; r_inv = 0.0
            notes.append("Rapid failure: Froehlich width x1.3, tf x0.25")
    else:
        # concrete / masonry gravity or arch
        frac_full = 0.9 if family == "arch" else 0.5
        z = 0.0
        if sc == "Full Dam Break":
            b_final = frac_full * L; tf = 300.0 if family == "arch" else 600.0; r_inv = 0.0
            notes.append("Sudden removal of %d %% of crest length, failure time %.0f s" % (frac_full * 100, tf))
        elif sc == "Partial Dam Break":
            b_final = 0.2 * L if family == "gravity" else 0.3 * L
            tf = 900.0; r_inv = 0.4
            notes.append("Loss of adjacent monoliths down to 40 % of dam height")
        elif sc == "Overtopping Failure":
            spill_only = True
            notes.append("Gravity/arch dam does not breach; flood = uncontrolled overflow (weir over crest)")
        elif sc == "Slow Water Release":
            b_final = 0.08 * L; tf = 3 * 3600.0; r_inv = 0.5
            notes.append("Progressive leakage / foundation failure, 3 h, down to 50 % depth")
        else:  # Sudden Lake Outburst
            b_final = 0.6 * L; tf = 240.0; r_inv = 0.0
            notes.append("Very rapid failure of 60 % of crest in 4 min")

    if b_final is not None:
        cap = 400.0 if sc == "River Blockage" else 0.9 * L
        if b_final > cap:
            notes.append("Breach width limited to %.0f m (crest length / valley width)" % cap)
            b_final = cap

    if overrides.get("breach_width"):
        b_final = float(overrides["breach_width"])
        notes.append("Breach width overridden by user: %.0f m" % b_final)

    # ---- time integration -------------------------------------------------------------------
    dt = 10.0
    n_max = int(t_end_s / dt) + 1
    t_arr = [0.0]
    q_arr = [0.0]
    vol = V_of(h0) if not spill_only else Vg
    if spill_only:
        head = float(min(4.0, max(1.5, 0.03 * H)))
        q_sp = 1.7 * L * head ** 1.5
        n = 200
        t = np.linspace(0, t_end_s, n)
        q = q_sp * np.minimum(1.0, t / 900.0)
        notes.append("Spill head %.1f m over %.0f m crest" % (head, L))
        meta = dict(mode="spill", Qp=float(q.max()), t_peak_s=float(t[q.argmax()]),
                    volume_mcm=float(np.trapezoid(q, t) / 1e6 if hasattr(np, "trapezoid") else np.trapz(q, t) / 1e6),
                    B=None, tf_s=None, notes=notes)
        meta["froehlich1995_Qp"] = froehlich_1995_peak(Vg, hw)
        return t, q, meta

    ib_f = r_inv * hw
    # breach bottom width is whatever is needed so that mean top width = b_final
    b_bot_f = max(1.0, b_final - z * (hw - ib_f))
    t = 0.0
    released = 0.0
    qp = 0.0
    for i in range(n_max):
        t += dt
        tau = min(1.0, max(0.02, t / tf))
        ib = h0 - (h0 - ib_f) * tau
        b = b_bot_f * tau
        h = h_of(vol) if vol > 0 else 0.0
        if spill_only:
            break
        Hh = max(0.0, h - ib)
        if Hh <= 0.01:
            q = 0.0
        else:
            q = 1.7 * b * Hh ** 1.5 + 1.35 * z * Hh ** 2.5
            # an opening cannot pass more than the instantaneous-dam-break (Ritter) limit
            q = min(q, (8.0 / 27.0) * math.sqrt(G) * (b + z * Hh) * Hh ** 1.5)
        dV = min(q * dt, max(0.0, vol - V_of(ib)))
        q = dV / dt
        vol -= dV
        released += dV
        t_arr.append(t); q_arr.append(q)
        qp = max(qp, q)
        if t > tf and q < 0.003 * qp:
            break
    t_arr = np.array(t_arr); q_arr = np.array(q_arr)
    if t_arr[-1] < t_end_s:
        t_arr = np.append(t_arr, t_end_s); q_arr = np.append(q_arr, 0.0)
    meta = dict(mode="breach", Qp=float(qp), t_peak_s=float(t_arr[q_arr.argmax()]),
                volume_mcm=released / 1e6, B=float(b_final), tf_s=float(tf), side_slope=z,
                invert_frac=r_inv, notes=notes,
                froehlich1995_Qp=float(froehlich_1995_peak(max(released, 1e5), hw)))
    return t_arr, q_arr, meta


if __name__ == "__main__":
    from dam_data import DAMS
    for did in ("tehri", "bhakra", "hirakud", "mullaperiyar", "south_lhonak", "kosi", "rishi_ganga"):
        t, q, m = breach_hydrograph(DAMS[did], "Full Dam Break", 6 * 3600)
        print("%-14s Qp=%9.0f m3/s  Froehlich95=%9.0f  V=%8.1f MCM  tpk=%.2f h  %s" % (
            did, m["Qp"], m.get("froehlich1995_Qp", float('nan')), m["volume_mcm"], m["t_peak_s"] / 3600, m["mode"]))

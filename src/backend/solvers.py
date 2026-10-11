"""
solvers.py - orchestration layer between FastAPI (main.py) and the physics engines.

  run_sph_simulation(...)      -> depth-integrated SPH  (sph2d.py)
  run_delft3d_simulation(...)  -> 2D shallow-water finite-volume, curvilinear grid (swe2d.py)

Both receive the SAME dam, scenario, terrain grid and source hydrograph (breach.py), so any
difference between them is a numerical-method difference - which is exactly what the
"compare SPH vs Delft3D" requirement asks for.

Return value is a compact JSON-serialisable dict that results.js animates directly:
  * SPH     -> per-frame particle positions (s, n) + depth, mapped to lat/lng in the browser
  * Delft3D -> per-frame depth / speed on the curvilinear grid (uint16 / uint8, base64)
Everything is deterministic (seeded) and cached on disk.
"""
import base64
import gzip
import hashlib
import json
import math
import os
import time
import zlib
import numpy as np

from dam_data import DAMS, SCENARIOS, resolve_dam, TERRAIN_CLASSES
from breach import breach_hydrograph, froehlich_1995_peak
from terrain import Valley
from swe2d import SWE2D
from sph2d import SPH2D

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
VERSION = "v4-opening-valleys"
N_FRAMES = 73
QUALITY = {"fast": 1200, "standard": 2200, "high": 4000}      # SPH particle budgets


# ----------------------------------------------------------------------------------------
def _b64(a):
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode("ascii")


def _custom_dam(custom):
    """Custom reservoir at an arbitrary point (UI 'Custom Coordinates' mode)."""
    lat, lng = float(custom["lat"]), float(custom["lng"])
    cls = custom.get("terrain", "valley")
    H = float(custom.get("height_m", 45.0))
    Vg = float(custom.get("storage_mcm", 120.0))
    return dict(name=custom.get("name", "Custom reservoir"), key="custom", lat=lat, lng=lng, river="Custom waterway",
                kind=custom.get("kind", "earth"), H=H, L=float(custom.get("crest_m", 600.0)), Vg=Vg, cls=cls,
                slope=tuple(custom.get("slope", (0.002, 0.001, 30))), path=None,
                bearing=float(custom.get("bearing", 180.0)), reach_km=float(custom.get("reach_km", 80.0)),
                conf="assumed", stations=[], src="user-defined point; every parameter is an assumption")


def choose_duration_h(dam, meta):
    if dam["kind"] == "river_breach":
        return 72.0
    if meta["mode"] == "event_outburst":
        return 8.0
    tpk = meta["t_peak_s"] / 3600.0
    return float(np.clip(math.ceil((2.0 * tpk + 4.0) * 2) / 2.0, 6.0, 24.0))


def prepare_case(dam_id=None, dam_name=None, scenario="Full Dam Break", custom=None, overrides=None):
    overrides = overrides or {}
    if custom and custom.get("lat") is not None and not dam_id:
        dam, did = _custom_dam(custom), "custom_%d" % (zlib.crc32(("%s,%s" % (custom["lat"], custom["lng"])).encode()) % 10 ** 6)
    else:
        did, dam = resolve_dam(dam_id, dam_name)
        if dam is None:
            raise KeyError("Unknown dam '%s'. Use /api/dams for the catalogue." % (dam_id or dam_name))
    if scenario not in SCENARIOS:
        low = (scenario or "").lower()
        scenario = next((s for s in SCENARIOS if low.split()[0] in s.lower()), "Full Dam Break") if low else "Full Dam Break"
    # first pass with a long window to learn the peak time, then fix the duration
    _, _, meta0 = breach_hydrograph(dam, scenario, 24 * 3600.0, overrides)
    D = choose_duration_h(dam, meta0) * 3600.0
    t_q, q, meta = breach_hydrograph(dam, scenario, D, overrides)
    valley = Valley(did, dam, overrides=overrides)
    return dict(did=did, dam=dam, scenario=scenario, valley=valley, t_q=t_q, q=q, meta=meta, D=D)


# ----------------------------------------------------------------------------------------
def _extent_geojson(valley, maxd, thr=0.1):
    wet = maxd > thr
    rows = np.nonzero(wet.any(axis=1))[0]
    if len(rows) < 2:
        return None, 0.0
    left, right, srow = [], [], []
    for i in rows:
        js = np.nonzero(wet[i])[0]
        left.append(valley.n[js.max()] + 0.5 * valley.dn)
        right.append(valley.n[js.min()] - 0.5 * valley.dn)
        srow.append(valley.s[i])
    srow = np.array(srow)
    # close the polygon at the dam face and the flood front
    s_all = np.concatenate([srow, srow[::-1]])
    n_all = np.concatenate([left, right[::-1]])
    lat, lng = valley.to_latlng(s_all, n_all)
    ring = [[round(float(b), 6), round(float(a), 6)] for a, b in zip(lat, lng)]
    ring.append(ring[0])
    area = float(wet.sum() * valley.ds * valley.dn / 1e6)
    return dict(type="Feature", properties=dict(threshold_m=thr),
                geometry=dict(type="Polygon", coordinates=[ring])), area


def _geometry(valley):
    lat, lng = valley.to_latlng(valley.s, np.zeros_like(valley.s))
    lat1, lng1 = valley.to_latlng(valley.s, np.ones_like(valley.s))     # +1 m to the left
    return dict(ds=valley.ds, dn=valley.dn, ns=valley.ns, nn=valley.nn, n0=float(valley.n[0]),
                lat=_b64(np.asarray(lat, np.float64)), lng=_b64(np.asarray(lng, np.float64)),
                dlat=_b64(np.asarray(lat1 - lat, np.float64)), dlng=_b64(np.asarray(lng1 - lng, np.float64)),
                length_km=valley.length / 1000.0, width_km=valley.W / 1000.0)


def _terrain_payload(valley, max_cells=60000):
    ss = max(1, int(math.ceil(valley.ns / 220)))
    sn = max(1, int(math.ceil(valley.nn / 64)))
    z = valley.z[::ss, ::sn].astype(np.float32)
    return dict(stride_s=ss, stride_n=sn, ns=z.shape[0], nn=z.shape[1], z=_b64(z), z_min=float(z.min()), z_max=float(z.max()))


def _common(case, model, engine, extra_diag):
    dam, meta, v = case["dam"], case["meta"], case["valley"]
    q = case["q"]; t = case["t_q"]
    k = np.linspace(0, len(t) - 1, min(len(t), 120)).astype(int)
    hyd = dict(t_h=[round(float(x) / 3600.0, 4) for x in t[k]], q=[round(float(x), 1) for x in q[k]])
    scen = dict(name=case["scenario"], mode=meta["mode"], notes=meta.get("notes", []),
                peak_discharge_cms=meta["Qp"], time_to_peak_min=meta["t_peak_s"] / 60.0,
                released_volume_mcm=meta["volume_mcm"], breach_width_m=meta.get("B"),
                failure_time_min=(meta["tf_s"] / 60.0 if meta.get("tf_s") else None),
                froehlich_1995_peak_cms=meta.get("froehlich1995_Qp"))
    damd = dict(id=case["did"], name=dam["name"], river=dam["river"], lat=dam["lat"], lng=dam["lng"], kind=dam["kind"],
                height_m=dam["H"], crest_m=dam["L"], storage_mcm=dam["Vg"], data_confidence=dam["conf"], source=dam["src"],
                terrain_class=dam["cls"], manning_n=v.manning)
    return dict(status="completed_real_run", version=VERSION, model=model, engine=engine, dam=damd, scenario=scen,
                hydrograph=hyd, duration_h=case["D"] / 3600.0, grid=_geometry(v), terrain=_terrain_payload(v),
                terrain_info=dict(source=v.z_source, **v.summary()),
                diagnostics=extra_diag)


def _station_table_swe(case, res):
    v = case["valley"]
    out = []
    for name, s, la, lo in v.stations:
        gi = min(int(s / v.ds), v.ns - 1)
        a = res["gauges"].get(gi)
        if a is None or len(a) == 0:
            continue
        wet = np.nonzero(a[:, 1] > 0.5)[0]
        if len(wet) == 0:
            out.append(dict(name=name, s_km=s / 1000, lat=la, lng=lo, arrival_min=None, peak_depth_m=0.0,
                            time_to_peak_min=None, peak_q_cms=0.0, peak_speed_ms=0.0))
            continue
        ip = int(np.argmax(a[:, 1]))
        out.append(dict(name=name, s_km=s / 1000, lat=la, lng=lo, arrival_min=float(a[wet[0], 0] / 60),
                        peak_depth_m=float(a[:, 1].max()), time_to_peak_min=float(a[ip, 0] / 60),
                        peak_q_cms=float(a[:, 3].max()), peak_speed_ms=float(a[:, 2].max())))
    return out


def _station_table_sph(case, res):
    v = case["valley"]
    out = []
    for name, s, la, lo in v.stations:
        d = res["gauge_depth"].get(s)
        q = res["gauge_Q"].get(s)
        if d is None or len(d) == 0 or d[:, 1].max() < 0.5:
            out.append(dict(name=name, s_km=s / 1000, lat=la, lng=lo, arrival_min=None, peak_depth_m=0.0,
                            time_to_peak_min=None, peak_q_cms=0.0, peak_speed_ms=None))
            continue
        wet = np.nonzero(d[:, 1] > 0.5)[0]
        ip = int(np.argmax(d[:, 1]))
        pq = float(q[:, 1].max()) if q is not None and len(q) else None
        out.append(dict(name=name, s_km=s / 1000, lat=la, lng=lo, arrival_min=float(d[wet[0], 0] / 60),
                        peak_depth_m=float(d[:, 1].max()), time_to_peak_min=float(d[ip, 0] / 60),
                        peak_q_cms=pq, peak_speed_ms=None))
    return out


def _summary(case, maxd, arrival, peak_speed, stations, extra=None):
    v = case["valley"]
    gj, area = _extent_geojson(v, maxd, 0.1)
    cell = v.ds * v.dn / 1e6
    hi = float((maxd > 3.0).sum() * cell)
    mod = float(((maxd > 1.0) & (maxd <= 3.0)).sum() * cell)
    low = float(((maxd > 0.1) & (maxd <= 1.0)).sum() * cell)
    edge = bool((maxd[:, :2] > 0.1).any() or (maxd[:, -2:] > 0.1).any())
    arr_front = None
    if np.isfinite(arrival).any():
        wet_cols = np.nonzero(np.isfinite(arrival).any(axis=1))[0]
        i_last = wet_cols.max()
        arr_front = float(np.nanmin(arrival[i_last]) / 60.0)
    first = [s["arrival_min"] for s in stations if s["arrival_min"] is not None]
    summ = dict(max_depth_m=float(maxd.max()), peak_speed_ms=float(peak_speed), flooded_area_km2=area,
                risk_area_km2=dict(high=hi, moderate=mod, low=low),
                flood_reach_km=float(v.s[np.nonzero((maxd > 0.1).any(axis=1))[0].max()] / 1000) if (maxd > 0.1).any() else 0.0,
                domain_limited=edge, front_arrival_min=arr_front,
                first_station_arrival_min=(min(first) if first else None))
    if extra:
        summ.update(extra)
    return summ, gj


# ----------------------------------------------------------------------------------------
def _cache_key(case, model, quality, overrides):
    key = json.dumps([VERSION, case["did"], case["scenario"], model, quality, overrides or {},
                      case["dam"]["H"], case["dam"]["Vg"], case["dam"]["lat"], case["dam"]["lng"]], sort_keys=True)
    return hashlib.md5(key.encode()).hexdigest()


def _cache_get(k):
    p = os.path.join(CACHE_DIR, k + ".json.gz")
    if os.path.exists(p):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            return json.load(f)
    return None


def _cache_put(k, obj):
    os.makedirs(CACHE_DIR, exist_ok=True)
    with gzip.open(os.path.join(CACHE_DIR, k + ".json.gz"), "wt", encoding="utf-8") as f:
        json.dump(obj, f)


# ----------------------------------------------------------------------------------------
def run_delft3d_simulation(dam_name=None, discharge_volume=None, breach_width=None, scenario="Full Dam Break",
                           dam_id=None, custom=None, overrides=None, quality="standard", progress=None,
                           use_cache=True, _case=None):
    overrides = dict(overrides or {})
    case = _case or prepare_case(dam_id, dam_name, scenario, custom, overrides)
    key = _cache_key(case, "Delft3D", quality, overrides)
    if use_cache:
        hit = _cache_get(key)
        if hit:
            hit["diagnostics"]["from_cache"] = True
            return hit
    v = case["valley"]
    gauges = [min(int(s / v.ds), v.ns - 1) for _, s, _, _ in v.stations]
    sw = SWE2D(v, case["t_q"], case["q"], case["D"], n_frames=N_FRAMES, gauges=gauges, h_cap=0.95 * case["dam"]["H"])
    res = sw.run(progress)
    stations = _station_table_swe(case, res)
    summ, gj = _summary(case, res["max_depth"], res["arrival"], res["max_speed"].max(), stations,
                        dict(mass_balance_error=res["mass"]["rel_error"]))
    d_cm = np.clip(np.round(res["depth"] * 100.0), 0, 65534).astype(np.uint16)
    d_cm[res["depth"] < 0.02] = 0
    s_ds = np.clip(np.round(res["speed"] * 5.0), 0, 255).astype(np.uint8)
    arr_min = np.where(np.isfinite(res["arrival"]), np.clip(np.round(res["arrival"] / 60.0), 0, 65534), 65535).astype(np.uint16)
    out = _common(case, "Delft3D", "Depth-averaged 2D shallow-water equations, HLL finite-volume on a curvilinear river-fitted grid "
                  "(Delft3D-FLOW-type physics; independent implementation)",
                  dict(steps=res["steps"], wall_s=res["wall_s"], mass=res["mass"], cells=v.ns * v.nn, from_cache=False))
    out.update(
        frame_times_h=[round(float(x) / 3600.0, 4) for x in res["t_frames"]],
        frames=dict(n=int(len(res["t_frames"])), ns=v.ns, nn=v.nn, depth_cm=_b64(d_cm), speed_0p2ms=_b64(s_ds)),
        max_depth_cm=_b64(np.clip(np.round(res["max_depth"] * 100), 0, 65534).astype(np.uint16)),
        arrival_min=_b64(arr_min),
        stations=stations, summary=summ, extent_geojson=gj,
        metrics={  # keys used by the older frontend
            "peak_discharge_velocity": "%.2f m/s" % summ["peak_speed_ms"],
            "max_water_depth": "%.2f meters" % summ["max_depth_m"],
            "estimated_arrival_time": "%.2f hours" % ((summ["first_station_arrival_min"] or summ["front_arrival_min"] or 0) / 60.0),
            "grid_cells_computed": "%d curvilinear cells" % (v.ns * v.nn),
            "solver_algorithm": "2D SWE, HLL finite volume, hydrostatic reconstruction, Manning friction"})
    if use_cache:
        _cache_put(key, out)
    return out


def run_sph_simulation(dam_name=None, discharge_volume=None, breach_width=None, scenario="Full Dam Break",
                       dam_id=None, custom=None, overrides=None, quality="standard", progress=None,
                       use_cache=True, _case=None):
    overrides = dict(overrides or {})
    case = _case or prepare_case(dam_id, dam_name, scenario, custom, overrides)
    key = _cache_key(case, "SPH", quality, overrides)
    if use_cache:
        hit = _cache_get(key)
        if hit:
            hit["diagnostics"]["from_cache"] = True
            return hit
    v = case["valley"]
    sp = SPH2D(v, case["t_q"], case["q"], case["D"], n_particles=QUALITY.get(quality, QUALITY["standard"]),
               n_frames=N_FRAMES, gauges=[s for _, s, _, _ in v.stations])
    res = sp.run(progress)
    hcap = 0.95 * case["dam"]["H"]                       # water below the dam cannot be deeper than the reservoir head
    res["max_depth"] = np.minimum(res["max_depth"], hcap)
    res["h"] = np.minimum(res["h"], hcap)
    stations = _station_table_sph(case, res)
    # peak speed: 99.5th percentile of particle speeds (single particles can spike at the bore front)
    spd = res["speed"][np.isfinite(res["speed"])]
    peak_speed = float(np.percentile(spd, 99.5)) if spd.size else 0.0
    arrival = np.where(np.isfinite(res["arrival"]), res["arrival"], np.nan)
    summ, gj = _summary(case, res["max_depth"], arrival, peak_speed, stations,
                        dict(particles=res["N"], particle_volume_m3=res["V_p"], particles_released=res["emitted"]))
    h_cm = np.where(np.isfinite(res["h"]), np.clip(np.round(res["h"] * 100), 0, 65534), 65535).astype(np.uint16)
    arr_min = np.where(np.isfinite(arrival), np.clip(np.round(arrival / 60.0), 0, 65534), 65535).astype(np.uint16)
    out = _common(case, "SPH", "Depth-integrated Smoothed Particle Hydrodynamics (variable smoothing length, Manning friction, "
                  "artificial viscosity, XSPH)",
                  dict(steps=res["steps"], wall_s=res["wall_s"], particles=res["N"], particle_volume_m3=res["V_p"], from_cache=False))
    out.update(
        frame_times_h=[round(float(x) / 3600.0, 4) for x in res["t_frames"]],
        particles=dict(n=res["N"], frames=int(len(res["t_frames"])), s=_b64(res["s"].astype(np.float32)),
                       n_lat=_b64(res["n"].astype(np.float32)), depth_cm=_b64(h_cm),
                       speed_0p2ms=_b64(np.clip(np.round(np.nan_to_num(res["speed"]) * 5.0), 0, 255).astype(np.uint8))),
        max_depth_cm=_b64(np.clip(np.round(res["max_depth"] * 100), 0, 65534).astype(np.uint16)),
        arrival_min=_b64(arr_min),
        stations=stations, summary=summ, extent_geojson=gj,
        metrics={
            "peak_discharge_velocity": "%.2f m/s" % summ["peak_speed_ms"],
            "max_water_depth": "%.2f meters" % summ["max_depth_m"],
            "estimated_arrival_time": "%.2f hours" % ((summ["first_station_arrival_min"] or summ["front_arrival_min"] or 0) / 60.0),
            "particle_count_simulated": res["N"],
            "solver_algorithm": "Depth-integrated SPH (SPH-SWE), cubic-spline kernel, variable smoothing length"})
    if use_cache:
        _cache_put(key, out)
    return out


def run_both(dam_name=None, scenario="Full Dam Break", dam_id=None, custom=None, overrides=None, quality="standard", progress=None):
    case = prepare_case(dam_id, dam_name, scenario, custom, overrides)
    sph = run_sph_simulation(scenario=scenario, quality=quality, overrides=overrides, _case=case,
                             progress=(lambda f: progress(0.5 * f)) if progress else None)
    dft = run_delft3d_simulation(scenario=scenario, quality=quality, overrides=overrides, _case=case,
                                 progress=(lambda f: progress(0.5 + 0.5 * f)) if progress else None)
    return dict(comparison=True, sph=sph, delft3d=dft)

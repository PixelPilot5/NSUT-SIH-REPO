"""
jobs.py - tiny in-process job manager so the browser never waits on one long HTTP request.

  start_job(params)  -> job_id      (returns immediately; solver runs in a worker thread)
  get_status(job_id) -> dict(state, progress, message, error)
  get_result(job_id) -> the solver JSON (or None)

Identical requests share one job (and the on-disk cache in solvers.py makes repeat runs
instant), so refreshing the page or opening the results page twice does not re-run anything.
"""
import hashlib
import json
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor

import solvers

_EXEC = ThreadPoolExecutor(max_workers=2)
_JOBS = {}
_LOCK = threading.Lock()
MAX_JOBS = 40


def _signature(p):
    return hashlib.md5(json.dumps(p, sort_keys=True, default=str).encode()).hexdigest()


def _run(job_id, p):
    job = _JOBS[job_id]
    try:
        job["state"] = "running"
        model = (p.get("model") or "SPH").upper()
        kw = dict(dam_id=p.get("dam_id"), dam_name=p.get("dam_name"), scenario=p.get("scenario") or "Full Dam Break",
                  custom=p.get("custom"), overrides=p.get("overrides") or {}, quality=p.get("quality") or "standard")

        def prog(f):
            job["progress"] = max(job["progress"], min(0.99, float(f)))

        job["message"] = "Building terrain and breach hydrograph"
        case = solvers.prepare_case(kw["dam_id"], kw["dam_name"], kw["scenario"], kw["custom"], kw["overrides"])
        job["case_info"] = dict(dam=case["dam"]["name"], scenario=case["scenario"], peak_cms=case["meta"]["Qp"])
        both = not (("SPH" in model) or ("DELFT" in model))
        if both:
            job["message"] = "Running SPH, then Delft3D-type solver"
            out = dict(comparison=True)
            out["sph"] = solvers.run_sph_simulation(_case=case, quality=kw["quality"], overrides=kw["overrides"],
                                                    scenario=kw["scenario"], progress=lambda f: prog(0.5 * f))
            out["delft3d"] = solvers.run_delft3d_simulation(_case=case, quality=kw["quality"], overrides=kw["overrides"],
                                                            scenario=kw["scenario"], progress=lambda f: prog(0.5 + 0.5 * f))
        elif "SPH" in model:
            job["message"] = "Running SPH solver"
            out = solvers.run_sph_simulation(_case=case, quality=kw["quality"], overrides=kw["overrides"],
                                             scenario=kw["scenario"], progress=prog)
        else:
            job["message"] = "Running Delft3D-type solver"
            out = solvers.run_delft3d_simulation(_case=case, quality=kw["quality"], overrides=kw["overrides"],
                                                 scenario=kw["scenario"], progress=prog)
        job["result"] = out
        job["progress"] = 1.0
        job["state"] = "done"
        job["message"] = "Completed"
    except Exception as exc:                                    # surfaced to the UI
        job["state"] = "error"
        job["error"] = "%s: %s" % (type(exc).__name__, exc)
        job["trace"] = traceback.format_exc()
    finally:
        job["finished"] = time.time()


def start_job(params):
    sig = _signature(params)
    with _LOCK:
        for jid, j in _JOBS.items():
            if j["sig"] == sig and j["state"] in ("queued", "running", "done"):
                return jid
        if len(_JOBS) >= MAX_JOBS:                              # drop oldest finished jobs
            for jid in sorted(_JOBS, key=lambda k: _JOBS[k]["created"]):
                if _JOBS[jid]["state"] in ("done", "error"):
                    del _JOBS[jid]
                if len(_JOBS) < MAX_JOBS:
                    break
        jid = uuid.uuid4().hex[:12]
        _JOBS[jid] = dict(sig=sig, state="queued", progress=0.0, message="Queued", error=None, result=None,
                          created=time.time(), params=params)
    _EXEC.submit(_run, jid, params)
    return jid


def get_status(jid):
    j = _JOBS.get(jid)
    if not j:
        return None
    return dict(job_id=jid, state=j["state"], progress=round(j["progress"], 4), message=j["message"],
                error=j["error"], info=j.get("case_info"), elapsed_s=round(time.time() - j["created"], 1))


def get_result(jid):
    j = _JOBS.get(jid)
    return None if not j else j["result"]

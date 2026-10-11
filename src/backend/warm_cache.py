"""
warm_cache.py - pre-compute simulations so the demo is instant (results are cached in backend/cache/).

    python warm_cache.py                          # the 6 showcase dams x Full Dam Break x both models
    python warm_cache.py tehri bhakra             # chosen dams
    python warm_cache.py --all-scenarios tehri    # every scenario for the chosen dams
"""
import sys
import time
import solvers
from dam_data import SCENARIOS

SHOWCASE = ["tehri", "bhakra", "hirakud", "mullaperiyar", "south_lhonak", "rishi_ganga", "kosi", "teesta"]


def main(argv):
    all_sc = "--all-scenarios" in argv
    ids = [a for a in argv if not a.startswith("--")] or SHOWCASE
    for did in ids:
        for sc in (SCENARIOS if all_sc else ["Full Dam Break"]):
            t = time.time()
            case = solvers.prepare_case(did, None, sc)
            solvers.run_sph_simulation(_case=case, scenario=sc)
            solvers.run_delft3d_simulation(_case=case, scenario=sc)
            print("%-14s %-22s done in %5.0fs  (Qp %.0f m3/s)" % (did, sc, time.time() - t, case["meta"]["Qp"]), flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])

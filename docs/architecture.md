# Architecture

Suraksha-Setu is a browser app with a Python (FastAPI) backend. The browser never waits on one long request: a simulation runs as a background job and the page polls its progress.

## 1. System overview

```text
 Browser (HTML / CSS / JavaScript, Bootstrap, Leaflet)
 ├─ Home, Simulation, Results, Impact Analysis, Reports, Live Flood Monitor
 │
 │  REST / JSON
 ▼
 FastAPI backend  (src/backend/main.py)
 ├─ /api/dams, /api/scenarios      dam catalogue and breach scenarios
 ├─ /api/jobs                      start a simulation, poll status, fetch result
 └─ /api/live-monitor              Sentinel-1 flood metrics for a basin
        │                                   │
        ▼                                   ▼
 jobs.py  (background job queue)     Google Earth Engine
        │                            (Sentinel-1 SAR change detection)
        ▼
 solvers.py  (orchestration + on-disk cache in backend/cache/)
        │
        ├─ dam_data.py   real dam parameters and sources
        ├─ breach.py     breach hydrograph: weir equation + Froehlich 2008 breach width and time
        ├─ terrain.py    valley grid along the river centre-line, shared by both solvers
        ├─ sph2d.py      depth-integrated SPH solver
        └─ swe2d.py      2D shallow-water finite-volume solver on a curvilinear grid (Delft3D-type)
```

## 2. Components

**Frontend** (`src/frontend`): static pages with no build step. It stores the running job and its result in the browser (`localStorage`), draws the flood on a Leaflet map, and builds the impact analysis and every export in the browser.

**Backend** (`src/backend`): FastAPI. `main.py` exposes the API. `jobs.py` runs each simulation in a worker thread and shares one job between identical requests. `solvers.py` connects the API to the physics and caches finished runs on disk, so preset cases open instantly.

**Hydrodynamic models**: both models get the same dam, scenario, terrain grid and source hydrograph, so any difference between them comes from the numerical method.

- SPH: each particle carries a fixed water volume, and depth comes from kernel summation.
- Delft3D-type grid solver: depth-averaged shallow-water equations, finite-volume HLL scheme, on a curvilinear valley grid. It is our own implementation of the same physics, not the Delft3D program.

**Impact analysis** (`frontend/js/exposure.js`, `analysis.js`): combines the simulated flood extent with Census 2011 population density to estimate people, buildings, roads, bridges, schools and health facilities, and cropland. Results are rounded ranges, not survey counts.

**Reports** (`frontend/js/reports.js`): PDF (print view), Excel (.xlsx), GeoJSON and KML, all built in the browser from the same result that the analysis page shows.

**Live Flood Monitor**: the map is our published Google Earth Engine app, embedded in the page. The backend computes the flooded area from Sentinel-1 radar and derives the other impact figures from it. If Earth Engine is not authenticated on the machine running the backend, it falls back to saved or reference values instead of failing.

## 3. Data flow

```text
Choose dam or custom point  ->  choose scenario  ->  POST /api/jobs
        |
        v
breach hydrograph (breach.py)  ->  terrain grid (terrain.py)
        |
        +--> SPH (sph2d.py)  ------+
        |                          +--> result JSON (cached) --> browser
        +--> grid solver (swe2d.py)+
                                          |
                                          v
        flood map, depth and speed, arrival times, impact analysis, reports
```

## 4. Design choices

- One shared hydrograph and terrain for both solvers, so the two models can be compared fairly.
- Background jobs plus an on-disk cache, so the demo stays responsive.
- No database and no build step: the app runs with `python server.py` and a static file server.
- Custom coordinates use assumed default dam parameters, and the results page labels them as assumed.

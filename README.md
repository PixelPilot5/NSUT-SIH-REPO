# Suraksha-Setu: Smart Flood Intelligence

Dam-break flood simulation and live flood monitoring for Indian dams.

- **Simulation:** pick a dam or a custom point, choose a breach scenario, and run two independent hydrodynamic models, a particle-based SPH solver and a Delft3D-type grid solver.
- **Flood impact analysis:** flooded area, depths, arrival times, and estimated exposure (people, buildings, roads, bridges, schools and health facilities, cropland).
- **Reports:** download PDF, Excel, GeoJSON and KML files built from the simulation you ran.
- **Live Flood Monitor:** near-real-time satellite flood mapping using Google Earth Engine.

## Project structure

    backend/    FastAPI server, SPH and grid solvers, breach model, terrain, job queue
    frontend/   HTML, CSS and JavaScript (Bootstrap and Leaflet)

## Run locally

### 1. Backend

    cd backend
    python -m venv venv
    venv\Scripts\activate          # Windows
    # source venv/bin/activate     # macOS / Linux
    pip install -r requirements.txt
    python server.py               # starts the API on http://127.0.0.1:8000

### 2. Frontend

Open the `frontend` folder in VS Code, install the **Live Server** extension, then right-click `index.html` and choose **Open with Live Server**.

Keep the backend running while you use the website.

## Notes

- Simulations for the preset dams use real dam parameters. Custom coordinates use assumed default dam parameters, which the results page labels as such.
- Impact figures are screening-level estimates (Census 2011 density), shown as rounded ranges, not survey counts.
- Results are cached in `backend/cache/` after the first run.
- The live map is our published Google Earth Engine app and works for everyone. The six impact figures below it are computed through Earth Engine and need an Earth Engine login. On a machine without one, the backend falls back to built-in reference values for each basin, so those figures are not live there. A recording of the live version is in the demo video.

## Tech stack

Python, FastAPI, NumPy, SciPy, Google Earth Engine, HTML, CSS, JavaScript, Bootstrap, Leaflet.

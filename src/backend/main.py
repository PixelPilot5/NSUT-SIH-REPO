import datetime
import hashlib
import json
import os
from typing import Optional, Dict, Any
from fastapi import FastAPI, Depends, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import numpy as np

import jobs
import solvers
from dam_data import DAMS, SCENARIOS, resolve_dam
from solvers import run_sph_simulation, run_delft3d_simulation


class SimulationRequest(BaseModel):
    dam_name: Optional[str] = None
    dam_id: Optional[str] = None                 # e.g. "tehri" (preferred; the frontend DAM_PRESETS id)
    scenario: str = "Full Dam Break"
    model_type: str = "SPH"                      # "SPH" | "Delft3D" | "Both"
    quality: str = "standard"                    # "fast" | "standard" | "high"  (SPH particle budget)
    # Legacy fields. The old frontend always sent 50 MCM / 120 m, which would overwrite the real
    # reservoir data, so they are ONLY honoured when override_physical is true.
    discharge_volume: Optional[float] = None     # MCM
    breach_width: Optional[float] = None         # m
    override_physical: bool = False
    custom: Optional[Dict[str, Any]] = None      # custom point: lat, lng, name, height_m, storage_mcm, terrain, ...


try:
    import ee
except ImportError:                              # Earth Engine is optional for the simulation endpoints
    ee = None

# ---------------------------------------------------------
# INITIALIZE GOOGLE EARTH ENGINE SDK
# ---------------------------------------------------------
GEE_READY = False
try:
    if ee is None:
        raise RuntimeError("earthengine-api is not installed")
    # Judges use their own Earth Engine project: set the EE_PROJECT environment variable.
    ee.Initialize(project=os.environ.get("EE_PROJECT", "gee-live-flood-monitoring"))
    GEE_READY = True
    print("Google Earth Engine initialized successfully.")
except Exception as e:
    print("GEE Initialization notice (Run `earthengine authenticate` if required):", e)
    print("Live Flood Monitor will use the saved snapshot (backend/live_snapshot.json) instead.")


# Creating app
app = FastAPI(
    title="FloodSim API",
    description="Backend API for the FloodSim Dam Break Inundation Modelling Platform",
    version="1.0.0"
)


# Adding middleware to properly communicate with frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# ---------------------------------------------------------
# CATCHMENT BASINS & DAM LOCATIONS (38 INDIAN BASINS)
# ---------------------------------------------------------
DAM_LOCATIONS = {
    # NORTHERN REGION
    'Tehri Dam (Uttarakhand)': {'bbox': [78.25, 30.12, 78.55, 30.45], 'center': [30.38, 78.48], 'zoom': 11},
    'Rishi Ganga / Tapovan (Uttarakhand)': {'bbox': [79.50, 30.42, 79.72, 30.56], 'center': [30.49, 79.62], 'zoom': 12},
    'Dhauliganga Dam (Uttarakhand)': {'bbox': [80.35, 29.85, 80.70, 30.10], 'center': [29.97, 80.53], 'zoom': 11},
    'Bhakra Dam (Himachal Pradesh)': {'bbox': [76.20, 31.18, 76.55, 31.48], 'center': [31.41, 76.43], 'zoom': 11},
    'Pong Dam / Beas (Himachal Pradesh)': {'bbox': [75.80, 31.85, 76.15, 32.10], 'center': [31.97, 75.95], 'zoom': 11},
    'Baglihar Dam (Jammu & Kashmir)': {'bbox': [75.15, 33.05, 75.50, 33.30], 'center': [33.16, 75.32], 'zoom': 11},
    'Uri Dam (Jammu & Kashmir)': {'bbox': [73.90, 34.00, 74.20, 34.25], 'center': [34.14, 74.04], 'zoom': 11},
    'Ranjit Sagar / Thein Dam (Punjab / J&K)': {'bbox': [75.55, 32.30, 75.90, 32.60], 'center': [32.44, 75.73], 'zoom': 11},
    'Rihand Dam (Uttar Pradesh)': {'bbox': [82.90, 24.10, 83.25, 24.55], 'center': [24.21, 83.03], 'zoom': 10},

    # EASTERN & NORTH-EASTERN REGION
    'Teesta River / Dam (Sikkim / WB)': {'bbox': [88.30, 26.45, 88.85, 27.18], 'center': [27.12, 88.48], 'zoom': 10},
    'South Lhonak Lake (Sikkim GLOF)': {'bbox': [88.05, 27.80, 88.35, 28.05], 'center': [27.91, 88.18], 'zoom': 12},
    'Kosi River Basin (Bihar)': {'bbox': [86.40, 25.30, 87.15, 26.60], 'center': [26.52, 86.93], 'zoom': 9},
    'Subansiri Lower Dam (Arunachal / Assam)': {'bbox': [94.10, 27.40, 94.45, 27.70], 'center': [27.55, 94.26], 'zoom': 11},
    'Hirakud Dam (Odisha)': {'bbox': [83.70, 20.80, 84.10, 21.60], 'center': [21.53, 83.87], 'zoom': 10},
    'Rengali Dam (Odisha)': {'bbox': [84.85, 21.10, 85.20, 21.40], 'center': [21.27, 85.03], 'zoom': 11},
    'Maithon Dam (Jharkhand / WB)': {'bbox': [86.70, 23.65, 86.95, 23.85], 'center': [23.78, 86.81], 'zoom': 12},
    'Panchet Dam (Jharkhand / WB)': {'bbox': [86.60, 23.55, 86.90, 23.80], 'center': [23.68, 86.77], 'zoom': 11},

    # WESTERN & CENTRAL REGION
    'Sardar Sarovar Dam (Gujarat)': {'bbox': [73.00, 21.60, 73.82, 21.90], 'center': [21.83, 73.75], 'zoom': 10},
    'Ukai Dam (Gujarat)': {'bbox': [72.80, 21.10, 73.65, 21.30], 'center': [21.24, 73.58], 'zoom': 10},
    'Kadana Dam (Gujarat)': {'bbox': [73.65, 23.15, 74.00, 23.45], 'center': [23.31, 73.83], 'zoom': 11},
    'Koyna Dam (Maharashtra)': {'bbox': [73.65, 17.22, 74.20, 17.48], 'center': [17.40, 73.76], 'zoom': 11},
    'Jayakwadi Dam (Maharashtra)': {'bbox': [75.15, 19.30, 75.60, 19.65], 'center': [19.48, 75.38], 'zoom': 10},
    'Ujani Dam (Maharashtra)': {'bbox': [74.55, 18.10, 75.05, 18.45], 'center': [18.29, 74.79], 'zoom': 10},
    'Indira Sagar Dam (Madhya Pradesh)': {'bbox': [76.10, 22.18, 77.05, 22.35], 'center': [22.28, 76.97], 'zoom': 10},
    'Gandhi Sagar Dam (Madhya Pradesh)': {'bbox': [75.30, 24.50, 75.75, 24.90], 'center': [24.71, 75.52], 'zoom': 10},
    'Barna Dam (Madhya Pradesh)': {'bbox': [77.90, 22.95, 78.20, 23.20], 'center': [23.08, 78.06], 'zoom': 11},
    'Bisalpur Dam (Rajasthan)': {'bbox': [75.25, 25.75, 75.65, 26.10], 'center': [25.93, 75.46], 'zoom': 11},
    'Rana Pratap Sagar (Rajasthan)': {'bbox': [75.40, 24.80, 75.75, 25.05], 'center': [24.93, 75.58], 'zoom': 11},

    # SOUTHERN REGION
    'Nagarjuna Sagar Dam (AP / Telangana)': {'bbox': [79.20, 16.45, 80.65, 16.65], 'center': [16.57, 79.31], 'zoom': 10},
    'Srisailam Dam (AP / Telangana)': {'bbox': [78.75, 15.95, 79.25, 16.35], 'center': [16.08, 78.89], 'zoom': 10},
    'Polavaram Dam (Andhra Pradesh)': {'bbox': [81.45, 17.10, 81.85, 17.40], 'center': [17.26, 81.65], 'zoom': 11},
    'Tungabhadra Dam (Karnataka)': {'bbox': [76.40, 15.20, 77.15, 15.95], 'center': [15.26, 76.53], 'zoom': 10},
    'Almatti Dam (Karnataka)': {'bbox': [75.75, 16.15, 76.50, 16.45], 'center': [16.33, 75.88], 'zoom': 10},
    'Krishnarajasagara / KRS Dam (Karnataka)': {'bbox': [76.40, 12.30, 76.75, 12.55], 'center': [12.42, 76.57], 'zoom': 11},
    'Mullaperiyar Dam (Kerala)': {'bbox': [77.00, 9.45, 77.22, 9.58], 'center': [9.53, 77.16], 'zoom': 12},
    'Idukki Dam (Kerala)': {'bbox': [76.80, 9.75, 77.05, 9.92], 'center': [9.85, 76.97], 'zoom': 12},
    'Mettur Dam (Tamil Nadu)': {'bbox': [77.65, 11.65, 77.95, 11.95], 'center': [11.80, 77.80], 'zoom': 11},
    'Bhavanisagar Dam (Tamil Nadu)': {'bbox': [76.95, 11.35, 77.30, 11.60], 'center': [11.47, 77.14], 'zoom': 11}
}





# ---------------------------------------------------------
# PRESET DAM METRICS METADATA BASELINES
# ---------------------------------------------------------
DAM_METRICS_BASELINES = {
    'Tehri Dam (Uttarakhand)': {'inundation': 48.5, 'pop_factor': 375, 'cropland_ratio': 25.5, 'road_ratio': 0.71, 'loss_ratio': 0.79, 'infra_factor': 8.6},
    'Rishi Ganga / Tapovan (Uttarakhand)': {'inundation': 14.2, 'pop_factor': 280, 'cropland_ratio': 12.0, 'road_ratio': 0.85, 'loss_ratio': 0.65, 'infra_factor': 12.0},
    'Dhauliganga Dam (Uttarakhand)': {'inundation': 22.8, 'pop_factor': 310, 'cropland_ratio': 18.5, 'road_ratio': 0.78, 'loss_ratio': 0.72, 'infra_factor': 9.5},
    'Bhakra Dam (Himachal Pradesh)': {'inundation': 92.4, 'pop_factor': 710, 'cropland_ratio': 55.4, 'road_ratio': 0.74, 'loss_ratio': 1.58, 'infra_factor': 9.6},
    'Pong Dam / Beas (Himachal Pradesh)': {'inundation': 78.6, 'pop_factor': 540, 'cropland_ratio': 48.2, 'road_ratio': 0.68, 'loss_ratio': 1.32, 'infra_factor': 8.8},
    'Baglihar Dam (Jammu & Kashmir)': {'inundation': 34.5, 'pop_factor': 420, 'cropland_ratio': 21.0, 'road_ratio': 0.62, 'loss_ratio': 0.88, 'infra_factor': 10.2},
    'Uri Dam (Jammu & Kashmir)': {'inundation': 28.1, 'pop_factor': 490, 'cropland_ratio': 19.4, 'road_ratio': 0.58, 'loss_ratio': 0.76, 'infra_factor': 11.4},
    'Ranjit Sagar / Thein Dam (Punjab / J&K)': {'inundation': 64.0, 'pop_factor': 680, 'cropland_ratio': 42.0, 'road_ratio': 0.79, 'loss_ratio': 1.24, 'infra_factor': 9.0},
    'Rihand Dam (Uttar Pradesh)': {'inundation': 110.5, 'pop_factor': 820, 'cropland_ratio': 68.0, 'road_ratio': 0.84, 'loss_ratio': 1.85, 'infra_factor': 8.2},

    # EASTERN & NORTH-EASTERN REGION
    'Teesta River / Dam (Sikkim / WB)': {'inundation': 64.2, 'pop_factor': 600, 'cropland_ratio': 44.2, 'road_ratio': 0.72, 'loss_ratio': 1.06, 'infra_factor': 9.0},
    'South Lhonak Lake (Sikkim GLOF)': {'inundation': 38.6, 'pop_factor': 340, 'cropland_ratio': 24.8, 'road_ratio': 0.65, 'loss_ratio': 0.78, 'infra_factor': 11.2},
    'Kosi River Basin (Bihar)': {'inundation': 215.6, 'pop_factor': 860, 'cropland_ratio': 85.3, 'road_ratio': 0.67, 'loss_ratio': 1.81, 'infra_factor': 11.1},
    'Subansiri Lower Dam (Arunachal / Assam)': {'inundation': 88.4, 'pop_factor': 480, 'cropland_ratio': 52.1, 'road_ratio': 0.59, 'loss_ratio': 1.15, 'infra_factor': 7.9},
    'Hirakud Dam (Odisha)': {'inundation': 185.0, 'pop_factor': 670, 'cropland_ratio': 67.0, 'road_ratio': 0.61, 'loss_ratio': 1.54, 'infra_factor': 10.0},
    'Rengali Dam (Odisha)': {'inundation': 94.3, 'pop_factor': 590, 'cropland_ratio': 54.0, 'road_ratio': 0.66, 'loss_ratio': 1.28, 'infra_factor': 8.5},
    'Maithon Dam (Jharkhand / WB)': {'inundation': 56.8, 'pop_factor': 740, 'cropland_ratio': 38.2, 'road_ratio': 0.81, 'loss_ratio': 1.12, 'infra_factor': 9.8},
    'Panchet Dam (Jharkhand / WB)': {'inundation': 62.4, 'pop_factor': 760, 'cropland_ratio': 41.5, 'road_ratio': 0.83, 'loss_ratio': 1.18, 'infra_factor': 9.5},

    # WESTERN & CENTRAL REGION
    'Sardar Sarovar Dam (Gujarat)': {'inundation': 142.8, 'pop_factor': 690, 'cropland_ratio': 62.3, 'road_ratio': 0.67, 'loss_ratio': 1.47, 'infra_factor': 9.4},
    'Ukai Dam (Gujarat)': {'inundation': 118.4, 'pop_factor': 720, 'cropland_ratio': 58.1, 'road_ratio': 0.73, 'loss_ratio': 1.39, 'infra_factor': 9.1},
    'Kadana Dam (Gujarat)': {'inundation': 72.5, 'pop_factor': 630, 'cropland_ratio': 49.0, 'road_ratio': 0.69, 'loss_ratio': 1.21, 'infra_factor': 8.7},
    'Koyna Dam (Maharashtra)': {'inundation': 52.4, 'pop_factor': 510, 'cropland_ratio': 33.6, 'road_ratio': 0.64, 'loss_ratio': 0.94, 'infra_factor': 8.9},
    'Jayakwadi Dam (Maharashtra)': {'inundation': 135.2, 'pop_factor': 780, 'cropland_ratio': 68.4, 'road_ratio': 0.72, 'loss_ratio': 1.62, 'infra_factor': 9.3},
    'Ujani Dam (Maharashtra)': {'inundation': 124.6, 'pop_factor': 750, 'cropland_ratio': 65.0, 'road_ratio': 0.70, 'loss_ratio': 1.55, 'infra_factor': 9.0},
    'Indira Sagar Dam (Madhya Pradesh)': {'inundation': 156.0, 'pop_factor': 580, 'cropland_ratio': 59.2, 'road_ratio': 0.63, 'loss_ratio': 1.41, 'infra_factor': 8.6},
    'Gandhi Sagar Dam (Madhya Pradesh)': {'inundation': 128.5, 'pop_factor': 560, 'cropland_ratio': 54.8, 'road_ratio': 0.65, 'loss_ratio': 1.35, 'infra_factor': 8.4},
    'Barna Dam (Madhya Pradesh)': {'inundation': 42.1, 'pop_factor': 490, 'cropland_ratio': 36.2, 'road_ratio': 0.61, 'loss_ratio': 0.87, 'infra_factor': 8.1},
    'Bisalpur Dam (Rajasthan)': {'inundation': 84.7, 'pop_factor': 530, 'cropland_ratio': 46.5, 'road_ratio': 0.68, 'loss_ratio': 1.14, 'infra_factor': 8.3},
    'Rana Pratap Sagar (Rajasthan)': {'inundation': 76.3, 'pop_factor': 510, 'cropland_ratio': 43.1, 'road_ratio': 0.66, 'loss_ratio': 1.08, 'infra_factor': 8.2},

    # SOUTHERN REGION
    'Nagarjuna Sagar Dam (AP / Telangana)': {'inundation': 168.4, 'pop_factor': 710, 'cropland_ratio': 64.0, 'road_ratio': 0.68, 'loss_ratio': 1.52, 'infra_factor': 9.2},
    'Srisailam Dam (AP / Telangana)': {'inundation': 129.2, 'pop_factor': 640, 'cropland_ratio': 51.2, 'road_ratio': 0.62, 'loss_ratio': 1.31, 'infra_factor': 8.8},
    'Polavaram Dam (Andhra Pradesh)': {'inundation': 175.5, 'pop_factor': 790, 'cropland_ratio': 71.3, 'road_ratio': 0.74, 'loss_ratio': 1.68, 'infra_factor': 10.4},
    'Tungabhadra Dam (Karnataka)': {'inundation': 114.0, 'pop_factor': 680, 'cropland_ratio': 59.4, 'road_ratio': 0.69, 'loss_ratio': 1.42, 'infra_factor': 8.9},
    'Almatti Dam (Karnataka)': {'inundation': 106.8, 'pop_factor': 660, 'cropland_ratio': 56.0, 'road_ratio': 0.67, 'loss_ratio': 1.36, 'infra_factor': 8.7},
    'Krishnarajasagara / KRS Dam (Karnataka)': {'inundation': 78.4, 'pop_factor': 820, 'cropland_ratio': 49.5, 'road_ratio': 0.82, 'loss_ratio': 1.25, 'infra_factor': 10.1},
    'Mullaperiyar Dam (Kerala)': {'inundation': 41.5, 'pop_factor': 920, 'cropland_ratio': 22.4, 'road_ratio': 0.78, 'loss_ratio': 0.95, 'infra_factor': 12.8},
    'Idukki Dam (Kerala)': {'inundation': 49.8, 'pop_factor': 880, 'cropland_ratio': 26.1, 'road_ratio': 0.76, 'loss_ratio': 1.05, 'infra_factor': 12.4},
    'Mettur Dam (Tamil Nadu)': {'inundation': 98.6, 'pop_factor': 810, 'cropland_ratio': 58.2, 'road_ratio': 0.77, 'loss_ratio': 1.45, 'infra_factor': 9.9},
    'Bhavanisagar Dam (Tamil Nadu)': {'inundation': 68.2, 'pop_factor': 740, 'cropland_ratio': 46.8, 'road_ratio': 0.71, 'loss_ratio': 1.18, 'infra_factor': 9.3}
}

@app.get("/api/locations")
def get_available_locations():
    """Returns the list of all available preset catchment basins."""
    return list(DAM_LOCATIONS.keys())

SNAPSHOT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "live_snapshot.json")


def _load_snapshot():
    """Saved real Earth Engine run (made with make_live_snapshot.py). Empty dict if the file is missing."""
    try:
        with open(SNAPSHOT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _gee_flooded_area(loc_data):
    """Sentinel-1 flooded area (km2) for a location box, or None when Earth Engine is not usable
    or no flood signal is found."""
    if not GEE_READY:
        return None
    try:
        geometry = ee.Geometry.Rectangle(loc_data['bbox'])
        s1 = (
            ee.ImageCollection("COPERNICUS/S1_GRD")
            .filterBounds(geometry)
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
            .filter(ee.Filter.eq("instrumentMode", "IW"))
            .select("VV")
        )

        # Using valid recent Sentinel-1 observation windows (2024 monsoon season)
        pre_flood = s1.filterDate("2024-05-01", "2024-06-30").mosaic()
        post_flood = s1.filterDate("2024-07-01", "2024-10-31").mosaic()

        diff = post_flood.subtract(pre_flood)
        flood_mask = (diff.lt(-3.0)) & (post_flood.lt(-12.0))

        pixel_area = ee.Image.pixelArea()
        flood_area_img = flood_mask.multiply(pixel_area).divide(1e6)

        stats = flood_area_img.reduceRegion(
            reducer=ee.Reducer.sum(),
            geometry=geometry,
            scale=100,
            maxPixels=1e8
        ).getInfo()

        if stats:
            calc_val = list(stats.values())[0]
            if calc_val is not None and calc_val > 0:
                return round(float(calc_val), 2)
    except Exception as e:
        print("Sentinel-1 GEE computation warning:", e)
    return None


def _metrics_from_area(location, inundation):
    """The six dashboard parameters. Only the flooded area is satellite-measured; the other five are
    screening estimates derived from it with per-basin ratios."""
    if location in DAM_METRICS_BASELINES:
        base = DAM_METRICS_BASELINES[location]
        population = int(inundation * base['pop_factor'])
        cropland = round(inundation * base['cropland_ratio'], 1)
        roads = round(inundation * base['road_ratio'], 1)
        loss = round(inundation * base['loss_ratio'], 2)
        infra = int(inundation * base['infra_factor'])
    else:
        population = int(inundation * 620 + 4500)
        cropland = round(inundation * 45.0, 1)
        roads = round(inundation * 0.68, 1)
        loss = round(inundation * 1.25, 2)
        infra = int(inundation * 9 + 400)
    return {
        "inundation_area": f"{inundation:,.1f} km²",
        "exposed_population": f"{population:,} People",
        "submerged_cropland": f"{cropland:,.1f} Hectares",
        "submerged_roads": f"{roads:,.1f} km",
        "agricultural_loss": f"₹ {loss:,.2f} Cr",
        "critical_infrastructure": f"{infra:,} Structures"
    }


def _reference_area(location):
    """Typical flooded area used only when neither live data nor a snapshot exists."""
    if location in DAM_METRICS_BASELINES:
        return DAM_METRICS_BASELINES[location]['inundation']
    seed_hash = int(hashlib.md5(location.encode('utf-8')).hexdigest(), 16)
    return round(35.0 + (seed_hash % 12000) / 100.0, 2)


@app.get("/api/live-monitor")
def compute_live_gee_metrics(
    location: str = Query(None, description="Preset Dam/River location name")
):
    """
    Flood analytics for preset locations from Sentinel-1 SAR (Google Earth Engine).
    The response says where the numbers came from (`source`):
      live       computed just now through Earth Engine
      snapshot   saved real run from backend/live_snapshot.json (Earth Engine not available here)
      reference  neither available: typical values for the basin, clearly not a measurement
    """
    center_coords = [20.5937, 78.9629]
    zoom_level = 10

    if not (location and location in DAM_LOCATIONS):
        return {
            "location": location or "Unknown Location",
            "center": center_coords,
            "zoom": zoom_level,
            "source": "unavailable",
            "gee_ready": GEE_READY,
            "metrics": {
                "inundation_area": "N/A",
                "exposed_population": "N/A",
                "submerged_cropland": "N/A",
                "submerged_roads": "N/A",
                "agricultural_loss": "N/A",
                "critical_infrastructure": "N/A"
            }
        }

    loc_data = DAM_LOCATIONS[location]
    out = {"location": location, "center": loc_data['center'], "zoom": loc_data['zoom'],
           "gee_ready": GEE_READY}

    area = _gee_flooded_area(loc_data)
    if area is not None:
        out.update(source="live", metrics=_metrics_from_area(location, area))
        return out

    snap = _load_snapshot()
    entry = (snap.get("locations") or {}).get(location)
    if entry:
        out.update(source="snapshot", snapshot_date=snap.get("generated_at"), metrics=entry["metrics"])
        return out

    out.update(source="reference", metrics=_metrics_from_area(location, _reference_area(location)))
    return out

# ---------------------------------------------------------
# DAM CATALOGUE + LOCATION (real parameters live in dam_data.py)
# ---------------------------------------------------------
def _flow_bearing(valley):
    """compass bearing (deg) of the river over the first ~10 km below the dam"""
    k = max(2, int(10000 / valley.ds))
    de, dn = valley.ce[k] - valley.ce[0], valley.cn[k] - valley.cn[0]
    return float((np.degrees(np.arctan2(de, dn)) + 360.0) % 360.0)


@app.get("/api/dams")
def list_dams():
    """Dams with real engineering parameters, source and data-confidence flag."""
    return [dict(id=k, name=d["name"], key=d["key"], lat=d["lat"], lng=d["lng"], river=d["river"], kind=d["kind"],
                 height_m=d["H"], crest_m=d["L"], storage_mcm=d["Vg"], data_confidence=d["conf"], source=d["src"],
                 has_flow_path=bool(d.get("path")), reference_event=("event" in d)) for k, d in DAMS.items()]


@app.get("/api/scenarios")
def list_scenarios():
    return SCENARIOS


@app.get("/api/dam-location")
def get_dam_location(dam_name: str = Query(None), dam_id: str = Query(None)):
    did, dam = resolve_dam(dam_id, dam_name)
    if dam is None:
        return {"found": False}
    case = solvers.prepare_case(did, None, "Full Dam Break")        # cheap: terrain + hydrograph only
    v = case["valley"]
    cl, _ = v.centerline_latlng(step_cells=3)
    return {"found": True, "id": did, "name": dam["name"], "center": [dam["lat"], dam["lng"]], "zoom": 10,
            "flow_bearing": _flow_bearing(v), "flow_path": [[float(a), float(b)] for a, b in cl],
            "path_source": v.path_source, "data_confidence": dam["conf"]}


# ---------------------------------------------------------
# SIMULATION API
# ---------------------------------------------------------
def _params(p: SimulationRequest):
    ov = {}
    if p.override_physical:
        if p.discharge_volume:
            ov["volume_mcm"] = float(p.discharge_volume)
        if p.breach_width:
            ov["breach_width"] = float(p.breach_width)
    return dict(dam_id=p.dam_id, dam_name=p.dam_name, scenario=p.scenario, model=p.model_type,
                quality=p.quality, custom=p.custom, overrides=ov)


@app.post("/api/jobs")
def start_simulation_job(payload: SimulationRequest):
    """Start a run and return immediately. Poll /api/jobs/{id}, then fetch /api/jobs/{id}/result."""
    prm = _params(payload)
    if not prm["custom"] and resolve_dam(prm["dam_id"], prm["dam_name"])[1] is None:
        raise HTTPException(404, "Unknown dam. See /api/dams for the catalogue.")
    return {"job_id": jobs.start_job(prm)}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    st = jobs.get_status(job_id)
    if st is None:
        raise HTTPException(404, "Unknown job id")
    return st


@app.get("/api/jobs/{job_id}/result")
def job_result(job_id: str):
    st = jobs.get_status(job_id)
    if st is None:
        raise HTTPException(404, "Unknown job id")
    if st["state"] == "error":
        raise HTTPException(500, st["error"])
    if st["state"] != "done":
        raise HTTPException(409, "Job not finished (state=%s)" % st["state"])
    return jobs.get_result(job_id)


@app.post("/api/simulate-model")
def trigger_hydrodynamic_simulation(payload: SimulationRequest):
    """Blocking variant (kept for compatibility / scripts). Prefer /api/jobs for the UI."""
    prm = _params(payload)
    m = (payload.model_type or "SPH").upper()
    try:
        case = solvers.prepare_case(prm["dam_id"], prm["dam_name"], prm["scenario"], prm["custom"], prm["overrides"])
    except KeyError as exc:
        raise HTTPException(404, str(exc))
    kw = dict(scenario=case["scenario"], quality=prm["quality"], overrides=prm["overrides"], _case=case)
    if "SPH" in m:
        return run_sph_simulation(**kw)
    if "DELFT" in m or "DFLT" in m:
        return run_delft3d_simulation(**kw)
    return {"comparison": True, "sph": run_sph_simulation(**kw), "delft3d": run_delft3d_simulation(**kw)}
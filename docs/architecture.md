# Architecture

## 1. System Overview

FLOODSIM is a modular flood-simulation and decision-support platform. The system connects a web interface, geospatial processing, backend services, hydrodynamic simulation, near-real-time remote sensing, and impact analysis.

```text
                         ┌─────────────────────┐
                         │       User          │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Web Frontend      │
                         │ Next.js / React     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Backend / API       │
                         │ FastAPI             │
                         └──────┬────────┬─────┘
                                │        │
                    ┌───────────┘        └──────────────┐
                    ▼                                   ▼
          ┌──────────────────┐                 ┌──────────────────┐
          │ PostgreSQL +     │                 │ Simulation /     │
          │ PostGIS          │                 │ Data Services    │
          └──────────────────┘                 └───────┬──────────┘
                                                       │
                              ┌────────────────────────┼────────────────────┐
                              ▼                        ▼                    ▼
                    ┌─────────────────┐      ┌─────────────────┐  ┌─────────────────┐
                    │ SPH / Delft3D  │      │ Google Earth    │  │ Impact Analysis │
                    │ Simulation      │      │ Engine /        │  │                 │
                    │                 │      │ Remote Sensing  │  │                 │
                    └────────┬────────┘      └────────┬────────┘  └────────┬────────┘
                             │                        │                    │
                             └────────────────────────┼────────────────────┘
                                                      ▼
                                             ┌─────────────────┐
                                             │ GIS / Results   │
                                             │ Processing      │
                                             └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │ Maps, Analysis, │
                                             │ Comparison &    │
                                             │ Reports         │
                                             └─────────────────┘
```

## 2. Core Components

### Frontend
- Next.js / React
- Provides navigation, scenario configuration, simulation status, results, impact analysis, live monitoring, comparison, and reports.
- Displays GIS outputs and communicates with the backend through APIs.

### Backend
- FastAPI with Python.
- Provides APIs for study areas, datasets, simulations, results, impact analysis, users, and reports.
- Coordinates requests between the frontend, database, processing services, and simulation pipeline.

### Database
- PostgreSQL with PostGIS.
- Stores application data and geospatial entities such as rivers, dams, study areas, datasets, simulations, and impact results.

### GIS / Geospatial Processing
- MapLibre GL JS or Leaflet for map visualization.
- GeoJSON for vector exchange.
- GeoPandas, Shapely, Rasterio, GDAL, and PyProj for geospatial processing.
- Consumes simulation outputs such as flood extent, depth, velocity, arrival time, and water level.

### Hydrodynamic Simulation
- Uses the project's SPH and/or Delft3D modelling workflow.
- Inputs can include DEM, river/dam information, hydrological data, initial water conditions, discharge, breach parameters, and simulation configuration.
- Produces flood-related spatial outputs for downstream GIS visualization and analysis.

### Near-Real-Time Monitoring
- Google Earth Engine processes open remote-sensing data such as Sentinel and Landsat imagery.
- Supports water/flood detection, change detection, and flood-extent generation.
- Results are passed to the backend and presented through the live-monitoring interface.

### Impact Analysis
- Overlays flood/simulation results with exposure layers.
- Can analyse affected population, buildings, roads, bridges, hospitals, schools, and agricultural areas.
- Uses GeoPandas, PostGIS, Shapely, Rasterio, Pandas, and NumPy.

## 3. Data Flow

```text
Study Area / Data
       │
       ▼
Scenario Configuration
       │
       ▼
Backend
       │
       ▼
Pre-processing
       │
       ├──────────────► SPH / Delft3D ──────► Simulation Results
       │
       └──────────────► GEE / Remote Sensing ─► Flood Monitoring

Simulation / Monitoring Results
       │
       ▼
GIS Processing
       │
       ▼
Impact Analysis
       │
       ▼
Frontend
       │
       ├── Flood Maps
       ├── Depth / Velocity / Arrival Time
       ├── Impact Statistics
       ├── Comparison
       └── Reports / Export
```

## 4. Key Design Principle

The architecture is divided by technical responsibility rather than by individual pages. The backend acts as the integration layer, while GIS provides a common spatial representation for simulation, monitoring, and impact results.

Integration should be validated incrementally: first frontend–API–database, then study-area mapping, mock simulation results, real simulation output, impact analysis, and finally near-real-time GEE integration.

## 1. Project Information

- **Project Title:** Suraksha-Setu : An Automated Flash Flood Simulation, Hydrodynamic Modeling & HADR Decision-Support Platform
- **PS ID:** 26161
- **PS Title:** Dam Break Inundation Modelling Using Hydrodynamic Modelling of any River
- **Category:** Software
- **Theme:** Disaster Management

## 2. Problem Statement

In India, catastrophic natural disaster events frequently form temporary natural dams and glacial lake blockages—such as the Rishi Ganga incident (2021), Wapriyang river blockage (2021), Phuktal river formation (2015), and Kosi river surge (2008). In critical dam-break or sudden water release scenarios, downstream catchments suffer severe inundation, loss of human life, and destruction of infrastructure.

Existing disaster response mechanisms lack unified software tools capable of rapidly simulating complex water flows, comparing hydrodynamic models, integrating satellite data, and generating actionable Humanitarian Assistance and Disaster Relief (HADR) impact reports for decision-makers.

## 3. Proposed Solution

Suraksha-Setu is an integrated geospatial simulation and emergency response platform designed for dam-break analysis and flash flood forecasting. Using hydrological datasets, Digital Elevation Models (DEMs), and satellite imagery, the tool automates water flow modeling across Indian river basins.

The platform executes parallel hydrodynamic simulations via Smooth Particle Hydrodynamics (SPH) and Delft3D, comparing scenario outcomes in real time. Combined with satellite-based surveillance through Google Earth Engine (GEE), the platform delivers early inundation warnings, automated loss-and-damage metrics, and GIS exports (.shp / .kml) for ground-level disaster management teams.

## 4. Key Features

- **Dual Hydrodynamic Simulation Engine**: Automated scenario comparison using Smooth Particle Hydrodynamics (SPH) and Delft3D solvers.
- **Near-Real-Time Satellite Surveillance**: Automated surface water and flood extent detection using Google Earth Engine (GEE) and Sentinel-1/2 imagery.
- **Interactive 3D GIS Visualization**: Multi-layered spatial mapping rendering water depth, velocity vectors, wave arrival times, and river/dam boundary polygons.
- **Automated HADR Loss & Damage Analytics**: Spatial intersection engine evaluating population exposure, damaged building footprints, submerged road networks, and affected agricultural zones.
- **Standardized GIS File Exports**: One-click conversion of inundation scenarios into ESRI Shapefile (.shp) and Keyhole Markup Language (.kml) layers.
- **Automated HADR Executive Briefings**: Dynamic PDF generation summarizing critical risk classifications, high-density hazard zones, and recommended logistics rerouting.

## 5. Technology Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, Recharts
- GIS & Mapping: MapLibre GL JS, Leaflet, GeoJSON, PostGIS, GDAL, Rasterio, PyProj
- Backend & API: Python, FastAPI, PostgreSQL, PostGIS, Redis, Celery, Docker
- Hydrodynamic Modeling: Smooth Particle Hydrodynamics (SPH), Delft3D, NumPy, SciPy
- Remote Sensing & Satellite: Google Earth Engine (GEE API), Sentinel-1/2 SAR, Landsat, GeoPandas
- Impact Analytics & PDF Engine: GeoPandas, Shapely, OpenStreetMap (OSMnx), ReportLab

## 6. Architecture

See [docs/architecture.md](docs/architecture.md).

```text
Input Layer (DEM, Hydro Data, Satellite Imagery)
  |
  v
Data Processing & Feature Extraction
  |
  +----> SPH Model Engine
  |        |
  |        v
  |     Simulation Output
  |
  +----> DELFT3D Model Engine
  |        |
  |        v
  |     Simulation Output
  |
  v
Comparative Analysis & Post-Processing
  |
  v
Dashboard & Visualization Layer
  |
  v
Output Export (.shp, .KML, .tif)
```

## 7. Repository Structure

```
NSUT-SIH-REPO/
├── src/                  # Backend (FastAPI, models, services)
├── frontend/             # Next.js + React frontend
├── tests/                # Unit & integration tests
├── data/                 # Sample geospatial datasets
├── docs/                 # Architecture, API reference
├── scripts/              # Automation & setup scripts
├── notebooks/            # Jupyter exploratory analysis
├── submission/           # SIH submission materials
└── config/               # Configuration files
```

---
 
## 📦 Installation
 
### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+ with PostGIS
- GDAL/PROJ libraries
### Quick Start
 
#### 1. Clone & Setup Environment
```bash
git clone https://github.com/PixelPilot5/NSUT-SIH-REPO.git
cd NSUT-SIH-REPO
 
# Copy environment template
cp .env.example .env
 
# Update .env with your credentials
# - Database credentials
# - Google Earth Engine API key
# - Redis URL
```
 
#### 2. Backend Setup
 
**Using Docker (Recommended):**
```bash
docker-compose up -d
```
 
Services will start:
- Backend API: `http://localhost:8000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Nginx: `http://localhost:80`
**Manual Setup:**
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
 
# Install dependencies
pip install -r requirements.txt
 
# Initialize database
python scripts/setup_db.py
 
# Load sample data
python scripts/seed_sample_data.py
 
# Start FastAPI server
uvicorn src.main:app --reload
 
# In separate terminal: Start Celery worker
celery -A src.tasks worker --loglevel=info
 
# In another terminal: Start Celery Beat
celery -A src.tasks beat --loglevel=info
```
 
#### 3. Frontend Setup
 
```bash
cd frontend
 
# Install dependencies
npm install
 
# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
 
# Start development server
npm run dev
```
 
Visit: `http://localhost:3000`
 
---
 
## 🚀 Usage
 
### Running a Simulation
 
1. **Navigate to Dashboard** → Simulation
2. **Upload or Select:**
   - Digital Elevation Model (DEM) `.tif`
   - Dam breach parameters
   - Hydrological data
3. **Configure Simulation:**
   - Model type (SPH / Delft3D)
   - Time step & duration
   - Output resolution
4. **Run & Monitor:**
   - Real-time progress tracking
   - Side-by-side model comparison
5. **Export Results:**
   - Download as Shapefile, KML, or GeoTIFF
   - Generate PDF impact report
### Satellite Monitoring
 
1. **Dashboard** → Satellite
2. **Select River Basin** & date range
3. **View Sentinel-1/2 Composite** with flood extent
4. **Time-Series Analysis** showing water dynamics
5. **Automated Alerts** when flood detected
### Analytics & HADR Reporting
 
1. **Dashboard** → Analytics
2. **Select Simulation** & inundation layer
3. **View Dashboards:**
   - Population exposure by district
   - Damaged building footprints
   - Submerged road networks
   - Agricultural impact zones
4. **Generate PDF Report** with evacuation corridors
---

## 9. 🧪 Testing

```bash
# Backend tests
pytest tests/ -v
 
# With coverage
pytest tests/ --cov=src
 
# Frontend tests
cd frontend
npm test
 
# Type checking
npm run type-check
```

Replace these commands with the actual setup and run instructions for your project.

## 10. Future Scope

- Real-time integration with weather forecasting models
- Machine learning for rapid scenario prioritization
- Mobile app for field personnel
- Integration with emergency management systems
- Multi-hazard analysis (monsoon + dam release)
- AI-based automatic parameter calibration
- High-resolution urban flood modelling

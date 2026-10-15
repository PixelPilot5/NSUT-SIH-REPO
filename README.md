# NSUT SIH 2026 Project Repository

## 1. Project Information

| Field | Details |
|---|---|
| **Project name** | Suraksha-Setu : Smart Flood Intelligence |
| **Team name** | Unexpected Error :( |
| **Problem statement ID** | SIH26161 |
| **Problem statement title** | Dam Break Inundation Modelling Using Hydrodynamic Modelling of any River |
| **Category** | Software |
| **Theme** | Disaster Management |
| **College** | Netaji Subhas University of Technology (NSUT) |

## 2. Problem Statement

Dam failures and glacial-lake outbursts send a flood wave down a river valley within minutes to hours. Past events such as Rishiganga (2021), Kosi (2008) and Kashmir and Assam (2014) showed that authorities often lack a quick way to see how far the water will reach, how deep it will be, when it will arrive, and who is in its path. Emergency Action Plans need this information before an event, and flood monitoring needs it during one.

## 3. Proposed Solution

Suraksha-Setu is a web platform that simulates a dam-break flood for real Indian dams, shows the result on a map, estimates the impact, and monitors flooding from satellite data.

1. The user picks a dam (or a custom point) and a breach scenario.
2. The backend computes the breach hydrograph from the dam's real parameters.
3. Two independent hydrodynamic models route the flood down the valley: a particle-based SPH solver and a Delft3D-type grid solver. Both use the same dam, terrain and hydrograph, so the two can be compared fairly.
4. The impact analysis page estimates flooded area, depth, arrival times and exposed people, buildings, roads, bridges, schools, health facilities and cropland.
5. The user downloads a PDF report, an Excel workbook, GeoJSON and KML files.
6. The Live Flood Monitor shows near-real-time flooding from Sentinel-1 radar through Google Earth Engine.

## 4. Key Features

- Real dam data for preset dams, with the source and a data-confidence flag shown in the app
- Breach hydrograph from a weir equation with Froehlich (2008) breach width and time
- Two models and a side-by-side comparison: SPH and a Delft3D-type grid solver
- Animated flood on the map (SPH particles and grid flow), with depth, speed and arrival time
- Flood impact analysis with rounded estimate ranges
- Exports: PDF report, Excel (.xlsx), GeoJSON, KML
- Live Flood Monitor with six basin impact parameters (Earth Engine, Sentinel-1)
- Custom coordinates for any location (uses assumed dam parameters, labelled as such)
- Light and dark mode

## 5. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript, Bootstrap, Leaflet |
| Backend | Python, FastAPI, Uvicorn |
| Simulation | Own SPH solver and Delft3D-type 2D shallow-water solver (NumPy, SciPy), with 2D and 3D-style flood views |
| Satellite data | Google Earth Engine, Sentinel-1 GRD |
| Storage | On-disk result cache (`src/backend/cache/`), no database |

## 6. Architecture

See [docs/architecture.md](docs/architecture.md).

Architecture in short:
```text
User
  ↓
Frontend
  ↓
Backend API
  ↓
SPH and grid solvers
  ↓
Flood results
  ↓
Analysis 
  ↓
Reports
```

## 7. Repository Structure

```text
.
├── README.md
├── LICENSE
├── .gitignore
├── assets/
│   └── screenshots/          # key screenshots
├── docs/
│   └── architecture.md       # system architecture
├── src/
│   ├── backend/              # FastAPI server, solvers, breach model, live monitor API
│   └── frontend/             # web pages, styles, scripts
└── submission/
    ├── Unexpected Error_SIH2026_Presentation.pptx   # final presentation
    └── DEMO.md               # demo video link
```

| What | Where |
|---|---|
| Source code | `src/` |
| Documentation | `docs/` |
| Screenshots | `assets/screenshots/` |
| Final presentation | `submission/Unexpected Error_SIH2026_Presentation.pptx` |
| Demo video link | `submission/DEMO.md` |
| Project overview | this `README.md` |

## 8. Final Presentation

The final presentation is in [submission/Unexpected Error_SIH2026_Presentation.pptx](<submission/Unexpected Error_SIH2026_Presentation.pptx>).

## 9. Demo Video

Watch the demo video: https://drive.google.com/file/d/1TJsPrEjxnieqBi3iKek1fGsF7ATxEIWW/view?usp=drive_link

The same link is in [submission/DEMO.md](submission/DEMO.md).

## 10. Screenshots / Prototype Photos

Screenshots are in [assets/screenshots/](assets/screenshots/).

## 11. Installation

```bash
git clone https://github.com/PixelPilot5/NSUT-SIH-REPO.git
cd NSUT-SIH-REPO
cd src/backend
python -m venv venv
venv\Scripts\activate            # Windows (macOS / Linux: source venv/bin/activate)
pip install -r requirements.txt
```

## 12. Run

**Backend** (run from the repository root):

```bash
cd src/backend
python server.py                 # API on http://127.0.0.1:8000
```

If you are already inside `src/backend` from the Installation step, just run `python server.py`.

**Frontend:** open the `src/frontend` folder in VS Code, install the **Live Server** extension, right-click `index.html` and choose **Open with Live Server**. Keep the backend running.

Preset-dam results are pre-computed in `src/backend/cache/`, so they open instantly. A new case is computed on its first run and then cached.

**Live Flood Monitor (optional, needs Earth Engine).** The map is our published Earth Engine app and works for everyone. The six impact figures below it are computed through Earth Engine, which needs your own login. Without it, the backend falls back to saved or reference values instead of failing, so those figures are not live. For live figures, register for free (non-commercial) at https://code.earthengine.google.com/register, then, inside `src/backend`:

```bash
earthengine authenticate
set EE_PROJECT=your-project-id   # PowerShell: $env:EE_PROJECT="your-project-id"
python server.py
```

## 13. Future Scope

- Use real DEM data (SRTM / Cartosat) for the flow path in place of the shaped valley model
- Replace the estimated population and infrastructure layers with detailed building and road data
- Add rainfall and reservoir-level inputs (CHIRPS, CWC bulletins) for forecast-driven scenarios
- Generate Emergency Action Plan outputs: evacuation zones, routes and warning times
- Validate the models against more recorded dam-break events

## Notes

- Preset dams use real engineering parameters. Custom coordinates use assumed default dam parameters, and the results page says so.
- Impact figures are screening-level estimates (Census 2011 population density) shown as rounded ranges, not survey counts.
- On the Live Flood Monitor only the flooded area is measured from radar. The other five parameters are estimates derived from it.
- Results are indicative planning aids, not an official flood forecast or evacuation order.
- This repository contains no passwords, API keys, access tokens or `.env` secrets.

## License

MIT. See [LICENSE](LICENSE).
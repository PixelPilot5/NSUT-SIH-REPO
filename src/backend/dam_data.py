"""
dam_data.py - real-world parameters for the dams / lakes offered in the UI.

WHERE THE NUMBERS COME FROM
---------------------------
* Dam height, crest length, gross storage, type  -> CWC National Register of Large
  Dams (NRLD), project authorities (THDC, BBMB, OHPC ...) and ICOLD-style summaries.
  `conf` says how sure I am of each row:
      "verified"  - cross-checked against a published source while building this file
      "medium"    - recalled from standard references; double-check against NRLD
      "estimate"  - class-based estimate (small / run-of-river structure, or numbers I
                    could not confirm). TREAT AS PLACEHOLDER, replace with NRLD values.
* Event reconstructions (Chamoli 2021, South Lhonak 2023, Kosi 2008) use values from
  the peer-reviewed / government literature cited in `src`.
* Downstream river path: `path` = hand-picked lat/lng waypoints along the real river
  (landmarks: confluences, towns). Where `path` is None, a straight line along
  `bearing` with a gentle synthetic meander is used. Replace with a DEM-derived flow
  path (see terrain.py -> load_dem_profile) for production use.

Slopes are (near_slope, far_slope, break_km) = average thalweg slope for the first
`break_km` km below the dam and for the rest of the reach.
"""

# terrain classes -> default valley geometry (floor width m, wall slope dz/dn,
# cross-valley floodplain slope, half-domain width m, cell size along/across m, Manning n)
TERRAIN_CLASSES = {
    # open_km / open_len_km / floor_gain / wall_end: real valleys open out downstream (gorge -> valley -> plain).
    # Between open_km and open_km+open_len_km the valley floor widens by `floor_gain` and the walls ease to `wall_end`.
    "gorge":  dict(floor_w=160.0,  wall=0.85, flat=0.020,  W=4500.0,  ds=300.0, dn=90.0,  n=0.060,
                   open_km=15.0, open_len_km=40.0, floor_gain=7.0, wall_end=0.10),
    "valley": dict(floor_w=450.0,  wall=0.30, flat=0.004,  W=9000.0,  ds=350.0, dn=120.0, n=0.045,
                   open_km=15.0, open_len_km=40.0, floor_gain=2.2, wall_end=0.08),
    "plain":  dict(floor_w=700.0,  wall=0.012, flat=0.0004, W=26000.0, ds=600.0, dn=400.0, n=0.040,
                   open_km=0.0, open_len_km=1.0, floor_gain=1.0, wall_end=0.012),
}

# Storage-curve exponent: V(h) = Vgross * (h/H)^k   (wedge-shaped valley reservoirs k~2.5-3)
STORAGE_K = {"gorge": 2.8, "valley": 2.3, "plain": 1.8}

# Scenario names exactly as used by simulation.html radio buttons
SCENARIOS = [
    "Full Dam Break", "Partial Dam Break", "Slow Water Release",
    "River Blockage", "Sudden Lake Outburst", "Overtopping Failure",
]

def _d(**kw):
    return kw

DAMS = {
 # ------------------------------------------------------------------ NORTH
 "tehri": _d(
    name="Tehri Dam", key="Tehri Dam (Uttarakhand)", lat=30.378, lng=78.480, river="Bhagirathi",
    kind="earthrock", H=260.5, L=575, Vg=3540, cls="gorge", slope=(0.0040, 0.0020, 45),
    path=[(30.378,78.480),(30.30,78.50),(30.250,78.530),(30.146,78.598),(30.120,78.45),(30.087,78.268),(29.945,78.165)],
    reach_km=110, conf="verified",
    stations=[("Koteshwar",30.250,78.530),("Devprayag",30.146,78.598),("Rishikesh",30.087,78.268),("Haridwar",29.945,78.165)],
    src="THDC / NRLD: 260.5 m earth-rockfill, gross ~3.54 km3"),
 "rishi_ganga": _d(
    name="Rishi Ganga / Tapovan", key="Rishi Ganga / Tapovan (Uttarakhand)", lat=30.49, lng=79.62, river="Rishiganga-Dhauliganga",
    kind="event_debris", H=40.0, L=150, Vg=26.4, cls="gorge", slope=(0.030, 0.012, 20),
    path=[(30.49,79.62),(30.557,79.564),(30.45,79.45),(30.333,79.317),(30.263,79.215),(30.284,78.98)],
    reach_km=95, conf="verified",
    event=dict(volume_mcm=26.4, peak_cms=12762.0, shape=0.3),
    stations=[("Vishnuprayag",30.557,79.564),("Nandaprayag",30.333,79.317),("Karnaprayag",30.263,79.215),("Rudraprayag",30.284,78.980)],
    src="Chamoli 7-Feb-2021 reconstruction: 26.4 MCM, Qp 12,762 m3/s (HEC-RAS study, Nat. Hazards 2023); rock-ice avalanche ~27 MCM (Shugar et al., Science 2021)"),
 "dhauliganga": _d(
    name="Dhauliganga Dam", key="Dhauliganga Dam (Uttarakhand)", lat=29.97, lng=80.53, river="Dhauliganga (Kumaon)",
    kind="gravity", H=56.0, L=145, Vg=7.0, cls="gorge", slope=(0.020, 0.010, 15),
    path=None, bearing=165, reach_km=60, conf="estimate", stations=[],
    src="run-of-river structure; height/pondage are placeholders - verify with NHPC"),
 "bhakra": _d(
    name="Bhakra Dam", key="Bhakra Dam (Himachal Pradesh)", lat=31.41, lng=76.43, river="Sutlej",
    kind="gravity", H=225.5, L=518, Vg=9340, cls="gorge", slope=(0.0040, 0.0010, 20),
    path=[(31.41,76.43),(31.385,76.37),(31.30,76.43),(31.24,76.50),(31.10,76.52),(30.97,76.53),(30.95,76.30)],
    reach_km=110, conf="verified",
    stations=[("Nangal",31.385,76.370),("Anandpur Sahib",31.240,76.500),("Rupnagar",30.970,76.530)],
    src="BBMB / NRLD: 225.5 m concrete gravity, Gobind Sagar gross ~9.34 km3"),
 "pong": _d(
    name="Pong Dam / Beas", key="Pong Dam / Beas (Himachal Pradesh)", lat=31.97, lng=75.95, river="Beas",
    kind="earthrock", H=133.0, L=1951, Vg=8570, cls="valley", slope=(0.0015, 0.0006, 30),
    path=None, bearing=245, reach_km=100, conf="medium", stations=[],
    src="BBMB / NRLD: 133 m earth-core rockfill"),
 "baglihar": _d(
    name="Baglihar Dam", key="Baglihar Dam (Jammu & Kashmir)", lat=33.16, lng=75.32, river="Chenab",
    kind="gravity", H=144.5, L=317, Vg=395, cls="gorge", slope=(0.012, 0.006, 25),
    path=None, bearing=235, reach_km=80, conf="medium", stations=[],
    src="concrete gravity 144.5 m; gross storage needs NRLD check"),
 "uri": _d(
    name="Uri Dam", key="Uri Dam (Jammu & Kashmir)", lat=34.14, lng=74.04, river="Jhelum",
    kind="gravity", H=52.0, L=190, Vg=8.0, cls="gorge", slope=(0.010, 0.006, 20),
    path=None, bearing=295, reach_km=60, conf="estimate", stations=[],
    src="run-of-river; placeholders - verify with NHPC"),
 "ranjit_sagar": _d(
    name="Ranjit Sagar / Thein Dam", key="Ranjit Sagar / Thein Dam (Punjab / J&K)", lat=32.44, lng=75.73, river="Ravi",
    kind="earthrock", H=145.0, L=617, Vg=3280, cls="valley", slope=(0.0030, 0.0008, 25),
    path=None, bearing=220, reach_km=100, conf="medium", stations=[],
    src="PSPCL / NRLD: 145 m earth-core rockfill"),
 "rihand": _d(
    name="Rihand Dam", key="Rihand Dam (Uttar Pradesh)", lat=24.21, lng=83.03, river="Rihand",
    kind="gravity", H=91.5, L=934, Vg=10600, cls="valley", slope=(0.0012, 0.0005, 30),
    path=None, bearing=10, reach_km=100, conf="medium", stations=[],
    src="NRLD: 91.5 m concrete gravity (Govind Ballabh Pant Sagar)"),
 # ------------------------------------------------------------------ EAST / NE
 "teesta": _d(
    name="Teesta III Dam", key="Teesta River / Dam (Sikkim / WB)", lat=27.598, lng=88.644, river="Teesta",
    kind="rockfill_cfrd", H=60.0, L=175, Vg=15.0, cls="gorge", slope=(0.014, 0.007, 30),
    path=[(27.598,88.644),(27.51,88.53),(27.40,88.51),(27.23,88.50),(27.18,88.53),(27.05,88.43)],
    reach_km=110, conf="estimate",
    stations=[("Mangan",27.510,88.530),("Dikchu",27.400,88.510),("Singtam",27.230,88.500),("Rangpo",27.180,88.530)],
    src="Teesta-III (Chungthang) is at ~27.60N 88.64E; the UI point (27.12N, 88.48E) is ~55 km downstream. Pondage is small - placeholder"),
 "south_lhonak": _d(
    name="South Lhonak Lake (GLOF)", key="South Lhonak Lake (Sikkim GLOF)", lat=27.9125, lng=88.1964, river="Lhonak Chu / Teesta",
    kind="glacial_lake", H=40.0, L=900, Vg=50.0, cls="gorge", slope=(0.070, 0.030, 20),
    path=[(27.9125,88.1964),(27.86,88.33),(27.76,88.52),(27.598,88.644),(27.51,88.53),(27.40,88.51)],
    reach_km=100, conf="verified",
    event=dict(volume_mcm=50.0, peak_cms=None, shape=0.25),   # peak from Evans (1986) unless overridden
    stations=[("Chungthang (Teesta-III)",27.598,88.644),("Mangan",27.510,88.530),("Dikchu",27.400,88.510)],
    src="3-4 Oct 2023: ~50 MCM released (Science / Landslide Blog); Chungthang ~63 km downstream, hit ~00:30 IST; reconstructed peak ~7,355 m3/s at Chungthang (Nat. Hazards 2025)"),
 "kosi": _d(
    name="Kosi Barrage", key="Kosi River Basin (Bihar)", lat=26.52, lng=86.93, river="Kosi",
    kind="river_breach", H=12.0, L=1150, Vg=60.0, cls="plain", slope=(0.00035, 0.00025, 60),
    path=[(26.52,86.93),(26.25,87.05),(25.95,87.15),(25.45,87.25)],
    reach_km=150, conf="verified",
    event=dict(base_cms=3675.0, hours=60.0),
    stations=[("Supaul (old course)",26.12,86.60),("Purnia",25.78,87.47),("Kursela (Ganga confl.)",25.45,87.25)],
    src="Kusaha breach 18-Aug-2008: ~3,675 m3/s through breach, ~95% of river diverted, ~3,700 km2 flooded, Ganga confluence ~150 km (Wikipedia/Down To Earth/Bihar needs assessment)"),
 "subansiri": _d(
    name="Subansiri Lower Dam", key="Subansiri Lower Dam (Arunachal / Assam)", lat=27.55, lng=94.26, river="Subansiri",
    kind="gravity", H=116.0, L=284, Vg=1370, cls="valley", slope=(0.0060, 0.0015, 30),
    path=None, bearing=170, reach_km=100, conf="medium", stations=[],
    src="NHPC: 116 m concrete gravity"),
 "hirakud": _d(
    name="Hirakud Dam", key="Hirakud Dam (Odisha)", lat=21.53, lng=83.87, river="Mahanadi",
    kind="earth_composite", H=61.0, L=4800, Vg=5896, cls="plain", slope=(0.0004, 0.00025, 40),
    path=[(21.53,83.87),(21.47,83.97),(21.30,83.98),(21.05,83.93),(20.83,83.92),(20.83,84.30)],
    reach_km=120, conf="verified",
    stations=[("Sambalpur",21.470,83.970),("Sonepur",20.830,83.920)],
    src="OHPC: 60.96 m, 4.8 km main dam, gross 5,896 MCM (2001 revision; original 8,136), spillway 42,450 m3/s"),
 "rengali": _d(
    name="Rengali Dam", key="Rengali Dam (Odisha)", lat=21.27, lng=85.03, river="Brahmani",
    kind="earthrock", H=75.0, L=6750, Vg=4400, cls="valley", slope=(0.0008, 0.0004, 30),
    path=None, bearing=160, reach_km=100, conf="medium", stations=[],
    src="OPJ/NRLD: ~75 m earth-rockfill"),
 "maithon": _d(
    name="Maithon Dam", key="Maithon Dam (Jharkhand / WB)", lat=23.78, lng=86.81, river="Barakar",
    kind="earth_composite", H=50.0, L=4789, Vg=1230, cls="valley", slope=(0.0010, 0.0005, 30),
    path=None, bearing=110, reach_km=80, conf="medium", stations=[],
    src="DVC: 50 m earth-and-concrete"),
 "panchet": _d(
    name="Panchet Dam", key="Panchet Dam (Jharkhand / WB)", lat=23.68, lng=86.77, river="Damodar",
    kind="earth_composite", H=45.0, L=2545, Vg=1500, cls="valley", slope=(0.0010, 0.0005, 30),
    path=None, bearing=115, reach_km=80, conf="medium", stations=[],
    src="DVC: ~45 m earthen"),
 # ------------------------------------------------------------------ WEST / CENTRAL
 "sardar_sarovar": _d(
    name="Sardar Sarovar Dam", key="Sardar Sarovar Dam (Gujarat)", lat=21.83, lng=73.75, river="Narmada",
    kind="gravity", H=163.0, L=1210, Vg=9500, cls="valley", slope=(0.0006, 0.0003, 40),
    path=None, bearing=255, reach_km=120, conf="medium", stations=[],
    src="NCA / NRLD: 163 m concrete gravity, gross ~9.5 km3"),
 "ukai": _d(
    name="Ukai Dam", key="Ukai Dam (Gujarat)", lat=21.24, lng=73.58, river="Tapi",
    kind="earth_composite", H=68.6, L=4927, Vg=8510, cls="valley", slope=(0.0007, 0.0003, 40),
    path=None, bearing=265, reach_km=100, conf="medium", stations=[],
    src="NRLD: 68.6 m earth + masonry, gross ~8.5 km3"),
 "kadana": _d(
    name="Kadana Dam", key="Kadana Dam (Gujarat)", lat=23.31, lng=73.83, river="Mahi",
    kind="composite", H=66.0, L=785, Vg=1740, cls="valley", slope=(0.0010, 0.0004, 40),
    path=None, bearing=225, reach_km=100, conf="medium", stations=[],
    src="NRLD: composite masonry + earth"),
 "koyna": _d(
    name="Koyna Dam", key="Koyna Dam (Maharashtra)", lat=17.40, lng=73.76, river="Koyna",
    kind="gravity", H=103.0, L=808, Vg=2800, cls="gorge", slope=(0.0030, 0.0008, 25),
    path=[(17.400,73.760),(17.385,73.820),(17.373,73.905),(17.330,74.050),(17.289,74.183),(17.180,74.290),(17.050,74.375),(16.855,74.575)],
    reach_km=90, conf="medium",
    stations=[("Patan",17.373,73.905),("Karad",17.289,74.183),("Sangli",16.855,74.575)],
    open_km=18.0,
    src="MSEDCL / NRLD: 103 m rubble-concrete gravity, gross ~2.8 km3; river path via Patan and Karad to the Krishna (approximate waypoints)"),
 "jayakwadi": _d(
    name="Jayakwadi Dam", key="Jayakwadi Dam (Maharashtra)", lat=19.48, lng=75.38, river="Godavari",
    kind="earth_composite", H=41.3, L=9975, Vg=2909, cls="plain", slope=(0.0004, 0.0003, 40),
    path=None, bearing=130, reach_km=100, conf="medium", stations=[],
    src="NRLD: 41.3 m earth + masonry"),
 "ujani": _d(
    name="Ujani Dam", key="Ujani Dam (Maharashtra)", lat=18.29, lng=74.79, river="Bhima",
    kind="earth_composite", H=56.4, L=2534, Vg=3320, cls="plain", slope=(0.0005, 0.0003, 40),
    path=None, bearing=140, reach_km=100, conf="medium", stations=[],
    src="NRLD: 56.4 m earth + masonry"),
 "indira_sagar": _d(
    name="Indira Sagar Dam", key="Indira Sagar Dam (Madhya Pradesh)", lat=22.28, lng=76.97, river="Narmada",
    kind="gravity", H=92.0, L=654, Vg=12200, cls="valley", slope=(0.0006, 0.0003, 40),
    path=None, bearing=265, reach_km=100, conf="medium", stations=[],
    src="NHDC / NRLD: 92 m concrete gravity, gross ~12.2 km3"),
 "gandhi_sagar": _d(
    name="Gandhi Sagar Dam", key="Gandhi Sagar Dam (Madhya Pradesh)", lat=24.71, lng=75.52, river="Chambal",
    kind="gravity", H=62.5, L=514, Vg=7322, cls="valley", slope=(0.0008, 0.0004, 30),
    path=None, bearing=15, reach_km=90, conf="medium", stations=[],
    src="NRLD: 62.5 m masonry gravity"),
 "barna": _d(
    name="Barna Dam", key="Barna Dam (Madhya Pradesh)", lat=23.08, lng=78.06, river="Barna",
    kind="earth", H=39.0, L=1100, Vg=543, cls="valley", slope=(0.0010, 0.0005, 30),
    path=None, bearing=200, reach_km=70, conf="estimate", stations=[],
    src="estimate - verify with NRLD"),
 "bisalpur": _d(
    name="Bisalpur Dam", key="Bisalpur Dam (Rajasthan)", lat=25.93, lng=75.46, river="Banas",
    kind="gravity", H=39.5, L=574, Vg=1095, cls="valley", slope=(0.0008, 0.0004, 30),
    path=None, bearing=70, reach_km=80, conf="estimate", stations=[],
    src="estimate - verify with NRLD"),
 "rana_pratap": _d(
    name="Rana Pratap Sagar", key="Rana Pratap Sagar (Rajasthan)", lat=24.93, lng=75.58, river="Chambal",
    kind="gravity", H=53.8, L=1143, Vg=2900, cls="valley", slope=(0.0008, 0.0004, 30),
    path=None, bearing=30, reach_km=90, conf="medium", stations=[],
    src="NRLD: 53.8 m masonry gravity"),
 # ------------------------------------------------------------------ SOUTH
 "nagarjuna_sagar": _d(
    name="Nagarjuna Sagar Dam", key="Nagarjuna Sagar Dam (AP / Telangana)", lat=16.57, lng=79.31, river="Krishna",
    kind="gravity", H=124.0, L=1450, Vg=11472, cls="valley", slope=(0.0005, 0.0003, 40),
    path=[(16.57,79.31),(16.52,79.45),(16.50,79.70),(16.55,80.00),(16.57,80.36),(16.51,80.61)],
    reach_km=140, conf="verified",
    stations=[("Macherla",16.480,79.430),("Amaravati",16.573,80.358),("Vijayawada (Prakasam Barrage)",16.505,80.605)],
    src="NRLD / TS Genco: 124 m masonry gravity, gross ~11.47 km3 (405 TMC)"),
 "srisailam": _d(
    name="Srisailam Dam", key="Srisailam Dam (AP / Telangana)", lat=16.08, lng=78.89, river="Krishna",
    kind="gravity", H=145.0, L=512, Vg=8720, cls="gorge", slope=(0.0015, 0.0005, 30),
    path=None, bearing=95, reach_km=110, conf="medium", stations=[],
    src="NRLD: 145 m concrete gravity, gross ~8.7 km3"),
 "polavaram": _d(
    name="Polavaram Dam", key="Polavaram Dam (Andhra Pradesh)", lat=17.26, lng=81.65, river="Godavari",
    kind="earthrock", H=54.0, L=2454, Vg=7500.0, cls="plain", slope=(0.0002, 0.00015, 40),
    path=None, bearing=160, reach_km=110, conf="medium", stations=[],
    src="Polavaram Project Authority: earth-cum-rockfill; gross ~7.5 km3 (verify)"),
 "tungabhadra": _d(
    name="Tungabhadra Dam", key="Tungabhadra Dam (Karnataka)", lat=15.26, lng=76.53, river="Tungabhadra",
    kind="gravity", H=49.5, L=2441, Vg=3276, cls="valley", slope=(0.0005, 0.0003, 40),
    path=None, bearing=60, reach_km=100, conf="medium", stations=[],
    src="NRLD: 49.5 m masonry/earth, gross ~3.3 km3 (silted)"),
 "almatti": _d(
    name="Almatti Dam", key="Almatti Dam (Karnataka)", lat=16.33, lng=75.88, river="Krishna",
    kind="gravity", H=52.0, L=1565, Vg=3105, cls="valley", slope=(0.0004, 0.0003, 40),
    path=None, bearing=100, reach_km=100, conf="medium", stations=[],
    src="KBJNL: 52 m concrete gravity"),
 "krs": _d(
    name="Krishnarajasagara / KRS Dam", key="Krishnarajasagara / KRS Dam (Karnataka)", lat=12.42, lng=76.57, river="Kaveri",
    kind="gravity", H=39.8, L=2621, Vg=1368, cls="valley", slope=(0.0010, 0.0004, 30),
    path=None, bearing=100, reach_km=80, conf="medium", stations=[],
    src="NRLD: 39.8 m masonry gravity"),
 "mullaperiyar": _d(
    name="Mullaperiyar Dam", key="Mullaperiyar Dam (Kerala)", lat=9.53, lng=77.16, river="Periyar",
    kind="gravity", H=53.6, L=365.7, Vg=443, cls="gorge", slope=(0.0080, 0.0040, 20),
    path=[(9.53,77.16),(9.57,77.05),(9.65,77.00),(9.75,76.97),(9.84,76.97)],
    reach_km=45, conf="verified",
    stations=[("Vandiperiyar",9.570,77.050),("Idukki reservoir",9.840,76.970)],
    src="Kerala/TN Irrigation: 53.6 m (176 ft) surkhi-masonry gravity, 365.7 m crest, ~443 MCM at 142-152 ft (see Supreme Court filings); Idukki reservoir ~45 km downstream"),
 "idukki": _d(
    name="Idukki Dam", key="Idukki Dam (Kerala)", lat=9.85, lng=76.97, river="Periyar",
    kind="arch", H=169.0, L=365, Vg=1996, cls="gorge", slope=(0.0060, 0.0030, 25),
    path=None, bearing=320, reach_km=70, conf="medium", stations=[],
    src="KSEB: 169 m double-curvature arch, gross ~2.0 km3"),
 "mettur": _d(
    name="Mettur Dam", key="Mettur Dam (Tamil Nadu)", lat=11.80, lng=77.80, river="Kaveri",
    kind="gravity", H=59.0, L=1700, Vg=2647, cls="valley", slope=(0.0006, 0.0003, 40),
    path=None, bearing=160, reach_km=100, conf="medium", stations=[],
    src="NRLD: 59 m masonry gravity"),
 "bhavanisagar": _d(
    name="Bhavanisagar Dam", key="Bhavanisagar Dam (Tamil Nadu)", lat=11.47, lng=77.14, river="Bhavani",
    kind="earth_composite", H=40.0, L=8400, Vg=929, cls="valley", slope=(0.0008, 0.0004, 30),
    path=None, bearing=90, reach_km=80, conf="medium", stations=[],
    src="NRLD: 40 m earth-fill with masonry sections"),
}


# --- lookup helpers -----------------------------------------------------------------
_BY_KEY = {d["key"]: k for k, d in DAMS.items()}
_BY_NAME = {d["name"].lower(): k for k, d in DAMS.items()}


def resolve_dam(dam_id=None, dam_name=None):
    """Return (id, record) for an id such as 'tehri' or any of the name variants the
    frontend has used ('Tehri Dam', 'Tehri Dam (Uttarakhand)', 'Tehri' ...)."""
    if dam_id and dam_id in DAMS:
        return dam_id, DAMS[dam_id]
    if dam_name:
        if dam_name in _BY_KEY:
            k = _BY_KEY[dam_name]; return k, DAMS[k]
        low = dam_name.lower().strip()
        if low in _BY_NAME:
            k = _BY_NAME[low]; return k, DAMS[k]
        for k, d in DAMS.items():
            if low.split(" (")[0] in d["name"].lower() or d["name"].lower() in low:
                return k, d
    return None, None

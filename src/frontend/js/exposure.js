/*
 * exposure.js - first-order estimate of who and what sits inside a simulated flood zone.
 *
 * Method (all inputs are public, national or state level; no GIS layers are used):
 *   people      = flooded area x state population density (Census of India 2011) x valley-type factor
 *   households  = people / 4.8   (average household size, Census 2011)
 *   buildings   = households x 1.15   (adds shops, schools, sheds, offices)
 *   roads       = flooded area x 1.7 km/km2 (national road density) x valley-type factor
 *   bridges     = flood reach / typical crossing spacing for the valley type
 *   schools     = 1.1 per 1,000 people (UDISE+ ~14.9 lakh schools for ~1.38 bn people)
 *   health      = 0.13 per 1,000 people (sub-centres + PHC + CHC + hospitals)
 *   cropland    = flooded area x cropped share for the valley type
 *
 * It is an order-of-magnitude estimate; the page shows a low-high range. Swap in WorldPop /
 * GHSL / OpenStreetMap counts for the study area to replace it.
 */
(function (global) {
  "use strict";

  // persons per km2, Census of India 2011
  const STATE_DENSITY = {
    "maharashtra": 365, "himachal": 123, "uttarakhand": 189, "kerala": 859, "bihar": 1106, "west bengal": 1029, "wb": 1029,
    "uttar pradesh": 829, "gujarat": 308, "madhya pradesh": 236, "odisha": 270, "karnataka": 319, "tamil nadu": 555,
    "andhra": 308, "telangana": 307, "punjab": 551, "jammu": 124, "j&k": 124, "ladakh": 3, "sikkim": 86, "arunachal": 17,
    "assam": 398, "jharkhand": 414, "chhattisgarh": 189, "rajasthan": 200, "haryana": 573, "goa": 394, "meghalaya": 132,
    "nagaland": 119, "tripura": 350, "mizoram": 52, "manipur": 128,
  };
  const NATIONAL_DENSITY = 382;

  // gorge-class valleys widen into open valley downstream, so the factor is a blend
  const POP_FACTOR = { gorge: 0.9, valley: 1.4, plain: 1.6 };
  const ROAD_FACTOR = { gorge: 0.5, valley: 0.9, plain: 1.2 };
  const CROP_SHARE = { gorge: 0.10, valley: 0.35, plain: 0.65 };
  const BRIDGE_SPACING_KM = { gorge: 14, valley: 9, plain: 6 };
  const ROAD_DENSITY = 1.7;
  const HH_SIZE = 4.8;
  const BLD_PER_HH = 1.15;
  const LOW = 0.65, HIGH = 1.35;

  function densityFor(stateText) {
    const t = String(stateText || "").toLowerCase();
    const hits = [];
    Object.keys(STATE_DENSITY).forEach((k) => { if (t.indexOf(k) >= 0) hits.push(STATE_DENSITY[k]); });
    if (!hits.length) return { value: NATIONAL_DENSITY, label: "India average" };
    const value = hits.reduce((a, b) => a + b, 0) / hits.length;
    return { value, label: String(stateText) };
  }

  /*
   * in: { state, terrainClass, areaKm2: {low, moderate, high}, reachKm }
   */
  function estimate(inp) {
    const cls = POP_FACTOR[inp.terrainClass] ? inp.terrainClass : "valley";
    const d = densityFor(inp.state);
    const dens = d.value * POP_FACTOR[cls];
    const A = inp.areaKm2 || { low: 0, moderate: 0, high: 0 };
    const total = (A.low || 0) + (A.moderate || 0) + (A.high || 0);
    const people = total * dens;
    const classes = [
      { key: "low", label: "Shallow", range: "under 1 m", area: A.low || 0 },
      { key: "moderate", label: "Moderate", range: "1 to 3 m", area: A.moderate || 0 },
      { key: "high", label: "Deep", range: "over 3 m", area: A.high || 0 },
    ].map((c) => {
      const p = c.area * dens;
      return Object.assign(c, { people: p, buildings: (p / HH_SIZE) * BLD_PER_HH, share: total > 0 ? c.area / total : 0 });
    });
    const houses = people / HH_SIZE;
    const mk = (mid) => ({ mid, low: mid * LOW, high: mid * HIGH });
    return {
      class_: cls,
      densityPerKm2: dens,
      stateDensity: d.value,
      stateLabel: d.label,
      totalAreaKm2: total,
      people: mk(people),
      peopleDeep: mk(classes[2].people),
      households: mk(houses),
      buildings: mk(houses * BLD_PER_HH),
      roadsKm: mk(total * ROAD_DENSITY * ROAD_FACTOR[cls]),
      bridges: mk(Math.max(1, (inp.reachKm || 0) / BRIDGE_SPACING_KM[cls])),
      schools: mk((people / 1000) * 1.1),
      health: mk((people / 1000) * 0.13),
      cropHa: mk(total * 100 * CROP_SHARE[cls]),
      classes,
    };
  }

  // reads what simulation.js / results.js saved and returns { est, inputs } for the model asked for
  function fromStorage(modelKey) {
    let rep = null, sim = {};
    try { rep = JSON.parse(localStorage.getItem("simulationReport") || "null"); } catch (e) { /* ignore */ }
    try { sim = JSON.parse(localStorage.getItem("simulationData") || "{}"); } catch (e) { /* ignore */ }
    if (!rep) return null;
    const m = rep[modelKey || rep.current] || rep.sph || rep.delft3d;
    if (!m) return null;
    const ti = m.terrain_info || {};
    const inputs = {
      state: sim.state || (m.dam && m.dam.state) || "",
      terrainClass: ti.class_ || (m.dam && m.dam.terrain_class) || "valley",
      areaKm2: m.summary.risk_area_km2,
      reachKm: m.summary.flood_reach_km,
    };
    return { est: estimate(inputs), inputs };
  }

  global.FloodExposure = { estimate, fromStorage, densityFor };
})(window);

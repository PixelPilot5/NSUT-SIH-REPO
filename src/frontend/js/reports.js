/*
 * reports.js - Reports & Export page.
 *
 * Every number here comes from the same saved simulation the Flood Impact Analysis page reads
 * ("simulationReport", "simulationData", "simulationExtent"), so the PDF, CSV and GIS exports always
 * match what is on screen. Exposure figures come from js/exposure.js.
 */
document.addEventListener("DOMContentLoaded", () => {
  const btnPDF = document.getElementById("btnPDF");
  const btnSHP = document.getElementById("btnSHP");
  const btnKML = document.getElementById("btnKML");
  const btnGeoJSON = document.getElementById("btnGeoJSON");
  const btnCSV = document.getElementById("btnCSV");

  // ------------------------------------------------------------------ formatting helpers
  const esc = (v) =>
    String(v == null ? "" : v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const f1 = (v, d = 1) =>
    v == null || !Number.isFinite(v)
      ? "n/a"
      : Number(v).toLocaleString("en-IN", {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        });
  const num = (v) =>
    v == null || !Number.isFinite(v)
      ? "n/a"
      : Math.round(v).toLocaleString("en-IN");
  const sig = (v) => {
    // two significant figures, so estimates do not look exact
    if (v == null || !Number.isFinite(v)) return "n/a";
    if (v < 10) return String(Math.round(v));
    const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    return Math.round(Math.round(v / p) * p).toLocaleString("en-IN");
  };
  const sigN = (v) => {
    // same rounding, as a plain number (for CSV)
    if (v == null || !Number.isFinite(v)) return "";
    if (v < 10) return Math.round(v);
    const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    return Math.round(Math.round(v / p) * p);
  };
  const rng = (o) => `${sig(o.low)} - ${sig(o.high)}`;
  const fmtMin = (m) => {
    if (m == null || !Number.isFinite(m)) return "not reached";
    if (m < 90) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60),
      r = Math.round(m - 60 * h);
    return `${h} h ${String(r).padStart(2, "0")} min`;
  };
  const fmtQ = (q) =>
    q == null ? "n/a" : Math.round(q).toLocaleString("en-IN");
  const modelLabel = (k) =>
    k === "sph"
      ? "SPH (smoothed particle hydrodynamics)"
      : "Delft3D-type 2D grid";
  const confLabel = (c) =>
    ({
      verified: "Dam data verified",
      medium: "Standard references",
      estimate: "Placeholder values",
      assumed: "User-assumed values",
    })[c] ||
    c ||
    "n/a";

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ------------------------------------------------------------------ the saved simulation
  function load() {
    let rep = null,
      sim = {};
    try {
      rep = JSON.parse(localStorage.getItem("simulationReport") || "null");
    } catch (e) {
      /* ignore */
    }
    try {
      sim = JSON.parse(localStorage.getItem("simulationData") || "{}");
    } catch (e) {
      /* ignore */
    }
    if (!rep || !(rep.sph || rep.delft3d)) return null;
    const both = !!(rep.sph && rep.delft3d);
    const key =
      rep.current && rep[rep.current]
        ? rep.current
        : rep.sph
          ? "sph"
          : "delft3d";
    const m = rep[key];
    const fs = window.FloodExposure ? FloodExposure.fromStorage(key) : null;
    if (!fs) return null;
    const d = m.dam;
    const place = [
      d.river ? `${d.river} river` : "",
      sim.mode === "CUSTOM" ? "" : sim.district,
      sim.mode === "CUSTOM" ? "" : sim.state,
    ]
      .filter(Boolean)
      .join(" · ");
    const stations = (m.stations || []).slice().sort((a, b) => a.s_km - b.s_km);
    return {
      rep,
      sim,
      both,
      key,
      m,
      d,
      sc: m.scenario,
      s: m.summary,
      ex: fs.est,
      stations,
      place,
    };
  }

  function needSimulation() {
    alert("Run a simulation first. The reports are built from its results.");
  }

  const safeName = (d) => d.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();

  // real flood outline written by results.js (GeoJSON Polygon/MultiPolygon), or null
  function getExtent() {
    try {
      return JSON.parse(localStorage.getItem("simulationExtent") || "null");
    } catch (e) {
      return null;
    }
  }
  function ringsOf(ext) {
    // -> array of outer rings [[lng,lat],...]
    if (!ext) return [];
    const g = ext.geometry || ext;
    if (g.type === "Polygon") return [g.coordinates[0]];
    if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0]);
    return [];
  }

  // ================================================================== 1. CSV
  // Laid out as stacked tables, each with a title and its own header row, so it reads like a report in Excel.
  if (btnCSV) {
    btnCSV.addEventListener("click", () => {
      const D = load();
      if (!D) return needSimulation();
      const { rep, both, key, m, d, sc, ex, stations, place } = D;
      const cell = (v) =>
        typeof v === "number"
          ? Number.isFinite(v)
            ? String(v)
            : ""
          : `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
      const lines = [];
      const row = (...c) => lines.push(c.map(cell).join(","));
      const gap = () => lines.push("");
      const table = (title, head, body) => {
        gap();
        row(title.toUpperCase());
        row(...head);
        body.forEach((r) => row(...r));
      };
      const r1 = (v) =>
        v == null || !Number.isFinite(v) ? "" : Math.round(v * 10) / 10;
      const r0 = (v) => (v == null || !Number.isFinite(v) ? "" : Math.round(v));

      row(`FLOOD IMPACT ANALYSIS - ${d.name}`);
      row(place);
      row(`Scenario: ${sc.name}`);
      row(`Generated: ${new Date().toLocaleString()}`);

      table(
        "Dam",
        ["Item", "Value", "Unit"],
        [
          ["Height", d.height_m, "m"],
          ["Crest length", d.crest_m, "m"],
          ["Gross storage", d.storage_mcm, "MCM"],
        ],
      );

      const sc_rows = [
        ["Peak outflow", r0(sc.peak_discharge_cms), "m3/s"],
        ["Time to peak outflow", r0(sc.time_to_peak_min), "min"],
        ["Water released", r0(sc.released_volume_mcm), "MCM"],
      ];
      if (sc.breach_width_m)
        sc_rows.push(
          ["Breach width", r0(sc.breach_width_m), "m"],
          ["Time to full breach", r0(sc.failure_time_min), "min"],
        );
      table("Scenario", ["Item", "Value", "Unit"], sc_rows);

      const ks = ["sph", "delft3d"].filter((k) => rep[k]);
      const names = { sph: "SPH", delft3d: "Delft3D-type grid" };
      const fmt = (fn) => ks.map((k) => fn(rep[k]));
      table(
        "Flood hazard",
        ["Metric", ...ks.map((k) => names[k]), "Unit"],
        [
          ["Maximum depth", ...fmt((x) => r1(x.summary.max_depth_m)), "m"],
          [
            "Peak flow speed",
            ...fmt((x) => r1(x.summary.peak_speed_ms)),
            "m/s",
          ],
          [
            "Flooded area (depth above 10 cm)",
            ...fmt((x) => r1(x.summary.flooded_area_km2)),
            "km2",
          ],
          [
            "Flood reach down the river",
            ...fmt((x) => r0(x.summary.flood_reach_km)),
            "km",
          ],
          [
            "First town reached after",
            ...fmt((x) => r0(x.summary.first_station_arrival_min)),
            "min",
          ],
        ],
      );

      const exr = (label, o, unit) => [
        label,
        sigN(o.mid),
        sigN(o.low),
        sigN(o.high),
        unit,
      ];
      table(
        `Exposure estimate${both ? " (" + names[key] + " run)" : ""}`,
        ["Item", "Estimate", "Low", "High", "Unit"],
        [
          exr("People in flood zone", ex.people, "people"),
          exr("People in deep water (over 3 m)", ex.peopleDeep, "people"),
          exr("Buildings", ex.buildings, "buildings"),
          exr("Households", ex.households, "households"),
          exr("Roads under water", ex.roadsKm, "km"),
          exr("River crossings (bridges)", ex.bridges, "bridges"),
          exr("Schools", ex.schools, "schools"),
          exr("Health facilities", ex.health, "facilities"),
          exr("Cropland", ex.cropHa, "ha"),
        ],
      );

      table(
        "Flooded area by depth",
        [
          "Depth class",
          "Depth range",
          "Area (km2)",
          "Share (%)",
          "People",
          "Buildings",
        ],
        ex.classes
          .slice()
          .reverse()
          .map((c) => [
            c.label,
            c.range,
            r1(c.area),
            Math.round(100 * c.share),
            sigN(c.people),
            sigN(c.buildings),
          ]),
      );

      table(
        "When the flood arrives",
        [
          "Location",
          "Distance from dam (km)",
          ...ks.map((k) => `Arrival, ${names[k]} (min)`),
          `Peak depth, ${names[key]} (m)`,
        ],
        stations.map((x) => {
          const at = ks.map((k) => {
            const st = (rep[k].stations || []).find((y) => y.name === x.name);
            return st && st.arrival_min != null
              ? r0(st.arrival_min)
              : "not reached";
          });
          return [
            x.name,
            r0(x.s_km),
            ...at,
            x.arrival_min == null ? "" : r1(x.peak_depth_m),
          ];
        }),
      );

      const h = m.hydrograph;
      if (h && h.t_h && h.q) {
        const step = Math.max(1, Math.floor(h.t_h.length / 60));
        const hr = [];
        for (let i = 0; i < h.t_h.length; i += step)
          hr.push([Math.round(h.t_h[i] * 100) / 100, r0(h.q[i])]);
        table(
          "Dam outflow hydrograph",
          ["Time since breach (h)", "Discharge (m3/s)"],
          hr,
        );
      }

      gap();
      row("NOTES");
      row(
        `Exposure is estimated, not counted: flooded area x ${ex.stateLabel} population density (${num(ex.stateDensity)} per km2, Census 2011) adjusted for valley type, with national household, road, school and health-facility ratios.`,
      );
      row(
        "This is a planning aid, not a forecast or a substitute for a surveyed dam-break study.",
      );
      row(`Data: ${confLabel(d.data_confidence)}. Source: ${d.source}`);

      downloadFile(
        "\ufeff" + lines.join("\r\n"),
        `suraksha_setu_${safeName(d)}_metrics.csv`,
        "text/csv;charset=utf-8;",
      );
    });
  }

  // ================================================================== 2. GeoJSON
  if (btnGeoJSON) {
    btnGeoJSON.addEventListener("click", () => {
      const D = load();
      if (!D) return needSimulation();
      const { d, sc, s, ex, key } = D;
      const rings = ringsOf(getExtent());
      const geojsonObj = {
        type: "FeatureCollection",
        metadata: {
          title: "Suraksha-Setu simulated flood inundation layer",
          dam: d.name,
          scenario: sc.name,
          model: modelLabel(key),
          generatedAt: new Date().toISOString(),
        },
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [d.lng, d.lat] },
            properties: {
              name: d.name,
              type: "Dam",
              river: d.river,
              height_m: d.height_m,
              gross_storage_mcm: d.storage_mcm,
            },
          },
          ...rings.map((ring) => ({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [ring] },
            properties: {
              name: `${d.name} inundation zone`,
              scenario: sc.name,
              flooded_area_sqkm: Number(s.flooded_area_km2.toFixed(2)),
              max_depth_m: Number(s.max_depth_m.toFixed(2)),
              peak_velocity_mps: Number(s.peak_speed_ms.toFixed(2)),
              flood_reach_km: Math.round(s.flood_reach_km),
              peak_outflow_cms: Math.round(sc.peak_discharge_cms),
              people_in_zone_estimate: Math.round(ex.people.mid),
              source:
                "physics-based simulation, cells with maximum depth above 10 cm",
            },
          })),
        ],
      };
      downloadFile(
        JSON.stringify(geojsonObj, null, 2),
        `suraksha_setu_${safeName(d)}_layer.geojson`,
        "application/geo+json",
      );
    });
  }

  // ================================================================== 3. KML
  if (btnKML) {
    btnKML.addEventListener("click", () => {
      const D = load();
      if (!D) return needSimulation();
      const { d, sc, s } = D;
      const rings = ringsOf(getExtent());
      const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Suraksha-Setu ${esc(d.name)} flood layer</name>
    <description>Simulated inundation extent for ${esc(d.name)} (${esc(sc.name)})</description>
    <Style id="floodPolyStyle">
      <LineStyle><color>ff0000ff</color><width>2.5</width></LineStyle>
      <PolyStyle><color>7dff3a3a</color></PolyStyle>
    </Style>
    <Placemark>
      <name>${esc(d.name)}</name>
      <description>${esc(d.river)} river, ${d.height_m} m high, ${d.storage_mcm} MCM</description>
      <Point><coordinates>${d.lng},${d.lat},0</coordinates></Point>
    </Placemark>
${rings
  .map(
    (ring) => `    <Placemark>
      <name>Simulated inundation zone (${s.flooded_area_km2.toFixed(1)} sq km)</name>
      <description>Max depth ${s.max_depth_m.toFixed(1)} m | peak speed ${s.peak_speed_ms.toFixed(1)} m/s | reach ${Math.round(s.flood_reach_km)} km</description>
      <styleUrl>#floodPolyStyle</styleUrl>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>${ring.map((p) => p[0].toFixed(5) + "," + p[1].toFixed(5) + ",0").join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`,
  )
  .join("\n")}
  </Document>
</kml>`;
      downloadFile(
        kml,
        `suraksha_setu_${safeName(d)}_extent.kml`,
        "application/vnd.google-earth.kml+xml",
      );
    });
  }

  // ================================================================== 4. SHP (delivered as GeoJSON, which QGIS / ArcGIS open directly)
  if (btnSHP)
    btnSHP.addEventListener("click", () => {
      if (btnGeoJSON) btnGeoJSON.click();
    });

  // ================================================================== 5. printable PDF report
  function hydrographSvg(h) {
    if (!(h && h.t_h && h.q && h.q.length > 3)) return "";
    const W = 700,
      H = 200,
      L0 = 56,
      R0 = 12,
      T0 = 10,
      B0 = 28;
    const tmax = h.t_h[h.t_h.length - 1] || 1,
      qmax = Math.max(...h.q, 1);
    const X = (t) => L0 + ((W - L0 - R0) * t) / tmax,
      Y = (v) => T0 + (H - T0 - B0) * (1 - v / qmax);
    const pts = h.t_h
      .map((t, i) => `${X(t).toFixed(1)},${Y(h.q[i]).toFixed(1)}`)
      .join(" ");
    const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tmax),
      yt = [0, 0.5, 1].map((f) => f * qmax);
    const lab = (v) =>
      v >= 1e3 ? (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + "k" : Math.round(v);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Dam outflow hydrograph" style="font:10px Segoe UI,Arial,sans-serif;fill:#475569">
      <rect x="${L0}" y="${T0}" width="${W - L0 - R0}" height="${H - T0 - B0}" fill="none" stroke="#cbd5e1"/>
      ${yt.map((v) => `<line x1="${L0}" x2="${W - R0}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e2e8f0"/><text x="${L0 - 5}" y="${Y(v) + 3}" text-anchor="end">${lab(v)}</text>`).join("")}
      <polyline fill="rgba(2,132,199,.18)" stroke="#0284c7" stroke-width="1.6" points="${L0},${H - B0} ${pts} ${X(tmax)},${H - B0}"/>
      ${xt.map((t) => `<text x="${X(t)}" y="${H - 10}" text-anchor="middle">${t.toFixed(t < 10 ? 1 : 0)} h</text>`).join("")}
      <text x="12" y="${(H - B0 + T0) / 2}" transform="rotate(-90 12 ${(H - B0 + T0) / 2})" text-anchor="middle">Discharge (m3/s)</text>
    </svg>`;
  }

  if (btnPDF) {
    btnPDF.addEventListener("click", () => {
      const D = load();
      if (!D) return needSimulation();
      const { rep, sim, both, key, m, d, sc, s, ex, stations, place } = D;

      const win = window.open("", "_blank");
      if (!win) {
        alert("Please allow popups to open the printable report.");
        return;
      }

      const storagePct = d.storage_mcm
        ? (100 * sc.released_volume_mcm) / d.storage_mcm
        : null;
      const reached = stations.filter((x) => x.arrival_min != null);
      const first = reached.length
        ? reached.slice().sort((a, b) => a.arrival_min - b.arrival_min)[0]
        : null;
      const speedKmh =
        s.front_arrival_min && s.flood_reach_km
          ? s.flood_reach_km / (s.front_arrival_min / 60)
          : null;
      const ti = m.terrain_info || {};
      const kv = (a, b) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`;

      // SPH vs grid comparison (only when both solvers were run)
      let compare = "";
      if (both) {
        const a = rep.sph.summary,
          b = rep.delft3d.summary;
        const fa = (rep.sph.stations || []).find((x) => x.arrival_min != null),
          fb = (rep.delft3d.stations || []).find((x) => x.arrival_min != null);
        const cols = [
          ["Maximum depth", a.max_depth_m, b.max_depth_m, "m", 1],
          ["Peak velocity", a.peak_speed_ms, b.peak_speed_ms, "m/s", 1],
          ["Flooded area", a.flooded_area_km2, b.flooded_area_km2, "km²", 1],
          ["Flood reach", a.flood_reach_km, b.flood_reach_km, "km", 0],
        ];
        if (fa && fb)
          cols.push([
            `First arrival (${esc(fa.name)})`,
            fa.arrival_min,
            fb.arrival_min,
            "min",
            0,
          ]);
        const diff = (x, y) =>
          x != null && y
            ? `${(100 * (x - y)) / y > 0 ? "+" : ""}${((100 * (x - y)) / y).toFixed(0)} %`
            : "-";
        compare = `
          <h2>SPH vs Delft3D-type grid</h2>
          <p class="muted">Same dam, terrain and breach flow through both solvers. Differences come from the numerical method.</p>
          <table class="cmp"><thead><tr><th>Model</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>
            <tr><td>SPH</td>${cols.map((c) => `<td>${f1(c[1], c[4])} ${c[3]}</td>`).join("")}</tr>
            <tr><td>Delft3D-type grid</td>${cols.map((c) => `<td>${f1(c[2], c[4])} ${c[3]}</td>`).join("")}</tr>
            <tr class="muted"><td>SPH vs grid</td>${cols.map((c) => `<td>${diff(c[1], c[2])}</td>`).join("")}</tr>
          </tbody></table>`;
      }

      const massErr =
        m.diagnostics &&
        m.diagnostics.mass &&
        m.diagnostics.mass.rel_error != null
          ? ` Mass-balance error ${Number(m.diagnostics.mass.rel_error).toExponential(1)}.`
          : "";
      const maxShare = Math.max(...ex.classes.map((c) => c.share), 0.0001);

      win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Flood Impact Analysis Report - ${esc(d.name)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; background: #fff; margin: 0; padding: 20px 30px; font-size: 12px; line-height: 1.4; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { color: #0284c7; font-size: 22px; font-weight: 700; }
  .doc { font-size: 16px; font-weight: 600; margin-top: 4px; }
  .btn-print { padding: 9px 18px; background: #0284c7; color: #fff; border: 0; border-radius: 6px; cursor: pointer; font-weight: 700; }
  h2 { break-after: avoid; font-size: 13.5px; margin: 13px 0 5px; color: #0f172a; border-left: 4px solid #0284c7; padding-left: 8px; }
  .dam { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
  .dam h1 { font-size: 22px; margin: 0 0 2px; }
  .muted { color: #64748b; }
  .pills { margin-top: 8px; }
  .pill { display: inline-block; padding: 2px 10px; border: 1px solid #cbd5e1; border-radius: 99px; background: #fff; font-size: 11.5px; font-weight: 600; margin-right: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 4px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 9px; text-align: left; font-size: 12px; vertical-align: top; }
  th { background: #f1f5f9; color: #334155; font-weight: 600; }
  table.cmp th, table.cmp td { text-align: center; } table.cmp td:first-child, table.cmp th:first-child { text-align: left; font-weight: 600; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .bar { height: 7px; background: #e2e8f0; border-radius: 99px; overflow: hidden; min-width: 60px; }
  .bar i { display: block; height: 100%; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; }
  .c-high { background: #0b2f7a; } .c-moderate { background: #2f80d8; } .c-low { background: #7cc4f5; }
  .foot { border-top: 1px solid #e2e8f0; margin-top: 14px; padding-top: 10px; font-size: 11px; color: #64748b; }
  .foot p { margin: 0 0 5px; }
  .gen { text-align: center; margin-top: 8px; font-size: 10.5px; color: #94a3b8; }
  table, svg, .dam, .two { break-inside: avoid; }
  @media print { body { padding: 0; } .btn-print { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">≋ Suraksha-Setu</div>
      <div class="doc">Flood Impact Analysis Report</div>
    </div>
    <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="dam">
    <h1>${esc(d.name)}</h1>
    <div class="muted">${esc(place)}</div>
    <div class="pills"><span class="pill">${f1(d.height_m, 0)} m high</span><span class="pill">${f1(d.crest_m, 0)} m crest</span><span class="pill">${f1(d.storage_mcm, 0)} MCM gross storage</span></div>
  </div>

  <h2>Scenario: ${esc(sc.name)}</h2>
  <table>
    <tr><th>Peak outflow</th><th>Water released</th>${sc.breach_width_m ? "<th>Breach width</th><th>Time to full breach</th>" : ""}</tr>
    <tr><td><b>${fmtQ(sc.peak_discharge_cms)} m³/s</b> at ${fmtMin(sc.time_to_peak_min)}</td>
        <td><b>${num(sc.released_volume_mcm)} MCM</b>${storagePct != null ? ` (${num(storagePct)} % of storage)` : ""}</td>
        ${sc.breach_width_m ? `<td><b>${f1(sc.breach_width_m, 0)} m</b></td><td><b>${fmtMin(sc.failure_time_min)}</b></td>` : ""}</tr>
  </table>
  ${(sc.notes || []).length ? `<div class="muted">${esc(sc.notes[0])}</div>` : ""}

  <h2>Flood hazard <span class="muted" style="font-weight:400">· results from ${both ? "the " : ""}${esc(modelLabel(key))}${both ? " (the other solver is compared below)" : ""}</span></h2>
  <div class="two">
    <table>
      ${kv("Flooded area", `${f1(s.flooded_area_km2)} km²${s.domain_limited ? " (lower bound)" : ""}`)}
      ${kv("Maximum depth", `${f1(s.max_depth_m)} m`)}
      ${kv("Peak flow speed", `${f1(s.peak_speed_ms)} m/s (${num(s.peak_speed_ms * 3.6)} km/h)`)}
    </table>
    <table>
      ${kv("Flood reach", `${f1(s.flood_reach_km, 0)} km down the river`)}
      ${kv("First town reached", first ? `${esc(first.name)}, ${fmtMin(first.arrival_min)}` : "n/a")}
      ${kv("Average wave speed", speedKmh ? `${f1(speedKmh, 0)} km/h` : "n/a")}
    </table>
  </div>

  <h2>Exposure estimate</h2>
  <table>
    <thead><tr><th>Impact parameter</th><th>Estimate</th><th>Likely range</th></tr></thead>
    <tbody>
      <tr><td>People in the flood zone</td><td><b>${sig(ex.people.mid)}</b></td><td>${rng(ex.people)}</td></tr>
      <tr><td>People in deep water (&gt; 3 m)</td><td><b>${sig(ex.peopleDeep.mid)}</b></td><td>${rng(ex.peopleDeep)}</td></tr>
      <tr><td>Buildings (about ${sig(ex.households.mid)} households)</td><td><b>${sig(ex.buildings.mid)}</b></td><td>${rng(ex.buildings)}</td></tr>
      <tr><td>Roads under water</td><td><b>${sig(ex.roadsKm.mid)} km</b></td><td>${rng(ex.roadsKm)} km</td></tr>
      <tr><td>River crossings (bridges)</td><td><b>${sig(ex.bridges.mid)}</b></td><td>${rng(ex.bridges)}</td></tr>
      <tr><td>Schools</td><td><b>${sig(ex.schools.mid)}</b></td><td>${rng(ex.schools)}</td></tr>
      <tr><td>Health facilities</td><td><b>${sig(ex.health.mid)}</b></td><td>${rng(ex.health)}</td></tr>
      <tr><td>Cropland</td><td><b>${sig(ex.cropHa.mid)} ha</b></td><td>${rng(ex.cropHa)} ha</td></tr>
    </tbody>
  </table>

  <h2>Flooded area by depth</h2>
  <table>
    <thead><tr><th>Depth class</th><th>Area (km²)</th><th>Share</th><th>People</th><th>Buildings</th></tr></thead>
    <tbody>
      ${ex.classes
        .slice()
        .reverse()
        .map(
          (c) => `<tr>
        <td><span class="dot c-${c.key}"></span><b>${c.label}</b> <span class="muted">${c.range}</span></td>
        <td>${f1(c.area)}</td>
        <td><div class="bar"><i class="c-${c.key}" style="width:${((100 * c.share) / maxShare).toFixed(0)}%"></i></div>${(100 * c.share).toFixed(0)} %</td>
        <td>${sig(c.people)}</td><td>${sig(c.buildings)}</td></tr>`,
        )
        .join("")}
      <tr><td><b>Total</b></td><td><b>${f1(ex.totalAreaKm2)}</b></td><td></td><td><b>${sig(ex.people.mid)}</b></td><td><b>${sig(ex.buildings.mid)}</b></td></tr>
    </tbody>
  </table>

  <h2>When the flood arrives</h2>
  ${
    stations.length
      ? `<table>
    <thead><tr><th>Location</th><th>Distance from dam</th><th>Arrival after breach</th><th>Peak depth</th></tr></thead>
    <tbody>${stations.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${f1(x.s_km, 0)} km</td><td>${fmtMin(x.arrival_min)}</td><td>${x.arrival_min == null ? "-" : f1(x.peak_depth_m) + " m"}</td></tr>`).join("")}</tbody>
  </table>`
      : `<p class="muted">No monitored locations along this river.</p>`
  }

  <h2>Dam outflow hydrograph</h2>
  <p class="muted">Discharge leaving the dam through the breach against time since the breach began. This is the flood both solvers route downstream.</p>
  ${hydrographSvg(m.hydrograph)}

  ${compare}

  <div class="foot">
    <p><b>Data.</b> ${esc(confLabel(d.data_confidence))}. Source: ${esc(d.source)}. Terrain: ${esc(ti.z_source || "parametric")} · ${esc(ti.class_ || d.terrain_class)}; river path: ${ti.path_source === "waypoints" ? "real river waypoints" : "straight line with meander"}; Manning roughness n = ${f1(d.manning_n, 3)}.</p>
    <p><b>Method.</b> Breach flow from a broad-crested-weir breach model (Froehlich 2008 width and time), routed downstream by ${esc(m.engine)}.${massErr}</p>
    <p><b>Caution.</b> Exposure is estimated, not counted: flooded area × ${esc(ex.stateLabel)} population density (${num(ex.stateDensity)} per km², Census 2011) adjusted for valley type, with national household, road, school and health-facility ratios, shown as a likely range. This is a planning aid, not a forecast or a substitute for a surveyed dam-break study.</p>
  </div>
  <div class="gen">Generated on ${esc(new Date().toLocaleString())} by the Suraksha-Setu Smart Flood Intelligence Platform</div>
</body>
</html>`);
      win.document.close();
      setTimeout(() => win.print(), 400);
    });
  }
});

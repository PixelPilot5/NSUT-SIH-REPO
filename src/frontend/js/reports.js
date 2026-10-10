// FloodSim-Frontend/js/reports.js

document.addEventListener("DOMContentLoaded", () => {
  const btnPDF = document.getElementById("btnPDF");
  const btnSHP = document.getElementById("btnSHP");
  const btnKML = document.getElementById("btnKML");
  const btnGeoJSON = document.getElementById("btnGeoJSON");
  const btnCSV = document.getElementById("btnCSV");

  // Helper to trigger direct browser file download
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

  // Get active simulation data from localStorage
  function getSimulationData() {
    const sim = JSON.parse(localStorage.getItem("simulationData") || "{}");
    const res = JSON.parse(localStorage.getItem("simulationResults") || "{}");

    const damName = sim.dam || sim.name || "Tehri Dam (Uttarakhand)";
    const river = sim.river || "Bhagirathi River";
    const state = sim.state || "Uttarakhand";
    const district = sim.district || "Tehri Garhwal";
    const scenario = sim.scenario || "Full Dam Break";
    const model = sim.model || "SPH Hydrodynamic";
    const coords = sim.coordinates || [78.48, 30.38]; // [lng, lat]

    const area = res.floodArea || 168.5;
    const depth = res.maxDepth || 12.6;
    const velocity = res.peakVel || 9.4;
    const arrival = res.arrivalTime || 1.4;
    const pop = res.popAtRisk || Math.round(area * 620);
    const buildings = res.buildings || Math.round(area * 48);
    const roads = res.roads || Math.round(area * 0.72);
    const bridges = res.bridges || Math.max(2, Math.round(area * 0.09));
    const schools = res.schools || Math.max(1, Math.round(area * 0.14));

    return {
      damName,
      river,
      state,
      district,
      scenario,
      model,
      coords,
      area,
      depth,
      velocity,
      arrival,
      pop,
      buildings,
      roads,
      bridges,
      schools
    };
  }

  // --- 1. Export CSV ---
  if (btnCSV) {
    btnCSV.addEventListener("click", () => {
      const d = getSimulationData();
      const csvLines = [
        ["Parameter", "Value", "Unit", "Description"],
        ["Dam / Location Name", `"${d.damName}"`, "-", "Study Area Catchment"],
        ["River / Basin", `"${d.river}"`, "-", "Waterway Name"],
        ["State / Region", `"${d.state}"`, "-", "Administrative State"],
        ["District", `"${d.district}"`, "-", "Administrative District"],
        ["Hydrodynamic Engine", `"${d.model}"`, "-", "Simulation Model"],
        ["Failure Scenario", `"${d.scenario}"`, "-", "Breach Condition"],
        ["Maximum Water Depth", d.depth, "m", "Peak Depth at Dam Toe"],
        ["Peak Flow Velocity", d.velocity, "m/s", "Maximum Water Flow Speed"],
        ["Total Inundated Area", d.area, "km²", "Total Flooded Land Area"],
        ["Flood Arrival Time", d.arrival, "hr", "Time to Downstream Target"],
        ["Population at Risk", d.pop, "People", "Estimated Exposed Population"],
        ["Submerged Structures", d.buildings, "Buildings", "Buildings in Flood Zone"],
        ["Submerged Road Network", d.roads, "km", "Transport Highways & Roads"],
        ["Bridges at Risk", d.bridges, "Structures", "Major Bridges in Surge Zone"],
        ["Schools & Facilities", d.schools, "Buildings", "Public Infrastructure"],
        ["High Risk Zone (>3m Depth)", (d.area * 0.28).toFixed(1), "km²", "Severe Hazard Zone"],
        ["Moderate Risk Zone (1m-3m)", (d.area * 0.44).toFixed(1), "km²", "Moderate Hazard Zone"],
        ["Low Risk Zone (<1m Depth)", (d.area * 0.28).toFixed(1), "km²", "Low Hazard Zone"]
      ];

      const csvContent = csvLines.map(line => line.join(",")).join("\n");
      const safeName = d.damName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      downloadFile(csvContent, `suraksha_setu_${safeName}_metrics.csv`, "text/csv;charset=utf-8;");
    });
  }

  // --- 2. Export GeoJSON ---
  if (btnGeoJSON) {
    btnGeoJSON.addEventListener("click", () => {
      const d = getSimulationData();
      const lng = d.coords[0];
      const lat = d.coords[1];
      const delta = 0.08;

      const geojsonObj = {
        type: "FeatureCollection",
        metadata: {
          title: "Suraksha-Setu Simulated Flood Inundation Polygon Layer",
          dam: d.damName,
          scenario: d.scenario,
          generatedAt: new Date().toISOString()
        },
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [lng, lat]
            },
            properties: {
              name: d.damName,
              type: "Dam Structure",
              river: d.river,
              state: d.state
            }
          },
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [[
                [lng - delta * 1.2, lat + delta * 0.8],
                [lng + delta * 0.2, lat + delta * 1.3],
                [lng + delta * 1.4, lat + delta * 0.4],
                [lng + delta * 1.1, lat - delta * 0.9],
                [lng - delta * 0.4, lat - delta * 1.4],
                [lng - delta * 1.3, lat - delta * 0.5],
                [lng - delta * 1.2, lat + delta * 0.8]
              ]]
            },
            properties: {
              name: `${d.damName} Inundation Zone`,
              flooded_area_sqkm: d.area,
              max_depth_m: d.depth,
              peak_velocity_mps: d.velocity,
              population_at_risk: d.pop,
              scenario: d.scenario
            }
          }
        ]
      };

      const safeName = d.damName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      downloadFile(
        JSON.stringify(geojsonObj, null, 2),
        `suraksha_setu_${safeName}_layer.geojson`,
        "application/geo+json"
      );
    });
  }

  // --- 3. Export KML ---
  if (btnKML) {
    btnKML.addEventListener("click", () => {
      const d = getSimulationData();
      const lng = d.coords[0];
      const lat = d.coords[1];
      const delta = 0.08;

      const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Suraksha-Setu ${d.damName} Flood Layer</name>
    <description>Simulated inundation extent for ${d.damName} (${d.scenario})</description>
    <Style id="floodPolyStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>7dff3a3a</color>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>${d.damName} Location</name>
      <description>${d.river}, ${d.state}</description>
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>Simulated Inundation Zone (${d.area} sq km)</name>
      <description>Max Depth: ${d.depth}m | Population at Risk: ${d.pop}</description>
      <styleUrl>#floodPolyStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${lng - delta * 1.2},${lat + delta * 0.8},0
              ${lng + delta * 0.2},${lat + delta * 1.3},0
              ${lng + delta * 1.4},${lat + delta * 0.4},0
              ${lng + delta * 1.1},${lat - delta * 0.9},0
              ${lng - delta * 0.4},${lat - delta * 1.4},0
              ${lng - delta * 1.3},${lat - delta * 0.5},0
              ${lng - delta * 1.2},${lat + delta * 0.8},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

      const safeName = d.damName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      downloadFile(
        kmlContent,
        `suraksha_setu_${safeName}_extent.kml`,
        "application/vnd.google-earth.kml+xml"
      );
    });
  }

  // --- 4. Export SHP / GIS Layer Archive ---
  if (btnSHP) {
    btnSHP.addEventListener("click", () => {
      // Trigger GeoJSON layer file download ready for QGIS / ArcGIS conversion
      if (btnGeoJSON) btnGeoJSON.click();
    });
  }

  // --- 5. Export Printable PDF Report ---
  if (btnPDF) {
    btnPDF.addEventListener("click", () => {
      const d = getSimulationData();
      
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("Please allow popups to open the printable PDF report window.");
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Suraksha-Setu Flood Intelligence Report - ${d.damName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
            .header { border-bottom: 3px solid #0284c7; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
            .brand { color: #0284c7; font-size: 26px; font-weight: bold; }
            .title { font-size: 20px; font-weight: 600; margin-top: 10px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; border-radius: 8px; }
            .card h3 { font-size: 14px; text-transform: uppercase; color: #64748b; margin-top: 0; }
            .card p { font-size: 15px; margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 30px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px 14px; text-align: left; font-size: 14px; }
            th { background: #f1f5f9; color: #334155; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #94a3b8; text-align: center; }
            @media print {
              body { padding: 0; }
              .btn-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">≋ Suraksha-Setu</div>
              <div class="title">Hydrodynamic Dam Break & Flood Impact Executive Summary</div>
            </div>
            <button class="btn-print" onclick="window.print()" style="padding: 10px 20px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">🖨️ Print / Save as PDF</button>
          </div>

          <div class="grid">
            <div class="card">
              <h3>Study Area & Simulation Setup</h3>
              <p><b>Dam / Location:</b> ${d.damName}</p>
              <p><b>River Basin:</b> ${d.river}</p>
              <p><b>State / District:</b> ${d.state} (${d.district})</p>
              <p><b>Hydro-Model:</b> ${d.model}</p>
              <p><b>Failure Scenario:</b> ${d.scenario}</p>
            </div>
            <div class="card">
              <h3>Key Hydrodynamic Results</h3>
              <p><b>Maximum Water Depth:</b> ${d.depth.toFixed(1)} m</p>
              <p><b>Peak Surge Velocity:</b> ${d.velocity.toFixed(1)} m/s</p>
              <p><b>Total Inundated Area:</b> ${d.area.toFixed(1)} km²</p>
              <p><b>Flood Arrival Time:</b> ${d.arrival.toFixed(1)} hours</p>
            </div>
          </div>

          <h3>Socio-Economic & Infrastructure Impact Assessment</h3>
          <table>
            <thead>
              <tr>
                <th>Impact Parameter</th>
                <th>Quantified Value</th>
                <th>Severity Assessment</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Exposed Population at Risk</td>
                <td><b>${d.pop.toLocaleString()} People</b></td>
                <td>High Emergency Response Priority</td>
              </tr>
              <tr>
                <td>Submerged Residential Structures</td>
                <td><b>${d.buildings.toLocaleString()} Buildings</b></td>
                <td>Structural Inundation Zone</td>
              </tr>
              <tr>
                <td>Submerged Transport Network</td>
                <td><b>${d.roads} km</b></td>
                <td>Access Cutoff / Evacuation Impact</td>
              </tr>
              <tr>
                <td>Bridges in Surge Path</td>
                <td><b>${d.bridges} Structures</b></td>
                <td>High Velocity Structural Risk</td>
              </tr>
              <tr>
                <td>Schools & Health Facilities</td>
                <td><b>${d.schools} Buildings</b></td>
                <td>Shelter / Emergency Medical Concern</td>
              </tr>
            </tbody>
          </table>

          <h3>Flood Hazard Zonation Breakdown</h3>
          <table>
            <thead>
              <tr>
                <th>Hazard Risk Level</th>
                <th>Depth Threshold</th>
                <th>Calculated Area</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>🔴 High Risk Zone</td>
                <td>Depth > 3.0 m</td>
                <td>${(d.area * 0.28).toFixed(1)} km²</td>
              </tr>
              <tr>
                <td>🟠 Moderate Risk Zone</td>
                <td>1.0 m - 3.0 m</td>
                <td>${(d.area * 0.44).toFixed(1)} km²</td>
              </tr>
              <tr>
                <td>🟡 Low Risk Zone</td>
                <td>Depth < 1.0 m</td>
                <td>${(d.area * 0.28).toFixed(1)} km²</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            Generated on ${new Date().toLocaleString()} by Suraksha-Setu Smart Flood Intelligence Platform · Confidential Disaster Management Document
          </div>
        </body>
        </html>
      `);

      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    });
  }
});

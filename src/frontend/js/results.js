document.addEventListener("DOMContentLoaded", () => {
  const data = JSON.parse(localStorage.getItem("simulationData") || "{}");
  const slider = document.getElementById("slider");
  const tv = document.getElementById("tv");

  let centerLat = 30.38;
  let centerLng = 78.48;

  if (data.coordinates && Array.isArray(data.coordinates) && data.coordinates.length >= 2) {
    centerLng = data.coordinates[0];
    centerLat = data.coordinates[1];
  }

  if (data.dam) {
    document.getElementById("simulationInfo").textContent =
      `${data.dam} (${data.river || "Basin"}) · ${data.scenario || "Full Dam Break"} · Hydro-Model: ${data.model || "SPH"}`;
  } else if (data.name) {
    document.getElementById("simulationInfo").textContent =
      `${data.name} · Hydro-Model: ${data.model || "SPH"}`;
  }

  const m = L.map("resultMap").setView([centerLat, centerLng], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
  }).addTo(m);

  // Generate dynamic flood inundation polygon around center location
  const d = 0.08;
  const polygonCoords = [
    [centerLat + d * 0.8, centerLng - d * 1.2],
    [centerLat + d * 1.3, centerLng + d * 0.2],
    [centerLat + d * 0.4, centerLng + d * 1.4],
    [centerLat - d * 0.9, centerLng + d * 1.1],
    [centerLat - d * 1.4, centerLng - d * 0.4],
    [centerLat - d * 0.5, centerLng - d * 1.3],
  ];

  L.polygon(polygonCoords, {
    color: "#e63946",
    fillColor: "#3a86ff",
    fillOpacity: 0.55,
    weight: 2
  })
    .addTo(m)
    .bindPopup(`<b>Simulated Flood Extent</b><br>${data.dam || "Study Area"}`);

  // Scenario impact calculations
  const scenario = data.scenario || "Full Dam Break";
  let maxDepth = 8.4;
  let peakVel = 6.2;
  let floodArea = 128.4;
  let arrivalTime = 2.8;

  if (scenario.includes("Full")) {
    maxDepth = 12.6;
    peakVel = 9.4;
    floodArea = 168.5;
    arrivalTime = 1.4;
  } else if (scenario.includes("Partial")) {
    maxDepth = 6.8;
    peakVel = 5.1;
    floodArea = 86.2;
    arrivalTime = 3.2;
  } else if (scenario.includes("Overtopping")) {
    maxDepth = 4.2;
    peakVel = 3.4;
    floodArea = 52.0;
    arrivalTime = 5.6;
  }

  // Derived population & structure impacts
  const popAtRisk = Math.round(floodArea * 620);
  const buildings = Math.round(floodArea * 48);
  const roads = Math.round(floodArea * 0.72);
  const bridges = Math.max(2, Math.round(floodArea * 0.09));
  const schools = Math.max(1, Math.round(floodArea * 0.14));

  // Save computed results into localStorage for analysis & reports
  const resultsObj = {
    maxDepth,
    peakVel,
    floodArea,
    arrivalTime,
    popAtRisk,
    buildings,
    roads,
    bridges,
    schools
  };
  localStorage.setItem("simulationResults", JSON.stringify(resultsObj));

  // Render key results panel
  const resultsPanel = document.querySelector(".resultgrid .panel:last-child");
  if (resultsPanel) {
    resultsPanel.innerHTML = `
      <h3>Key Simulation Results</h3>
      <p>Maximum Depth <b>${maxDepth.toFixed(1)} m</b></p>
      <p>Peak Velocity <b>${peakVel.toFixed(1)} m/s</b></p>
      <p>Flooded Area <b>${floodArea.toFixed(1)} km²</b></p>
      <p>Arrival Time <b>${arrivalTime.toFixed(1)} hr</b></p>
      <hr class="my-2" />
      <p>Est. Population at Risk <b>${popAtRisk.toLocaleString()}</b></p>
      <p>Affected Structures <b>${buildings.toLocaleString()}</b></p>
    `;
  }

  if (slider && tv) {
    slider.oninput = () => {
      tv.textContent = slider.value + " hr";
    };
  }
});


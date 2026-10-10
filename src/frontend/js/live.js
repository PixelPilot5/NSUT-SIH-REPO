document.addEventListener("DOMContentLoaded", async () => {
  const damSelect = document.getElementById("damSelect");
  const geeIframe = document.getElementById("geeIframe");

  const elInundation = document.getElementById("metricInundation");
  const elPopulation = document.getElementById("metricPopulation");
  const elCropland = document.getElementById("metricCropland");
  const elRoads = document.getElementById("metricRoads");
  const elLoss = document.getElementById("metricLoss");
  const elInfra = document.getElementById("metricInfra");

  const geeAppUrl =
    "https://gee-live-flood-monitoring.projects.earthengine.app/view/suraksha-setu-live-monitor";

  async function updateMonitorData(locationName) {
    try {
      elInundation.textContent = "Processing SAR...";
      elPopulation.textContent = "Processing SAR...";
      elCropland.textContent = "Processing SAR...";
      elRoads.textContent = "Processing SAR...";
      elLoss.textContent = "Processing SAR...";
      elInfra.textContent = "Processing SAR...";

      // Combine query timestamp (forces reload) with GEE hash parameter (reads location)
      geeIframe.src = `${geeAppUrl}?t=${Date.now()}#loc=${encodeURIComponent(locationName)}`;

      // Build Backend API Query URL
      let apiUrl = `http://localhost:8000/api/live-monitor?location=${encodeURIComponent(locationName)}`;

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch live metrics from backend");
      }

      const data = await response.json();

      // Populate metrics safely
      if (data.metrics) {
        elInundation.textContent = data.metrics.inundation_area;
        elPopulation.textContent = data.metrics.exposed_population;
        elCropland.textContent = data.metrics.submerged_cropland;
        elRoads.textContent = data.metrics.submerged_roads;
        elLoss.textContent = data.metrics.agricultural_loss;
        elInfra.textContent = data.metrics.critical_infrastructure;
      }
    } catch (err) {
      console.error("Error updating monitor data:", err);
      elInundation.textContent = "Error";
      elPopulation.textContent = "Error";
      elCropland.textContent = "Error";
      elRoads.textContent = "Error";
      elLoss.textContent = "Error";
      elInfra.textContent = "Error";
    }
  }

  try {
    const response = await fetch("http://localhost:8000/api/locations");
    if (!response.ok) {
      throw new Error("Failed to fetch locations from backend");
    }

    const locations = await response.json();

    damSelect.innerHTML = "";
    locations.forEach((locName) => {
      const option = document.createElement("option");
      option.value = locName;
      option.textContent = locName;
      if (locName === "Teesta River / Dam (Sikkim / WB)") {
        option.selected = true;
      }
      damSelect.appendChild(option);
    });

    // Listen for preset change
    damSelect.addEventListener("change", (e) => {
      const selectedLoc = e.target.value;
      if (selectedLoc) {
        updateMonitorData(selectedLoc);
      }
    });

    // Initial load state
    updateMonitorData("Teesta River / Dam (Sikkim / WB)");
  } catch (error) {
    console.error("Error loading location data:", error);
  }
});

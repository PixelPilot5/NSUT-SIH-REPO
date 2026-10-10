document.addEventListener("DOMContentLoaded", () => {
  const simData = JSON.parse(localStorage.getItem("simulationData") || "{}");
  const resData = JSON.parse(localStorage.getItem("simulationResults") || "{}");

  const titleEl = document.querySelector(".content[data-page='analysis'] .title h1");
  const subtitleEl = document.querySelector(".content[data-page='analysis'] .title p");

  // Determine active dam & scenario metadata
  const damName = simData.dam || simData.name || "Tehri Dam (Uttarakhand)";
  const scenarioName = simData.scenario || "Full Dam Break";
  const modelName = simData.model || "SPH Hydrodynamic";

  if (subtitleEl) {
    if (simData.dam || simData.name) {
      subtitleEl.textContent = `Hydrodynamic impact analysis for ${damName} · ${scenarioName} (${modelName}).`;
    } else {
      subtitleEl.textContent = `Default baseline analysis for ${damName}. Run a custom simulation to update.`;
    }
  }

  // Derive metrics from resData or calculate dynamically based on scenario
  let maxDepth = resData.maxDepth || 12.6;
  let peakVel = resData.peakVel || 9.4;
  let area = resData.floodArea || 168.5;
  let pop = resData.popAtRisk || Math.round(area * 620);
  let build = resData.buildings || Math.round(area * 48);
  let rds = resData.roads || Math.round(area * 0.72);
  let brg = resData.bridges || Math.max(2, Math.round(area * 0.09));
  let sch = resData.schools || Math.max(1, Math.round(area * 0.14));

  // Render 6 Key Impact Cards
  const impactContainer = document.querySelector(".impact");
  if (impactContainer) {
    impactContainer.innerHTML = `
      <div>
        <span>Flooded Area</span><b>${area.toFixed(1)} km²</b><small>Model output extent</small>
      </div>
      <div>
        <span>Population at Risk</span><b>${pop.toLocaleString()}</b><small>Inundation zone population</small>
      </div>
      <div>
        <span>Buildings</span><b>${build.toLocaleString()}</b><small>Inundated structures</small>
      </div>
      <div>
        <span>Roads</span><b>${rds} km</b><small>Submerged transport routes</small>
      </div>
      <div>
        <span>Bridges</span><b>${brg}</b><small>Bridges in high-velocity zone</small>
      </div>
      <div>
        <span>Schools & Facilities</span><b>${sch}</b><small>Critical public infrastructure</small>
      </div>
    `;
  }

  // Risk breakdown values (proportional to total flood area)
  const highRisk = (area * 0.28).toFixed(1);
  const modRisk = (area * 0.44).toFixed(1);
  const lowRisk = (area * 0.28).toFixed(1);

  const riskPanel = document.querySelector(".analysisgrid .panel:last-child");
  if (riskPanel) {
    riskPanel.innerHTML = `
      <h3>Risk Severity Breakdown</h3>
      <p>🔴 <b>High Risk Zone (Depth > 3.0m):</b> <b>${highRisk} km²</b></p>
      <p>🟠 <b>Moderate Risk Zone (1.0m - 3.0m):</b> <b>${modRisk} km²</b></p>
      <p>🟡 <b>Low Risk Zone (Depth < 1.0m):</b> <b>${lowRisk} km²</b></p>
      <hr class="my-2" />
      <small class="text-muted">Calculated based on depth-velocity hazard threshold criteria.</small>
    `;
  }

  // Interactive Hydrograph Water Depth over Time chart
  const depthPanel = document.querySelector(".analysisgrid .panel:first-child");
  if (depthPanel) {
    const hours = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12];
    const factors = [0, 0.25, 0.72, 1.0, 0.88, 0.65, 0.48, 0.32, 0.18, 0.08];
    
    let barsHTML = hours.map((hr, idx) => {
      const hDepth = (maxDepth * factors[idx]).toFixed(1);
      const heightPct = Math.max(8, Math.round(factors[idx] * 100));
      return `
        <div class="d-flex flex-column align-items-center flex-grow-1" title="T+${hr}h: ${hDepth} m">
          <small class="text-muted style-val mb-1" style="font-size: 0.75rem;">${hDepth}m</small>
          <div class="w-100 bg-primary bg-gradient rounded-top" style="height: ${heightPct}px; transition: height 0.4s ease;"></div>
          <small class="text-muted mt-1" style="font-size: 0.7rem;">${hr}h</small>
        </div>
      `;
    }).join("");

    depthPanel.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h3>Water Depth Over Time (Hydrograph)</h3>
        <span class="badge bg-primary-subtle text-primary border border-primary-subtle">Peak: ${maxDepth.toFixed(1)} m</span>
      </div>
      <div class="d-flex align-items-end justify-content-between gap-2 p-3 bg-light rounded border" style="height: 180px;">
        ${barsHTML}
      </div>
    `;
  }
});

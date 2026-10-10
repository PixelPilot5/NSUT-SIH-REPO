document.addEventListener("DOMContentLoaded", () => {
  let p = 0;
  const runname = document.getElementById("runname");
  const pct = document.getElementById("pct");
  const bar = document.getElementById("bar");

  // Read data saved from simulation wizard
  const d = JSON.parse(localStorage.getItem("simulationData") || "{}");

  // Set header title dynamically based on user selection
  if (runname) {
    if (d.name) {
      runname.textContent = d.name;
    } else if (d.river) {
      runname.textContent = `${d.river} · ${d.scenario || "Dam Break"}`;
    } else {
      runname.textContent = "Custom Flood Simulation";
    }
  }

  // Helper function to animate checklist indicators dynamically
  function updateSteps(progress) {
    const s1 = document.getElementById("step-1");
    const s2 = document.getElementById("step-2");
    const s3 = document.getElementById("step-3");
    const s4 = document.getElementById("step-4");
    const s5 = document.getElementById("step-5");

    if (!s1) return;

    if (progress >= 10) s1.innerHTML = "✓ Preparing terrain & region data";
    else if (progress > 0) s1.innerHTML = "◌ Preparing terrain & region data";

    if (progress >= 30) s2.innerHTML = "✓ Loading DEM (Elevation Model)";
    else if (progress >= 10) s2.innerHTML = "◌ Loading DEM (Elevation Model)";

    if (progress >= 55) s3.innerHTML = "✓ Processing hydrology & catchment";
    else if (progress >= 30)
      s3.innerHTML = "◌ Processing hydrology & catchment";

    if (progress >= 80) s4.innerHTML = "✓ Running hydrodynamic model engine";
    else if (progress >= 55)
      s4.innerHTML = "◌ Running hydrodynamic model engine";

    if (progress >= 100)
      s5.innerHTML = "✓ Generating flood depth & velocity map";
    else if (progress >= 80)
      s5.innerHTML = "◌ Generating flood depth & velocity map";
  }

  // Simulation Progress Loop
  const t = setInterval(() => {
    p += 5;
    if (p > 100) p = 100;

    if (bar) bar.style.width = p + "%";
    if (pct) pct.textContent = p + "%";
    updateSteps(p);

    if (p >= 100) {
      clearInterval(t);
      setTimeout(() => {
        // Redirects to results page with flood extent map
        location.href = "results.html";
      }, 500);
    }
  }, 150);
});

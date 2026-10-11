document.addEventListener("DOMContentLoaded", async () => {
  const runname = document.getElementById("runname");
  const pct = document.getElementById("pct");
  const bar = document.getElementById("bar");
  const d = JSON.parse(localStorage.getItem("simulationData") || "{}");

  if (runname) {
    if (d.name) runname.textContent = d.name;
    else if (d.river) runname.textContent = `${d.river} · ${d.scenario || "Dam Break"}`;
    else runname.textContent = "Custom Flood Simulation";
  }

  const stepIds = ["step-1", "step-2", "step-3", "step-4", "step-5"];
  const labels = [
    "Preparing terrain & region data",
    "Loading DEM (Elevation Model)",
    "Processing hydrology & catchment",
    "Running hydrodynamic model engine",
    "Generating flood depth & velocity map",
  ];
  // progress thresholds (0..100) at which each step is "done"
  const done = [8, 14, 22, 98, 100];

  function paint(progress, message) {
    const p = Math.max(0, Math.min(100, Math.round(progress)));
    if (bar) bar.style.width = p + "%";
    if (pct) pct.textContent = p + "%";
    stepIds.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      const mark = p >= done[i] ? "✓" : (i === 0 || p >= done[i - 1]) ? "◌" : "○";
      let text = labels[i];
      if (mark === "◌" && i === 3 && message) text = message;
      el.textContent = `${mark} ${text}`;
    });
  }

  function fail(err) {
    const box = document.getElementById("status-steps");
    if (box) {
      const msg = String(err && err.message ? err.message : err);
      const offline = /Failed to fetch|NetworkError|Load failed/i.test(msg);
      box.insertAdjacentHTML("beforeend",
        `<div class="alert alert-danger mt-3 mb-0"><b>Simulation could not run.</b><br>` +
        (offline
          ? `The backend is not reachable at <code>${FloodAPI.BASE}</code>.<br>Start it with <code>cd backend &amp;&amp; python server.py</code>, then reload this page.`
          : msg.replace(/</g, "&lt;")) +
        `</div>`);
    }
  }

  if (!window.FloodAPI) { fail("api.js did not load"); return; }

  // short, honest animation while the job is being queued/created
  paint(2, "");
  try {
    const id = await FloodAPI.ensureJob(d);
    await FloodAPI.poll(id, (s) => {
      // the solver reports 0..1; reserve the first ~22 % for terrain/hydrology preparation
      const p = s.state === "queued" ? 4 : 22 + 76 * (s.progress || 0);
      paint(p, s.message ? `${s.message} (${Math.round(100 * (s.progress || 0))} %)` : "");
    }, 800);
    paint(100, "");
    setTimeout(() => { location.href = "results.html"; }, 500);
  } catch (e) {
    console.error(e);
    fail(e);
  }
});

/*
 * results.js - Flood Simulation Results page
 *
 * Takes the REAL solver output from the FastAPI backend (backend/solvers.py) and shows it:
 *   SPH      -> smooth particles flowing out of the selected dam
 *   Delft3D  -> the curvilinear computational grid filling with water (map view and 3D view)
 * Nothing on this page is random or hard-coded: every number comes from the solver result.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const f1 = (v, d = 1) => (v == null || !Number.isFinite(v) ? "n/a" : Number(v).toFixed(d));
  const fmtMin = (m) => {
    if (m == null || !Number.isFinite(m)) return "not reached";
    if (m < 90) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60), r = Math.round(m - 60 * h);
    return `${h} h ${String(r).padStart(2, "0")} min`;
  };
  const fmtHM = (h) => {
    const m = Math.round(h * 60);
    return m < 120 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  };
  const fmtQ = (q) => (q == null ? "n/a" : q >= 1e5 ? `${(q / 1e3).toFixed(0)}k` : q >= 1e4 ? `${(q / 1e3).toFixed(1)}k` : Math.round(q).toLocaleString());

  // ------------------------------------------------------------------ wizard data
  let data = JSON.parse(localStorage.getItem("simulationData") || "{}");
  if (!data.dam_id && !data.dam && !data.name) {
    data = { dam_id: "tehri", dam: "Tehri Dam", scenario: "Full Dam Break", model: "SPH" }; // page opened directly
  }
  const scenario = data.scenario || "Full Dam Break";
  const modelPref = String(data.model || "SPH").toUpperCase();
  const infoEl = $("simulationInfo");
  if (infoEl) infoEl.textContent = `${data.dam || data.name} · Scenario: ${scenario} · Model: ${data.model || "SPH"}`;

  if (typeof L === "undefined") {
    $("loadTitle").textContent = "Map library not loaded";
    $("loadErr").innerHTML = "<span class='text-danger'>Leaflet could not be loaded (check the internet connection).</span>";
    return;
  }

  // ------------------------------------------------------------------ map
  const start = Array.isArray(data.coordinates) ? [data.coordinates[1], data.coordinates[0]] : [22.5, 79];
  const map = L.map("resultMap", { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false })
    .setView(start, Array.isArray(data.coordinates) ? 9 : 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);
  const featureLayer = L.layerGroup().addTo(map);

  // ------------------------------------------------------------------ run / fetch the simulation
  function overlayState(title, msg, pct, err) {
    $("loadOverlay").classList.remove("hide");
    if (title) $("loadTitle").textContent = title;
    if (msg != null) $("loadMsg").textContent = msg;
    if (pct != null) $("loadBar").style.width = Math.max(3, Math.min(100, pct)) + "%";
    $("loadErr").innerHTML = err || "";
  }

  let result = null;
  async function obtain() {
    overlayState("Running hydrodynamic solver…", "Contacting the backend…", 3, "");
    try {
      const id = await FloodAPI.ensureJob(data);
      await FloodAPI.poll(id, (s) => {
        overlayState(null, `${s.message || "Working"} · ${Math.round(100 * (s.progress || 0))} %  (${s.elapsed_s}s)`, 5 + 95 * (s.progress || 0));
      }, 700);
      result = await FloodAPI.result(id);
      $("loadOverlay").classList.add("hide");
      return true;
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      const offline = /Failed to fetch|NetworkError|Load failed/i.test(msg);
      overlayState("Simulation unavailable", offline ? "Backend not reachable" : "The solver reported an error", 0,
        `<div class="text-danger small">${offline
          ? `No server at <code>${esc(FloodAPI.BASE)}</code>. Start it with <code>cd backend &amp;&amp; python server.py</code>.`
          : esc(msg)}</div><button class="btn btn-sm btn-primary mt-2" id="retryBtn">Retry</button>`);
      const b = $("retryBtn");
      if (b) b.onclick = () => { localStorage.removeItem("simulationJob"); location.reload(); };
      return false;
    }
  }
  if (!(await obtain())) return;

  // ------------------------------------------------------------------ models
  const models = {};
  if (result.comparison) { models.sph = result.sph; models.delft3d = result.delft3d; }
  else if (result.particles) models.sph = result;
  else models.delft3d = result;
  const sims = {};
  const getSim = (m) => sims[m] || (sims[m] = new FloodRender.Sim(models[m]));
  let current = modelPref.includes("DELFT") && models.delft3d ? "delft3d" : models.sph ? "sph" : "delft3d";
  const both = !!(models.sph && models.delft3d);
  const damRec = (models[current] || {}).dam || {};
  const damName = damRec.name || data.dam || "Dam";
  const duration = (models[current] || {}).duration_h;

  // ------------------------------------------------------------------ map layers + overlay
  let overlay = new FloodRender.MapOverlay(map, getSim(current));
  let scene3d = null;
  let view = "map";

  function typicalWidthM(sim) {
    const w = [];
    for (let i = 0; i < sim.ns; i++) {
      let c = 0;
      for (let j = 0; j < sim.nn; j++) if (sim.maxDepth[i * sim.nn + j] > 10) c++;
      if (c) w.push(c * sim.dn);
    }
    if (!w.length) return 300;
    w.sort((a, b) => a - b);
    return Math.max(100, w[Math.floor(w.length / 2)]);
  }

  function zoomForFollow(sim) {
    const mpp = typicalWidthM(sim) / 14;                       // want the flood ~14 px wide
    const z = Math.log2((156543.03 * Math.cos((sim.lat[0] * Math.PI) / 180)) / mpp);
    return Math.max(7, Math.min(13, Math.floor(z)));
  }

  function drawFeatures() {
    featureLayer.clearLayers();
    const m = models[current], sim = getSim(current);
    const pts = [];
    for (let i = 0; i < sim.ns; i += 3) pts.push([sim.lat[i], sim.lng[i]]);
    L.polyline(pts, { color: "#0a58ca", weight: 2, opacity: 0.55, dashArray: "6 6" }).addTo(featureLayer);
    if (m.extent_geojson) {
      L.geoJSON(m.extent_geojson, { style: { color: "#d9480f", weight: 1.5, fill: false, dashArray: "3 5", opacity: 0.8 }, interactive: false }).addTo(featureLayer);
    }
    L.marker([damRec.lat, damRec.lng]).addTo(featureLayer)
      .bindPopup(`<b>${esc(damName)}</b><br>${esc(damRec.river || "")}<br>Height ${f1(damRec.height_m, 0)} m · storage ${f1(damRec.storage_mcm, 0)} MCM`);
    (m.stations || []).forEach((s) => {
      L.circleMarker([s.lat, s.lng], { radius: 5, color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.95, weight: 2 })
        .addTo(featureLayer)
        .bindTooltip(`${esc(s.name)} · ${s.arrival_min == null ? "not reached" : "arrives " + fmtMin(s.arrival_min)}`);
    });
  }

  function fitAll() {
    const sim = getSim(current);
    const b = L.latLngBounds([]);
    for (let i = 0; i < sim.ns; i += 4) b.extend([sim.lat[i], sim.lng[i]]);
    const reach = Math.min(sim.ns - 1, Math.ceil((sim.reachKm * 1000) / sim.ds));
    const b2 = L.latLngBounds([]);
    for (let i = 0; i <= reach; i += 2) b2.extend([sim.lat[i], sim.lng[i]]);
    map.fitBounds(b2.isValid() ? b2 : b, { padding: [30, 30], animate: false });
  }

  // ------------------------------------------------------------------ legend
  function drawLegend() {
    const sim = getSim(current), m = models[current];
    const box = $("legendBox");
    if (sim.kind === "grid") {
      const st = FloodRender.DEPTH_STOPS;
      box.innerHTML = `<b>Water depth (m)</b><div class="ramp">${FloodRender.DEPTH_COLORS.map((c) => `<i style="background:rgb(${c})"></i>`).join("")}</div>
        <div class="ramp-lbl">${st.map((v, i) => `<span>${i === st.length - 1 ? v + "+" : v}</span>`).join("")}</div>
        <small>Each box is one cell of the river-fitted grid (${f1(sim.ds, 0)} × ${f1(sim.dn, 0)} m, ${sim.ns * sim.nn} cells).</small>`;
    } else {
      const st = FloodRender.SPEED_STOPS;
      box.innerHTML = `<b>Particle speed (m/s)</b><div class="ramp">${FloodRender.SPEED_COLORS.map((c) => `<i style="background:rgb(${c})"></i>`).join("")}</div>
        <div class="ramp-lbl">${st.map((v, i) => `<span>${i === st.length - 1 ? v + "+" : v}</span>`).join("")}</div>
        <small>${sim.N} particles, each carrying ${(sim.Vp / 1e6).toFixed(2)} million m³ of water. Circle size = smoothing length.</small>`;
    }
    $("mapTitle").textContent = sim.kind === "grid" ? "Flood Extent · Delft3D-type grid" : "Flood Extent · SPH particles";
  }

  // ------------------------------------------------------------------ side panel
  function firstArrival(m) {
    const a = (m.stations || []).filter((s) => s.arrival_min != null);
    return a.length ? a[0] : null;
  }

  function drawSide() {
    const m = models[current], s = m.summary, sc = m.scenario, fa = firstArrival(m);
    $("sidePanel").innerHTML = `
      <h3>Key Results <small class="text-muted">· ${current === "sph" ? "SPH" : "Delft3D-type"}</small></h3>
      <div class="kv"><span>Maximum depth</span><b>${f1(s.max_depth_m)} m</b></div>
      <div class="kv"><span>Peak velocity</span><b>${f1(s.peak_speed_ms)} m/s</b></div>
      <div class="kv"><span>Flooded area</span><b>${f1(s.flooded_area_km2)} km²${s.domain_limited ? " +" : ""}</b></div>
      <div class="kv"><span>Flood reach</span><b>${f1(s.flood_reach_km, 0)} km</b></div>
      <div class="kv"><span>First arrival</span><b>${fa ? esc(fa.name) + ": " + fmtMin(fa.arrival_min) : fmtMin(s.front_arrival_min)}</b></div>
      <div class="kv"><span>Peak outflow at dam</span><b>${fmtQ(sc.peak_discharge_cms)} m³/s</b></div>
      <div class="kv"><span>High-risk area (&gt;3 m)</span><b>${f1(s.risk_area_km2.high)} km²</b></div>
      <hr class="my-2" />
      <div class="kv"><span>Now</span><b id="nowTime">0 min</b></div>
      <div class="kv"><span>Flood front</span><b id="nowFront">0.0 km</b></div>
      `;
  }

  // Saves what the Flood Analysis and Reports pages read.
  function persist() {
    const m = models[current], s = m.summary, fa = firstArrival(m);
    localStorage.setItem("simulationResults", JSON.stringify({
      damName, modelType: current === "sph" ? "SPH" : "Delft3D", scenario,
      maxDepth: s.max_depth_m, peakVel: s.peak_speed_ms, floodArea: s.flooded_area_km2,
      arrivalTime: fa ? fa.arrival_min / 60 : (s.front_arrival_min || 0) / 60,
      riskArea: s.risk_area_km2, reachKm: s.flood_reach_km, peakDischarge: m.scenario.peak_discharge_cms,
      releasedMCM: m.scenario.released_volume_mcm, hydrograph: m.hydrograph, stations: m.stations,
      dataConfidence: m.dam.data_confidence, solverStatus: m.status, isIllustrative: false,
    }));
    try {   // everything the Flood Analysis page needs for the scenario / station / method sections (no frames)
      const slim = (x) => x && ({ engine: x.engine, status: x.status, duration_h: x.duration_h, dam: x.dam, scenario: x.scenario, hydrograph: x.hydrograph,
        stations: x.stations, summary: x.summary, terrain_info: x.terrain_info, diagnostics: x.diagnostics });
      localStorage.setItem("simulationReport", JSON.stringify({ current, sph: slim(models.sph), delft3d: slim(models.delft3d) }));
    } catch (e) { /* quota */ }
    try { localStorage.setItem("simulationExtent", JSON.stringify(m.extent_geojson)); } catch (e) { /* quota */ }
  }

  // ------------------------------------------------------------------ animation
  let hour = 0, playing = false, lastTs = null, raf = null, lastReadout = 0;
  const slider = $("slider"), tv = $("tv"), playBtn = $("playPauseBtn") || (() => {
    const b = document.createElement("button");
    b.id = "playPauseBtn"; b.className = "btn btn-sm btn-primary ms-2"; b.textContent = "▶ Play";
    document.querySelector(".time").appendChild(b);
    return b;
  })();
  slider.min = "0"; slider.max = String(duration); slider.step = "0.01"; slider.value = "0";

  function followMap() {
    if (view !== "map" || !$("followChk").checked) return;
    const sim = getSim(current), fk = sim.frontKm(hour);
    if (fk < 0.3) return;
    const ll = sim.latlng(fk * 1000, 0), z = zoomForFollow(sim), size = map.getSize();
    const p = map.latLngToContainerPoint(ll);
    if (map.getZoom() !== z || p.x < size.x * 0.15 || p.x > size.x * 0.85 || p.y < size.y * 0.15 || p.y > size.y * 0.85) {
      map.setView(ll, z, { animate: false });
    }
  }

  function setHour(h, fromTick) {
    hour = Math.max(0, Math.min(duration, h));
    if (fromTick) followMap();
    if (view === "map") overlay.setHour(hour);
    else if (scene3d) scene3d.setHour(hour);
    slider.value = String(hour);
    tv.textContent = fmtHM(hour);
    const now = performance.now();
    if (now - lastReadout > 120 || !fromTick) {
      lastReadout = now;
      const sim = getSim(current);
      const nt = $("nowTime"), nf = $("nowFront");
      if (nt) nt.textContent = fmtHM(hour);
      if (nf) nf.textContent = `${f1(sim.frontKm(hour))} km`;
    }
  }

  function tick(ts) {
    if (!playing) return;
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    const next = hour + dt * (duration / Number($("speedSel").value));
    if (next >= duration) { setHour(duration, true); pause(); playBtn.textContent = "↻ Replay"; return; }
    setHour(next, true);
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false; lastTs = null;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (playBtn.textContent.startsWith("⏸")) playBtn.textContent = "▶ Play";
  }
  function play() {
    if (hour >= duration - 1e-6) setHour(0);
    if (hour < 0.02 && $("followChk").checked && view === "map") map.setView([damRec.lat, damRec.lng], zoomForFollow(getSim(current)), { animate: false });
    playing = true; lastTs = null; playBtn.textContent = "⏸ Pause";
    raf = requestAnimationFrame(tick);
  }
  playBtn.onclick = () => (playing ? pause() : play());
  slider.addEventListener("input", (e) => { pause(); setHour(Number(e.target.value)); });

  // ------------------------------------------------------------------ view / model switching
  function ensure3d() {
    const c = $("view3d");
    if (!scene3d) {
      scene3d = new FloodRender.Scene3D(c, getSim(current));
      $("veRange").value = String(scene3d.ve);
      $("veVal").textContent = `×${scene3d.ve.toFixed(1)}`;
    }
    scene3d.mode = getSim(current).kind === "sph" ? "particles" : "grid";
    scene3d.follow = $("followChk").checked;
  }

  function setView(v) {
    view = v;
    const is3d = v === "3d";
    $("resultMap").classList.toggle("d-none", is3d);
    $("view3d").classList.toggle("d-none", !is3d);
    $("veWrap").classList.toggle("d-none", !is3d);
    $("resetView").classList.toggle("d-none", !is3d);
    document.querySelectorAll("#viewTabs button").forEach((b) => {
      const on = b.dataset.view === v;
      b.classList.toggle("btn-primary", on); b.classList.toggle("btn-outline-primary", !on);
    });
    if (is3d) { ensure3d(); scene3d.setHour(hour); }
    else { map.invalidateSize(); overlay.setHour(hour); }
  }

  function setModel(mk) {
    current = mk;
    document.querySelectorAll("#modelTabs button").forEach((b) => {
      const on = b.dataset.model === mk;
      b.classList.toggle("btn-primary", on); b.classList.toggle("btn-outline-primary", !on);
    });
    overlay.setSim(getSim(current));
    if (scene3d) { scene3d.setSim(getSim(current)); ensure3d(); $("veRange").value = String(scene3d.ve); $("veVal").textContent = `×${scene3d.ve.toFixed(1)}`; }
    drawFeatures(); drawLegend(); drawSide(); persist();
    setHour(hour);
  }

  document.querySelectorAll("#viewTabs button").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  if (both) {
    $("modelTabs").classList.remove("d-none");
    document.querySelectorAll("#modelTabs button").forEach((b) => (b.onclick = () => setModel(b.dataset.model)));
  }
  $("followChk").addEventListener("change", () => {
    if (scene3d) scene3d.setFollow($("followChk").checked);
    if ($("followChk").checked) followMap(); else if (view === "map") fitAll();
  });
  $("veRange").addEventListener("input", (e) => {
    if (!scene3d) return;
    scene3d.setVertical(Number(e.target.value));
    $("veVal").textContent = `×${Number(e.target.value).toFixed(1)}`;
  });
  $("resetView").onclick = () => scene3d && scene3d.resetView();
  window.addEventListener("resize", () => { map.invalidateSize(); overlay.redraw(); if (scene3d && view === "3d") scene3d.render(); });
  ["theme", "themeTop"].forEach((id) => { const el = $(id); if (el) el.addEventListener("click", () => setTimeout(() => scene3d && view === "3d" && scene3d.render(), 30)); });

  // ------------------------------------------------------------------ go
  fitAll();
  if (both) document.querySelector(`#modelTabs button[data-model="${current}"]`).classList.replace("btn-outline-primary", "btn-primary");
  drawFeatures(); drawLegend(); drawSide(); persist();
  setHour(0);
  window.__floodsim = { models, getSim, play, pause, setHour, setView, setModel, get overlay() { return overlay; }, get scene3d() { return scene3d; } };   // handy for demos/tests
  if (!new URLSearchParams(location.search).has("paused")) setTimeout(play, 700);
});

/*
 * analysis.js - Flood Impact Analysis page.
 *
 * Reads what results.js saved ("simulationReport", "simulationData") and lays it out as:
 *   dam card (name, place, three size pills)  ->  scenario strip  ->  hazard cards  ->  exposure cards
 *   ->  depth classes + arrival timeline  ->  dam outflow hydrograph  ->  SPH-vs-grid (full width)
 *   ->  footer (data, method, caution)
 * Hazard numbers come straight from the solver. Exposure numbers come from js/exposure.js.
 */
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
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
  // two significant figures for estimates, so nothing looks more precise than it is
  const sig = (v) => {
    if (v == null || !Number.isFinite(v)) return "n/a";
    if (v < 10) return String(Math.round(v));
    const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    return Math.round(Math.round(v / p) * p).toLocaleString("en-IN");
  };
  const rng = (o, unit) => `${sig(o.low)} – ${sig(o.high)}${unit || ""}`;
  const fmtMin = (m) => {
    if (m == null || !Number.isFinite(m)) return "not reached";
    if (m < 90) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60),
      r = Math.round(m - 60 * h);
    return `${h} h ${String(r).padStart(2, "0")} min`;
  };
  const fmtQ = (q) =>
    q == null
      ? "n/a"
      : q >= 1e5
        ? `${(q / 1e3).toFixed(0)}k`
        : q >= 1e4
          ? `${(q / 1e3).toFixed(1)}k`
          : Math.round(q).toLocaleString("en-IN");
  const confBadge = (c) => {
    const lbl =
      {
        verified: "Dam data verified",
        medium: "Standard references",
        estimate: "Placeholder values",
        assumed: "User-assumed values",
      }[c] || c;
    return `<span class="badge-conf ${esc(c)}">${esc(lbl)}</span>`;
  };
  const kpi = (label, value, unit, sub, cls) =>
    `<div class="an-kpi ${cls || ""}"><span>${label}</span><b>${value}${unit ? `<em>${unit}</em>` : ""}</b><small>${sub || "&nbsp;"}</small></div>`;

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

  if (!rep || !(rep.sph || rep.delft3d)) {
    $("anDam").textContent = "No simulation yet";
    $("anBody").classList.add("d-none");
    $("anEmpty").classList.remove("d-none");
    return;
  }

  const both = !!(rep.sph && rep.delft3d);
  let current =
    rep.current && rep[rep.current] ? rep.current : rep.sph ? "sph" : "delft3d";

  function render() {
    const m = rep[current],
      s = m.summary,
      sc = m.scenario,
      d = m.dam;
    const fromStore = FloodExposure.fromStorage(current);
    const ex = fromStore.est;
    const stations = (m.stations || []).slice().sort((a, b) => a.s_km - b.s_km);
    const reached = stations.filter((x) => x.arrival_min != null);
    const first = reached.length
      ? reached.slice().sort((a, b) => a.arrival_min - b.arrival_min)[0]
      : null;

    // ---------------------------------------------------------------- dam card + model tabs
    $("anDam").textContent = d.name;
    const place = [
      d.river ? `${d.river} river` : "",
      sim.mode === "CUSTOM" ? "" : sim.district,
      sim.mode === "CUSTOM" ? "" : sim.state,
    ]
      .filter(Boolean)
      .join(" · ");
    $("anSub").textContent = place;
    $("anPills").innerHTML = [
      `${f1(d.height_m, 0)} m high`,
      `${f1(d.crest_m, 0)} m crest`,
      `${f1(d.storage_mcm, 0)} MCM gross storage`,
    ]
      .map((t) => `<span class="an-pill">${t}</span>`)
      .join("");
    if (both) {
      $("anModelTabs").classList.remove("d-none");
      document.querySelectorAll("#anModelTabs button").forEach((b) => {
        const on = b.dataset.model === current;
        b.classList.toggle("btn-primary", on);
        b.classList.toggle("btn-outline-primary", !on);
      });
    }

    // ---------------------------------------------------------------- hazard
    const storagePct = d.storage_mcm
      ? (100 * sc.released_volume_mcm) / d.storage_mcm
      : null;
    const speedKmh =
      s.front_arrival_min && s.flood_reach_km
        ? s.flood_reach_km / (s.front_arrival_min / 60)
        : null;
    $("anHazard").innerHTML = [
      kpi(
        "Flooded area",
        f1(s.flooded_area_km2),
        "km²",
        s.domain_limited
          ? "lower bound, flood left the model domain"
          : "land under more than 10 cm of water",
      ),
      kpi(
        "Maximum depth",
        f1(s.max_depth_m),
        "m",
        "deepest water anywhere",
        s.max_depth_m >= 3 ? "hot" : "",
      ),
      kpi(
        "Peak flow speed",
        f1(s.peak_speed_ms),
        "m/s",
        `about ${num(s.peak_speed_ms * 3.6)} km/h`,
        s.peak_speed_ms >= 3 ? "hot" : "",
      ),
      kpi(
        "Flood reach",
        f1(s.flood_reach_km, 0),
        "km",
        "distance down the river",
      ),
      kpi(
        "First town reached",
        first ? fmtMin(first.arrival_min) : "n/a",
        "",
        first
          ? `${esc(first.name)}, ${f1(first.s_km, 0)} km from the dam`
          : "no monitored location reached",
        "warn",
      ),
      kpi(
        "Average wave speed",
        speedKmh ? f1(speedKmh, 0) : "n/a",
        "km/h",
        "flood front over the whole reach",
      ),
    ].join("");

    // ---------------------------------------------------------------- exposure
    $("anExposure").innerHTML = [
      kpi(
        "People in the flood zone",
        sig(ex.people.mid),
        "",
        `likely range ${rng(ex.people)}`,
        "hot",
      ),
      kpi(
        "Buildings",
        sig(ex.buildings.mid),
        "",
        `about ${sig(ex.households.mid)} households`,
      ),
      kpi(
        "Roads under water",
        sig(ex.roadsKm.mid),
        "km",
        `range ${rng(ex.roadsKm)}`,
      ),
      kpi(
        "River crossings (bridges)",
        sig(ex.bridges.mid),
        "",
        `range ${rng(ex.bridges)}`,
      ),
      kpi(
        "Schools · health facilities",
        `${sig(ex.schools.mid)} · ${sig(ex.health.mid)}`,
        "",
        `ranges ${rng(ex.schools)} · ${rng(ex.health)}`,
      ),
      kpi("Cropland", sig(ex.cropHa.mid), "ha", `range ${rng(ex.cropHa)}`),
    ].join("");

    // ---------------------------------------------------------------- depth classes
    const maxShare = Math.max(...ex.classes.map((c) => c.share), 0.0001);
    $("anClasses").innerHTML = `
      <h3>Flooded area by depth</h3>
      <p class="an-sub2">How much of the flood zone is shallow, moderate or deep (maximum depth reached).</p>
      <table class="stn"><thead><tr><th>Depth class</th><th>Area (km²)</th><th>Share</th><th>People</th><th>Buildings</th></tr></thead><tbody>
      ${ex.classes
        .slice()
        .reverse()
        .map(
          (c) => `<tr>
        <td><span class="an-dot an-c-${c.key}"></span><b>${c.label}</b> <small class="text-muted">${c.range}</small></td>
        <td>${f1(c.area)}</td>
        <td><div class="an-bar"><i class="an-c-${c.key}" style="width:${((100 * c.share) / maxShare).toFixed(0)}%"></i></div>${(100 * c.share).toFixed(0)} %</td>
        <td>${sig(c.people)}</td><td>${sig(c.buildings)}</td></tr>`,
        )
        .join("")}
      <tr><td><b>Total</b></td><td><b>${f1(ex.totalAreaKm2)}</b></td><td></td><td><b>${sig(ex.people.mid)}</b></td><td><b>${sig(ex.buildings.mid)}</b></td></tr>
      </tbody></table>`;

    // ---------------------------------------------------------------- arrival timeline
    const tMax = Math.max(...reached.map((x) => x.arrival_min), 1);
    $("anTimeline").innerHTML = `
      <h3>When the flood arrives</h3>
      <p class="an-sub2">Time after the breach until water first reaches each downstream location.</p>
      ${
        stations.length
          ? `<div class="an-tl">${stations
              .map(
                (x) => `
        <div class="an-tl-row">
          <div class="an-tl-name"><b>${esc(x.name)}</b><small>${f1(x.s_km, 0)} km from dam</small></div>
          <div class="an-tl-track">${x.arrival_min == null ? "" : `<i style="width:${Math.max(3, (100 * x.arrival_min) / tMax).toFixed(0)}%"></i>`}</div>
          <div class="an-tl-time">${fmtMin(x.arrival_min)}<small>${x.arrival_min == null ? "" : `peak ${f1(x.peak_depth_m)} m`}</small></div>
        </div>`,
              )
              .join("")}</div>`
          : `<p class="an-sub2">No monitored locations along this river.</p>`
      }`;

    // ---------------------------------------------------------------- hydrograph (dam outflow)
    const h = m.hydrograph;
    if (h && h.t_h && h.q && h.q.length > 3) {
      const W = 1000,
        H = 230,
        L0 = 60,
        R0 = 14,
        T0 = 14,
        B0 = 32;
      const tmax = h.t_h[h.t_h.length - 1] || 1;
      const qmax = Math.max(...h.q, 1);
      const X = (t) => L0 + ((W - L0 - R0) * t) / tmax,
        Y = (q) => T0 + (H - T0 - B0) * (1 - q / qmax);
      const pts = h.t_h
        .map((t, i) => `${X(t).toFixed(1)},${Y(h.q[i]).toFixed(1)}`)
        .join(" ");
      const xt = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map(
        (f) => f * tmax,
      );
      const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * qmax);
      $("anHydro").innerHTML = `
        <h3>Dam outflow hydrograph</h3>
        <p class="an-sub2">Discharge leaving the dam through the breach (m³/s) against time since the breach began. This is the flood that both solvers route downstream.</p>
        <div class="an-hydro"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dam outflow hydrograph">
          <rect x="${L0}" y="${T0}" width="${W - L0 - R0}" height="${H - T0 - B0}" fill="none" stroke="#c9d8ea"/>
          ${yt.map((q) => `<line x1="${L0}" x2="${W - R0}" y1="${Y(q)}" y2="${Y(q)}" stroke="#e3edf8"/><text x="${L0 - 6}" y="${Y(q) + 4}" text-anchor="end">${fmtQ(q)}</text>`).join("")}
          <polyline fill="rgba(22,135,238,.18)" stroke="#1687ee" stroke-width="2" points="${L0},${H - B0} ${pts} ${X(tmax)},${H - B0}"/>
          ${xt.map((t) => `<text x="${X(t)}" y="${H - 10}" text-anchor="middle">${t.toFixed(t < 10 ? 1 : 0)} h</text>`).join("")}
          <text x="13" y="${(H - B0 + T0) / 2}" transform="rotate(-90 13 ${(H - B0 + T0) / 2})" text-anchor="middle">Discharge (m³/s)</text>
        </svg></div>`;
    } else {
      $("anHydro").innerHTML = "";
    }

    // ---------------------------------------------------------------- scenario strip (top)
    const sItem = (label, value, unit, sub) =>
      `<div class="an-strip-item"><span>${label}</span><b>${value}${unit ? `<em>${unit}</em>` : ""}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    $("anScenario").innerHTML = `
      <div class="an-strip-title"><span>Scenario</span><b>${esc(sc.name)}</b>${(sc.notes || []).length ? `<small>${esc(sc.notes[0])}</small>` : ""}</div>
      <div class="an-strip-items">
        ${sItem("Peak outflow", fmtQ(sc.peak_discharge_cms), "m³/s", `at ${fmtMin(sc.time_to_peak_min)}`)}
        ${sItem("Water released", num(sc.released_volume_mcm), "MCM", storagePct != null ? `${num(storagePct)} % of storage` : "")}
        ${sc.breach_width_m ? sItem("Breach width", f1(sc.breach_width_m, 0), "m", "") : ""}
        ${sc.breach_width_m ? sItem("Time to full breach", fmtMin(sc.failure_time_min), "", "") : ""}
      </div>`;

    // ---------------------------------------------------------------- footer: data, method, caution
    const ti = m.terrain_info || {};
    const massErr =
      m.diagnostics &&
      m.diagnostics.mass &&
      m.diagnostics.mass.rel_error != null
        ? ` Mass-balance error ${Number(m.diagnostics.mass.rel_error).toExponential(1)}.`
        : "";
    $("anFoot").innerHTML = `
      <p><b>Data.</b> ${confBadge(d.data_confidence)} Source: ${esc(d.source)}.
      Terrain: ${esc(ti.z_source || "parametric")} · ${esc(ti.class_ || d.terrain_class)}; river path: ${ti.path_source === "waypoints" ? "real river waypoints" : "straight line with meander"}; Manning roughness n = ${f1(d.manning_n, 3)}.</p>
      <p><b>Method.</b> Breach flow from a broad-crested-weir breach model (Froehlich 2008 width and time), routed downstream by ${esc(m.engine)}.${massErr}</p>
      <p><b>Caution.</b> Exposure is estimated, not counted: flooded area × ${esc(ex.stateLabel)} population density (${num(ex.stateDensity)} per km², Census 2011) adjusted for valley type, with national household, road, school and health-facility ratios, shown as a likely range. This is a planning aid, not a forecast or a substitute for a surveyed dam-break study.</p>`;

    // ---------------------------------------------------------------- SPH vs grid
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
          : "–";
      $("anCompare").innerHTML = `
        <h3>SPH vs Delft3D-type grid</h3>
        <p class="an-sub2">Same dam, terrain and breach flow through both solvers. Differences come from the numerical method: particles smooth the water surface, finite-volume cells do not.</p>
        <div class="an-cmp-scroll"><table class="an-cmp"><thead><tr><th>Model</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>
          <tr><td>SPH</td>${cols.map((c) => `<td>${f1(c[1], c[4])} ${c[3]}</td>`).join("")}</tr>
          <tr><td>Delft3D-type grid</td>${cols.map((c) => `<td>${f1(c[2], c[4])} ${c[3]}</td>`).join("")}</tr>
          <tr class="diff"><td>SPH vs grid</td>${cols.map((c) => `<td>${diff(c[1], c[2])}</td>`).join("")}</tr>
        </tbody></table></div>`;
    } else {
      $("anCompare").innerHTML = "";
    }
  }

  document.querySelectorAll("#anModelTabs button").forEach(
    (b) =>
      (b.onclick = () => {
        current = b.dataset.model;
        render();
      }),
  );
  render();
});

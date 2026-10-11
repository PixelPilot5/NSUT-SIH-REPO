/*
 * api.js - tiny client for the FloodSim backend (FastAPI, backend/main.py).
 * Change the address once here, or set window.FLOODSIM_API before this file loads.
 */
(function (global) {
  "use strict";
  const BASE = global.FLOODSIM_API || "http://127.0.0.1:8000";

  // what the backend needs to know, taken from the simulation wizard's saved data
  function payload(d) {
    const custom = d.mode === "CUSTOM" && Array.isArray(d.coordinates)
      ? { lat: Number(d.coordinates[1]), lng: Number(d.coordinates[0]), name: d.dam || "Custom reservoir" }
      : null;
    return {
      dam_id: custom ? null : d.dam_id || null,
      dam_name: custom ? null : d.dam || d.name || null,
      scenario: d.scenario || "Full Dam Break",
      model_type: d.model || "SPH",
      quality: d.quality || "standard",
      custom,
    };
  }

  // identical wizard choices => identical signature => the saved job id can be reused
  function signature(d) {
    const p = payload(d);
    return [p.dam_id || p.dam_name || (p.custom && p.custom.lat + "," + p.custom.lng), p.scenario, p.model_type, p.quality].join("|");
  }

  async function json(res) {
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { const j = await res.json(); if (j.detail) msg += ": " + j.detail; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    return res.json();
  }

  async function startJob(d) {
    const r = await json(await fetch(BASE + "/api/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(d)),
    }));
    localStorage.setItem("simulationJob", JSON.stringify({ id: r.job_id, sig: signature(d), t: Date.now() }));
    return r.job_id;
  }

  // reuse the job started on the "running" page when it matches the current wizard choices
  async function ensureJob(d) {
    try {
      const j = JSON.parse(localStorage.getItem("simulationJob") || "null");
      if (j && j.sig === signature(d)) {
        const r = await fetch(BASE + "/api/jobs/" + j.id);
        if (r.ok) return j.id;                       // server still knows it
      }
    } catch (e) { /* fall through and start a new job */ }
    return startJob(d);
  }

  async function status(id) { return json(await fetch(BASE + "/api/jobs/" + id)); }
  async function result(id) { return json(await fetch(BASE + "/api/jobs/" + id + "/result")); }

  async function poll(id, onProgress, every) {
    for (;;) {
      const s = await status(id);
      if (onProgress) onProgress(s);
      if (s.state === "done") return s;
      if (s.state === "error") throw new Error(s.error || "Simulation failed");
      await new Promise((r) => setTimeout(r, every || 1000));
    }
  }

  async function damLocation(d) {
    const p = payload(d);
    const q = p.dam_id ? "dam_id=" + encodeURIComponent(p.dam_id) : "dam_name=" + encodeURIComponent(p.dam_name || "");
    return json(await fetch(BASE + "/api/dam-location?" + q));
  }

  global.FloodAPI = { BASE, payload, signature, startJob, ensureJob, status, result, poll, damLocation };
})(window);

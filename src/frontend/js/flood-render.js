/*
 * flood-render.js  -  draws the solver output returned by /api/jobs/<id>/result
 *
 *   FloodRender.Sim          decodes one model result (SPH particles OR Delft3D-type grid frames)
 *   FloodRender.MapOverlay   canvas laid over a Leaflet map: smooth SPH particles / Delft3D grid cells
 *   FloodRender.Scene3D      dependency-free 3D view (terrain mesh + water columns / particles)
 *   FloodRender.depthColor   shared depth palette (used by the legend too)
 *
 * No library other than Leaflet is needed.  The overlay only calls map.getZoom(), map.getSize(),
 * map.containerPointToLatLng() and map.on(), and does its own Web-Mercator maths.
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------- helpers
  function b64(str, Type) {
    const bin = atob(str);
    const n = bin.length;
    const u8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return new Type(u8.buffer, 0, Math.floor(n / Type.BYTES_PER_ELEMENT));
  }

  function merc(lat, lng) {
    const x = (lng + 180) / 360;
    const s = Math.sin((lat * Math.PI) / 180);
    const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    return [x, y];
  }

  // depth palette (m) - sequential, light -> dark, colour-blind friendly blues/purples
  const DEPTH_STOPS = [0.1, 0.5, 1, 2, 4, 8, 16, 32];
  const DEPTH_COLORS = [
    [186, 228, 247], [124, 200, 240], [70, 165, 232], [34, 128, 214],
    [26, 98, 190], [24, 74, 158], [20, 52, 120], [14, 34, 84],
  ];
  // SPH particles are coloured by speed (m/s): slow = deep blue, fast = bright cyan / white
  const SPEED_STOPS = [0, 1, 3, 6, 10, 15];
  const SPEED_COLORS = [[24, 72, 168], [30, 110, 210], [42, 156, 232], [70, 196, 244], [130, 224, 250], [226, 248, 255]];
  function speedBucket(v) {
    let k = 0;
    while (k < SPEED_STOPS.length - 1 && v >= SPEED_STOPS[k + 1]) k++;
    return k;
  }

  function depthBucket(d) {
    let k = 0;
    while (k < DEPTH_STOPS.length - 1 && d >= DEPTH_STOPS[k + 1]) k++;
    return k;
  }

  function depthColor(d, alpha) {
    const c = DEPTH_COLORS[depthBucket(d)];
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha == null ? 1 : alpha})`;
  }

  // ---------------------------------------------------------------- Sim
  class Sim {
    constructor(res) {
      this.res = res;
      this.kind = res.particles ? "sph" : "grid";
      const g = res.grid;
      this.ns = g.ns; this.nn = g.nn; this.ds = g.ds; this.dn = g.dn;
      this.lat = b64(g.lat, Float64Array);
      this.lng = b64(g.lng, Float64Array);
      this.dlat = b64(g.dlat, Float64Array);
      this.dlng = b64(g.dlng, Float64Array);
      this.times = res.frame_times_h;
      this.nf = this.times.length;
      this.duration = res.duration_h;
      this.lengthKm = g.length_km;
      this.widthKm = g.width_km;
      this.maxDepth = b64(res.max_depth_cm, Uint16Array);
      if (this.kind === "grid") {
        this.ncell = this.ns * this.nn;
        this.depth = b64(res.frames.depth_cm, Uint16Array);
        this.speed = b64(res.frames.speed_0p2ms, Uint8Array);
      } else {
        this.N = res.particles.n;
        this.ps = b64(res.particles.s, Float32Array);
        this.pn = b64(res.particles.n_lat, Float32Array);
        this.pd = b64(res.particles.depth_cm, Uint16Array);
        this.pv = res.particles.speed_0p2ms ? b64(res.particles.speed_0p2ms, Uint8Array) : null;
        this.Vp = res.diagnostics.particle_volume_m3;
      }
      const t = res.terrain;
      this.tz = b64(t.z, Float32Array);
      this.tns = t.ns; this.tnn = t.nn; this.tss = t.stride_s; this.tsn = t.stride_n;
      this.stations = res.stations || [];
      this.reachKm = Math.max(5, (res.summary && res.summary.flood_reach_km) || this.lengthKm);
    }

    // fractional frame for a time in hours -> {a, b, f}
    frameAt(h) {
      const t = this.times;
      if (h <= t[0]) return { a: 0, b: 0, f: 0 };
      if (h >= t[this.nf - 1]) return { a: this.nf - 1, b: this.nf - 1, f: 0 };
      let lo = 0, hi = this.nf - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (t[m] <= h) lo = m; else hi = m;
      }
      return { a: lo, b: lo + 1, f: (h - t[lo]) / (t[lo + 1] - t[lo]) };
    }

    // (s,n) metres in the valley frame -> [lat, lng]
    latlng(s, n) {
      let f = s / this.ds - 0.5;
      if (f < 0) f = 0;
      const mx = this.ns - 1.0001;
      if (f > mx) f = mx;
      const i = f | 0, w = f - i;
      const lat = this.lat[i] * (1 - w) + this.lat[i + 1] * w + n * (this.dlat[i] * (1 - w) + this.dlat[i + 1] * w);
      const lng = this.lng[i] * (1 - w) + this.lng[i + 1] * w + n * (this.dlng[i] * (1 - w) + this.dlng[i + 1] * w);
      return [lat, lng];
    }

    // bed elevation from the (strided) terrain payload, bilinear
    bedAt(s, n) {
      const fs = Math.min(Math.max((s / this.ds - 0.5) / this.tss, 0), this.tns - 1.001);
      const fn = Math.min(Math.max(((n + 0.5 * this.nn * this.dn) / this.dn - 0.5) / this.tsn, 0), this.tnn - 1.001);
      const i = fs | 0, j = fn | 0, a = fs - i, b = fn - j, W = this.tnn, z = this.tz;
      return z[i * W + j] * (1 - a) * (1 - b) + z[(i + 1) * W + j] * a * (1 - b) +
             z[i * W + j + 1] * (1 - a) * b + z[(i + 1) * W + j + 1] * a * b;
    }

    // downstream extent (km) of water at a time (for readouts)
    frontKm(h) {
      const { a, b, f } = this.frameAt(h);
      let best = 0;
      if (this.kind === "grid") {
        const nn = this.nn;
        for (let i = this.ns - 1; i >= 0; i--) {
          let wet = false;
          for (let j = 0; j < nn; j++) {
            const k = i * nn + j;
            if ((this.depth[a * this.ncell + k] * (1 - f) + this.depth[b * this.ncell + k] * f) > 10) { wet = true; break; }
          }
          if (wet) { best = (i + 1) * this.ds; break; }
        }
      } else {
        for (let k = 0; k < this.N; k++) {
          const s = this.ps[a * this.N + k];
          if (s === s && s > best && s < this.lengthKm * 1000 + 1) best = s;
        }
      }
      return best / 1000;
    }
  }

  // ---------------------------------------------------------------- Map overlay
  class MapOverlay {
    constructor(map, sim) {
      this.map = map;
      this.sim = sim;
      this.hour = 0;
      this.enabled = true;
      this.opacity = 1;
      this.canvas = document.createElement("canvas");
      const st = this.canvas.style;
      st.position = "absolute"; st.left = "0"; st.top = "0"; st.pointerEvents = "none"; st.zIndex = "450";
      map.getContainer().appendChild(this.canvas);
      this._buildNodes();
      this._onMove = () => this.redraw();
      map.on("move zoom moveend zoomend viewreset resize", this._onMove);
      this.redraw();
    }

    destroy() {
      this.map.off && this.map.off("move zoom moveend zoomend viewreset resize", this._onMove);
      this.canvas.remove();
    }

    setSim(sim) {
      this.sim = sim;
      this._buildNodes();
      this.redraw();
    }

    setHour(h) {
      this.hour = h;
      this.redraw();
    }

    _buildNodes() {
      const sim = this.sim;
      if (sim.kind !== "grid") { this.nx = null; return; }
      const ns = sim.ns, nn = sim.nn, W = nn + 1;
      this.nx = new Float64Array((ns + 1) * W);
      this.ny = new Float64Array((ns + 1) * W);
      for (let i = 0; i <= ns; i++) {
        for (let j = 0; j <= nn; j++) {
          const ll = sim.latlng(i * sim.ds, (j - nn / 2) * sim.dn);
          const m = merc(ll[0], ll[1]);
          this.nx[i * W + j] = m[0];
          this.ny[i * W + j] = m[1];
        }
      }
      this.px = new Float32Array((ns + 1) * W);
      this.py = new Float32Array((ns + 1) * W);
    }

    _view() {
      const z = this.map.getZoom();
      const scale = 256 * Math.pow(2, z);
      const size = this.map.getSize();
      const tl = this.map.containerPointToLatLng([0, 0]);
      const m = merc(tl.lat, tl.lng);
      return { scale, ox: m[0] * scale, oy: m[1] * scale, w: size.x, h: size.y };
    }

    redraw() {
      const v = this._view();
      const dpr = window.devicePixelRatio || 1;
      const c = this.canvas;
      if (c.width !== Math.round(v.w * dpr) || c.height !== Math.round(v.h * dpr)) {
        c.width = Math.round(v.w * dpr); c.height = Math.round(v.h * dpr);
        c.style.width = v.w + "px"; c.style.height = v.h + "px";
      }
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, v.w, v.h);
      if (!this.enabled) return;
      ctx.globalAlpha = this.opacity;
      if (this.sim.kind === "grid") this._drawGrid(ctx, v);
      else this._drawParticles(ctx, v);
      ctx.globalAlpha = 1;
    }

    _drawGrid(ctx, v) {
      const sim = this.sim, ns = sim.ns, nn = sim.nn, W = nn + 1;
      const { a, b, f } = sim.frameAt(this.hour);
      const D = sim.depth, A = a * sim.ncell, B = b * sim.ncell;
      const px = this.px, py = this.py, nx = this.nx, ny = this.ny, sc = v.scale;
      for (let k = 0; k < nx.length; k++) { px[k] = nx[k] * sc - v.ox; py[k] = ny[k] * sc - v.oy; }
      // bucket the wet cells
      const nb = DEPTH_STOPS.length;
      const lists = Array.from({ length: nb }, () => []);
      for (let i = 0; i < ns; i++) {
        for (let j = 0; j < nn; j++) {
          const idx = i * nn + j;
          const d = (D[A + idx] * (1 - f) + D[B + idx] * f) / 100;
          if (d < 0.1) continue;
          const n00 = i * W + j;
          const x0 = px[n00], y0 = py[n00];
          if (x0 < -200 || y0 < -200 || x0 > v.w + 200 || y0 > v.h + 200) continue;
          lists[depthBucket(d)].push(n00);
        }
      }
      ctx.lineJoin = "round";
      for (let k = 0; k < nb; k++) {
        const L = lists[k];
        if (!L.length) continue;
        const c = DEPTH_COLORS[k];
        ctx.beginPath();
        for (let q = 0; q < L.length; q++) {
          const n00 = L[q], n01 = n00 + 1, n10 = n00 + W, n11 = n10 + 1;
          ctx.moveTo(px[n00], py[n00]);
          ctx.lineTo(px[n01], py[n01]);
          ctx.lineTo(px[n11], py[n11]);
          ctx.lineTo(px[n10], py[n10]);
          ctx.closePath();
        }
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.78)`;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    _drawParticles(ctx, v) {
      const sim = this.sim, N = sim.N;
      const { a, b, f } = sim.frameAt(this.hour);
      const ps = sim.ps, pn = sim.pn, pd = sim.pd, pv = sim.pv;
      const oa = a * N, ob = b * N;
      const lat0 = sim.lat[0];
      const pxPerM = v.scale / (40075016.686 * Math.cos((lat0 * Math.PI) / 180));
      const nb = SPEED_COLORS.length;
      const buckets = Array.from({ length: nb }, () => []);
      for (let k = 0; k < N; k++) {
        let s0 = ps[oa + k], s1 = ps[ob + k], n0 = pn[oa + k], n1 = pn[ob + k];
        let d0 = pd[oa + k], d1 = pd[ob + k];
        const nan0 = !(s0 === s0), nan1 = !(s1 === s1);
        if (nan0 && nan1) continue;
        let s, n, d, sp;
        if (nan0) { s = s1; n = n1; d = d1; sp = pv ? pv[ob + k] : 0; }
        else if (nan1) { if (f > 0.5) continue; s = s0; n = n0; d = d0; sp = pv ? pv[oa + k] : 0; }
        else {
          s = s0 + (s1 - s0) * f; n = n0 + (n1 - n0) * f; d = d0 + (d1 - d0) * f;
          sp = pv ? pv[oa + k] * (1 - f) + pv[ob + k] * f : 0;
        }
        d = d >= 65535 ? 1 : d / 100;
        const ll = sim.latlng(s, n);
        const m = merc(ll[0], ll[1]);
        const x = m[0] * v.scale - v.ox, y = m[1] * v.scale - v.oy;
        if (x < -40 || y < -40 || x > v.w + 40 || y > v.h + 40) continue;
        // footprint of the particle = its smoothing radius  hs ~ 1.3 sqrt(Vp / depth)
        const rm = 0.55 * 1.3 * Math.sqrt(sim.Vp / Math.max(d, 0.4));
        const r = Math.min(20, Math.max(3.4, rm * pxPerM));
        buckets[speedBucket(sp / 5)].push(x, y, r);
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < nb; k++) {
          const L = buckets[k];
          if (!L.length) continue;
          const c = SPEED_COLORS[k];
          ctx.beginPath();
          const sc = pass === 0 ? 1 : 0.45;
          for (let q = 0; q < L.length; q += 3) {
            ctx.moveTo(L[q] + L[q + 2] * sc, L[q + 1]);
            ctx.arc(L[q], L[q + 1], L[q + 2] * sc, 0, 6.283185307);
          }
          if (pass === 0) ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.34)`;
          else ctx.fillStyle = `rgba(${Math.min(255, c[0] + 55)},${Math.min(255, c[1] + 55)},${Math.min(255, c[2] + 35)},0.95)`;
          ctx.fill();
        }
      }
    }
  }

  // ---------------------------------------------------------------- 3D scene
  class Scene3D {
    constructor(canvas, sim) {
      this.canvas = canvas;
      this.hour = 0;
      this.yaw = -0.6; this.pitch = 0.62; this.zoom = 1;
      this.setSim(sim);
      this._bind();
    }

    setSim(sim) {
      this.sim = sim;
      this.follow = this.follow !== false;
      const reachM = sim.reachKm * 1000;
      this.winKm = Math.min(sim.reachKm, Math.max(10, 0.3 * sim.reachKm));
      const winM = this.winKm * 1000;
      // lateral stretch: make the valley a readable fraction of the viewing window (display only)
      this.ls = Math.min(20, Math.max(1, (0.35 * winM) / (sim.widthKm * 1000)));
      const tns = sim.tns, tnn = sim.tnn, z = sim.tz;
      const reachRows = Math.min(tns - 1, Math.max(2, Math.ceil(reachM / (sim.ds * sim.tss))));
      const winRows = Math.min(reachRows, Math.max(2, Math.ceil(winM / (sim.ds * sim.tss))));
      let zmin = 1e9, zmax = -1e9, wmin = 1e9, wmax = -1e9;
      for (let i = 0; i <= reachRows; i++) for (let j = 0; j < tnn; j++) {
        const q = z[i * tnn + j];
        if (q < zmin) zmin = q;
        if (i <= winRows) { if (q < wmin) wmin = q; if (q > wmax) wmax = q; }
      }
      this.zmin = zmin;
      const range = Math.max(5, wmax - wmin);
      const maxD = Math.max(1, (sim.res.summary && sim.res.summary.max_depth_m) || 10);
      const veTerrain = (0.10 * winM) / range, veWater = (0.04 * winM) / maxD;
      this.ve = Math.min(40, Math.max(1, Math.sqrt(veTerrain * veWater)));
      this.lastRow = reachRows;
      this._shade = null;
      this._tx = undefined;
    }

    setFollow(b) { this.follow = !!b; this._tx = undefined; this.render(); }

    setHour(h) { this.hour = h; this.render(); }
    setVertical(v) { this.ve = v; this._shade = null; this.render(); }
    setMode(mode) { this.mode = mode; }

    _bind() {
      const c = this.canvas;
      let drag = null;
      c.style.touchAction = "none";
      c.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); });
      c.addEventListener("pointermove", (e) => {
        if (!drag) return;
        this.yaw -= (e.clientX - drag.x) * 0.006;
        this.pitch = Math.min(1.45, Math.max(0.12, this.pitch + (e.clientY - drag.y) * 0.005));
        drag = { x: e.clientX, y: e.clientY };
        this.render();
      });
      const up = () => { drag = null; };
      c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
      c.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.zoom = Math.min(6, Math.max(0.35, this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        this.render();
      }, { passive: false });
    }

    resetView() { this.yaw = -0.6; this.pitch = 0.62; this.zoom = 1; this.render(); }

    // per-cell terrain colours (hill-shaded); rebuilt when exaggeration changes
    _buildShade() {
      const sim = this.sim, tns = sim.tns, tnn = sim.tnn, z = sim.tz;
      const dx = sim.ds * sim.tss, dz = sim.dn * sim.tsn * this.ls;
      const col = new Uint8ClampedArray(tns * tnn * 3);
      let zmax = -1e9;
      for (let i = 0; i < tns * tnn; i++) if (z[i] > zmax) zmax = z[i];
      const rng = Math.max(1, zmax - this.zmin);
      for (let i = 0; i < tns; i++) {
        for (let j = 0; j < tnn; j++) {
          const i0 = Math.max(0, i - 1), i1 = Math.min(tns - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(tnn - 1, j + 1);
          const gx = ((z[i1 * tnn + j] - z[i0 * tnn + j]) * this.ve) / ((i1 - i0 || 1) * dx);
          const gz = ((z[i * tnn + j1] - z[i * tnn + j0]) * this.ve) / ((j1 - j0 || 1) * dz);
          const nl = Math.hypot(gx, gz, 1);
          const light = (-gx * 0.5 + gz * 0.35 + 0.8) / nl;                  // light from up-valley / left
          const sh = Math.min(1.15, Math.max(0.45, 0.35 + 0.8 * light));
          const e = Math.min(1, Math.max(0, (z[i * tnn + j] - this.zmin) / rng));
          const r = 112 + 88 * e, g = 134 + 56 * e, b = 92 + 100 * e;
          const k = (i * tnn + j) * 3;
          col[k] = r * sh; col[k + 1] = g * sh; col[k + 2] = b * sh;
        }
      }
      this._shade = col;
    }

    // mean water depth in the fine-grid block that belongs to coarse cell (ti,tj)
    _cellDepths(h) {
      const sim = this.sim, tns = sim.tns, tnn = sim.tnn, ss = sim.tss, sn = sim.tsn;
      const out = new Float32Array(tns * tnn);
      const { a, b, f } = sim.frameAt(h);
      if (sim.kind === "grid") {
        const D = sim.depth, A = a * sim.ncell, B = b * sim.ncell, nn = sim.nn, ns = sim.ns;
        for (let ti = 0; ti < tns; ti++) {
          for (let tj = 0; tj < tnn; tj++) {
            let sum = 0, cnt = 0;
            for (let i = ti * ss; i < Math.min(ns, ti * ss + ss); i++) {
              for (let j = tj * sn; j < Math.min(nn, tj * sn + sn); j++) {
                const k = i * nn + j;
                const d = D[A + k] * (1 - f) + D[B + k] * f;
                if (d > 10) { sum += d; cnt++; }
              }
            }
            out[ti * tnn + tj] = cnt ? sum / cnt / 100 : 0;
          }
        }
      }
      return out;
    }

    render() {
      const c = this.canvas, sim = this.sim;
      const dpr = window.devicePixelRatio || 1;
      const cw = c.clientWidth || 800, ch = c.clientHeight || 500;
      if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const dark = document.body.classList.contains("dark");
      const sky = ctx.createLinearGradient(0, 0, 0, ch);
      sky.addColorStop(0, dark ? "#0f1c2c" : "#dbe9f7"); sky.addColorStop(1, dark ? "#1a2b40" : "#f4f8fc");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);
      if (!this._shade) this._buildShade();

      const tns = sim.tns, tnn = sim.tnn, ss = sim.tss, sn = sim.tsn, ve = this.ve, ls = this.ls;
      const kmx = (sim.ds * ss) / 1000, kmz = (sim.dn * sn * ls) / 1000, ky = ve / 1000;
      const cz = 0.5 * (tnn - 1) * kmz;
      // camera
      const reachKm = sim.reachKm, winKm = this.winKm;
      let target = 0.5 * reachKm;
      if (this.follow) {
        const front = sim.frontKm(this.hour);
        target = Math.min(Math.max(front - 0.1 * winKm, 0.45 * winKm), Math.max(0.45 * winKm, reachKm - 0.45 * winKm));
      }
      if (this._tx === undefined || Math.abs(target - this._tx) > 0.5 * winKm) this._tx = target;
      else this._tx += (target - this._tx) * 0.3;
      const tgt = [this._tx, 0.0, cz];
      const dist = ((this.follow ? winKm * 1.1 : reachKm * 1.05)) / this.zoom;
      const halfSpan = this.follow ? 1.0 * winKm / this.zoom + 0.3 * winKm : reachKm;
      const r0 = Math.max(0, Math.floor((this._tx - halfSpan) / kmx)), r1 = Math.min(tns - 2, Math.ceil((this._tx + halfSpan) / kmx));
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const C = [tgt[0] + dist * cp * Math.sin(this.yaw), tgt[1] + dist * sp, tgt[2] + dist * cp * Math.cos(this.yaw)];
      let fx = tgt[0] - C[0], fy = tgt[1] - C[1], fz = tgt[2] - C[2];
      const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
      let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0;         // f x up(0,1,0)
      const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
      const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;  // r x f
      const focal = (0.5 * Math.min(cw, ch * 1.6)) / Math.tan(0.35);
      const SX = new Float32Array(tns * tnn), SY = new Float32Array(tns * tnn), OK = new Uint8Array(tns * tnn);
      const proj = (X, Y, Z, out) => {
        const dx = X - C[0], dy = Y - C[1], dz = Z - C[2];
        const z = dx * fx + dy * fy + dz * fz;
        if (z < 0.05) return false;
        out[0] = cw / 2 + (focal * (dx * rx + dy * ry + dz * rz)) / z;
        out[1] = ch * 0.52 - (focal * (dx * ux + dy * uy + dz * uz)) / z;
        out[2] = z;
        return true;
      };
      const tmp = [0, 0, 0];
      const BY = new Float32Array(tns * tnn);
      for (let i = r0; i <= Math.min(tns - 1, r1 + 1); i++) for (let j = 0; j < tnn; j++) {
        const k = i * tnn + j;
        BY[k] = (sim.tz[k] - this.zmin) * ky;
        if (proj(i * kmx, BY[k], j * kmz, tmp)) { SX[k] = tmp[0]; SY[k] = tmp[1]; OK[k] = 1; }
      }
      const depths = this.mode === "particles" ? null : this._cellDepths(this.hour);
      // particle buckets per terrain cell
      let pb = null;
      if (sim.kind === "sph") pb = this._particleBuckets();

      // back-to-front traversal of a height field: far rows first, converge on the camera's cell
      const order = (lo, hi, cc) => {
        cc = Math.min(hi, Math.max(lo, Math.round(cc)));
        const o = [];
        for (let i = lo; i < cc; i++) o.push(i);
        for (let i = hi - 1; i >= cc; i--) o.push(i);
        return o;
      };
      const ci = (C[0] / kmx), cj = (C[2] / kmz);
      const rowOrder = order(r0, r1 + 1, ci);
      const colOrder = order(0, tnn - 1, cj);
      const shade = this._shade;
      const quad = [0, 0, 0, 0];
      ctx.lineJoin = "round";
      const wsTop = new Float32Array(tns * tnn);       // water top height per cell (world y)
      if (depths) for (let k = 0; k < tns * tnn; k++) wsTop[k] = depths[k] > 0.1 ? BY[k] + depths[k] * ky : -1;

      for (const i of rowOrder) {
        for (const j of colOrder) {
          const k00 = i * tnn + j, k01 = k00 + 1, k10 = k00 + tnn, k11 = k10 + 1;
          if (!(OK[k00] && OK[k01] && OK[k10] && OK[k11])) continue;
          const minx = Math.min(SX[k00], SX[k01], SX[k10], SX[k11]), maxx = Math.max(SX[k00], SX[k01], SX[k10], SX[k11]);
          if (maxx < -20 || minx > cw + 20) continue;
          // terrain quad
          ctx.beginPath();
          ctx.moveTo(SX[k00], SY[k00]); ctx.lineTo(SX[k01], SY[k01]); ctx.lineTo(SX[k11], SY[k11]); ctx.lineTo(SX[k10], SY[k10]); ctx.closePath();
          const ck = k00 * 3;
          ctx.fillStyle = `rgb(${shade[ck]},${shade[ck + 1]},${shade[ck + 2]})`;
          ctx.fill();
          // water column (grid solver)
          if (depths && depths[k00] > 0.1) {
            const top = wsTop[k00];
            const d = depths[k00];
            const corners = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
            const P = [];
            let ok = true;
            for (const [ii, jj] of corners) { if (!proj(ii * kmx, top, jj * kmz, tmp)) { ok = false; break; } P.push([tmp[0], tmp[1]]); }
            if (!ok) continue;
            // side faces where the neighbour's water surface is lower
            const nbTop = (ii, jj) => (ii < 0 || jj < 0 || ii >= tns - 1 || jj >= tnn - 1) ? -1 : (wsTop[ii * tnn + jj] > 0 ? wsTop[ii * tnn + jj] : BY[ii * tnn + jj]);
            const sides = [[i, j - 1, 0, 1], [i + 1, j, 1, 2], [i, j + 1, 2, 3], [i - 1, j, 3, 0]];
            const cc = depthColorRGB(d);
            for (const [ni, nj, a, b] of sides) {
              const nt = nbTop(ni, nj);
              if (nt >= top - 1e-9 || nt < 0) continue;
              const lo = Math.max(nt, 0);
              const A2 = [0, 0, 0], B2 = [0, 0, 0];
              const ca = corners[a], cb = corners[b];
              if (!proj(ca[0] * kmx, lo, ca[1] * kmz, A2) || !proj(cb[0] * kmx, lo, cb[1] * kmz, B2)) continue;
              // only draw faces that look toward the camera
              ctx.beginPath();
              ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); ctx.lineTo(B2[0], B2[1]); ctx.lineTo(A2[0], A2[1]); ctx.closePath();
              ctx.fillStyle = `rgb(${cc[0] * 0.62 | 0},${cc[1] * 0.62 | 0},${cc[2] * 0.62 | 0})`;
              ctx.fill();
            }
            ctx.beginPath();
            ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.lineTo(P[3][0], P[3][1]); ctx.closePath();
            ctx.fillStyle = `rgba(${cc[0]},${cc[1]},${cc[2]},0.92)`;
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.55)";
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
          // SPH particles that sit in this cell (drawn after its terrain => correct occlusion)
          if (pb) {
            const list = pb.get(k00);
            if (list) for (let q = 0; q < list.length; q += 4) this._drawParticle3D(ctx, proj, tmp, list[q], list[q + 1], list[q + 2], list[q + 3], kmx, kmz, ky);
          }
        }
      }
      // dam + stations
      this._drawMarkers(ctx, proj, tmp, kmx, kmz, ky);
      ctx.fillStyle = dark ? "#cfe0f5" : "#1c3b66";
      ctx.font = "12px Arial";
      ctx.fillText(`3D valley-fitted view  ·  vertical ×${this.ve.toFixed(1)}  ·  lateral ×${this.ls.toFixed(1)}  ·  drag to rotate, scroll to zoom  ·  ${this.follow ? "following flood front" : "full reach"}`, 12, 20);
    }

    _particleBuckets() {
      const sim = this.sim, N = sim.N, tnn = sim.tnn, ss = sim.tss, sn = sim.tsn;
      const { a, b, f } = sim.frameAt(this.hour);
      const oa = a * N, ob = b * N;
      const map = new Map();
      for (let k = 0; k < N; k++) {
        let s0 = sim.ps[oa + k], s1 = sim.ps[ob + k], n0 = sim.pn[oa + k], n1 = sim.pn[ob + k];
        let d0 = sim.pd[oa + k], d1 = sim.pd[ob + k];
        const nan0 = !(s0 === s0), nan1 = !(s1 === s1);
        if (nan0 && nan1) continue;
        let s, n, d;
        if (nan0) { s = s1; n = n1; d = d1; }
        else if (nan1) { if (f > 0.5) continue; s = s0; n = n0; d = d0; }
        else { s = s0 + (s1 - s0) * f; n = n0 + (n1 - n0) * f; d = d0 + (d1 - d0) * f; }
        d = d >= 65535 ? 1 : d / 100;
        const ti = Math.min(sim.tns - 2, Math.max(0, Math.floor((s / sim.ds - 0.5) / ss)));
        const tj = Math.min(tnn - 2, Math.max(0, Math.floor(((n + 0.5 * sim.nn * sim.dn) / sim.dn - 0.5) / sn)));
        const key = ti * tnn + tj;
        let arr = map.get(key);
        if (!arr) { arr = []; map.set(key, arr); }
        const sp = sim.pv ? (nan0 ? sim.pv[ob + k] : (nan1 ? sim.pv[oa + k] : sim.pv[oa + k] * (1 - f) + sim.pv[ob + k] * f)) / 5 : 0;
        arr.push(s, n, d, sp);
      }
      return map;
    }

    _drawParticle3D(ctx, proj, tmp, s, n, d, speed, kmx, kmz, ky) {
      const sim = this.sim;
      const fi = (s / sim.ds - 0.5) / sim.tss, fj = ((n + 0.5 * sim.nn * sim.dn) / sim.dn - 0.5) / sim.tsn;
      const bed = (sim.bedAt(s, n) - this.zmin) * ky;
      if (!proj(fi * kmx, bed + d * ky, fj * kmz, tmp)) return;
      const rWorld = 0.5 * 1.3 * Math.sqrt(sim.Vp / Math.max(d, 0.4)) / 1000 * Math.min(this.ls, 3);
      const focal = (0.5 * Math.min(this.canvas.clientWidth || 800, (this.canvas.clientHeight || 500) * 1.6)) / Math.tan(0.35);
      const r = Math.min(18, Math.max(3, (rWorld * focal) / tmp[2]));
      const c = SPEED_COLORS[speedBucket(speed)];
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.38)`;
      ctx.beginPath(); ctx.arc(tmp[0], tmp[1], r, 0, 6.2832); ctx.fill();
      ctx.fillStyle = `rgba(${Math.min(255, c[0] + 55)},${Math.min(255, c[1] + 55)},${Math.min(255, c[2] + 35)},0.95)`;
      ctx.beginPath(); ctx.arc(tmp[0], tmp[1], r * 0.45, 0, 6.2832); ctx.fill();
    }

    _drawMarkers(ctx, proj, tmp, kmx, kmz, ky) {
      const sim = this.sim;
      const pin = (s, label, color) => {
        if (this.follow && Math.abs(s / 1000 - this._tx) > 1.3 * this.winKm / this.zoom) return;
        const fi = (s / sim.ds - 0.5) / sim.tss;
        const fj = (sim.tnn - 1) / 2;
        const bed = (sim.bedAt(s, 0) - this.zmin) * ky;
        const top = [0, 0, 0], base = [0, 0, 0];
        if (!proj(fi * kmx, bed, fj * kmz, base) || !proj(fi * kmx, bed + 0.12 * sim.reachKm * 0.25, fj * kmz, top)) return;
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(top[0], top[1], 4, 0, 6.2832); ctx.fill();
        ctx.font = "bold 12px Arial";
        ctx.fillStyle = document.body.classList.contains("dark") ? "#fff" : "#102b5c";
        ctx.fillText(label, top[0] + 7, top[1] + 4);
      };
      pin(0.5 * sim.ds, "Dam", "#e11d48");
      for (const st of sim.stations) pin(st.s_km * 1000, st.name, "#0f766e");
    }
  }

  function depthColorRGB(d) { return DEPTH_COLORS[depthBucket(d)]; }

  global.FloodRender = { Sim, MapOverlay, Scene3D, depthColor, depthBucket, speedBucket, DEPTH_STOPS, DEPTH_COLORS, SPEED_STOPS, SPEED_COLORS, b64 };
})(window);

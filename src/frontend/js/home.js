document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------------------------------
  // 1. Dam library
  // Same 38 dams as DAM_PRESETS in simulation.js.
  // Format: [id, name, latitude, longitude, region code]
  // The id must match simulation.js, because the popup links to
  // simulation.html?dam=<id>.
  // ---------------------------------------------------------------
  const DAMS = [
    ["tehri", "Tehri Dam", 30.38, 78.48, "N"],
    ["rishi_ganga", "Rishi Ganga / Tapovan", 30.49, 79.62, "N"],
    ["dhauliganga", "Dhauliganga Dam", 29.97, 80.53, "N"],
    ["bhakra", "Bhakra Dam", 31.41, 76.43, "N"],
    ["pong", "Pong Dam / Beas", 31.97, 75.95, "N"],
    ["baglihar", "Baglihar Dam", 33.16, 75.32, "N"],
    ["uri", "Uri Dam", 34.14, 74.04, "N"],
    ["ranjit_sagar", "Ranjit Sagar / Thein Dam", 32.44, 75.73, "N"],
    ["rihand", "Rihand Dam", 24.21, 83.03, "N"],
    ["teesta", "Teesta III Dam", 27.12, 88.48, "E"],
    ["south_lhonak", "South Lhonak Lake (GLOF)", 27.91, 88.18, "E"],
    ["kosi", "Kosi Barrage", 26.52, 86.93, "E"],
    ["subansiri", "Subansiri Lower Dam", 27.55, 94.26, "E"],
    ["hirakud", "Hirakud Dam", 21.53, 83.87, "E"],
    ["rengali", "Rengali Dam", 21.27, 85.03, "E"],
    ["maithon", "Maithon Dam", 23.78, 86.81, "E"],
    ["panchet", "Panchet Dam", 23.68, 86.77, "E"],
    ["sardar_sarovar", "Sardar Sarovar Dam", 21.83, 73.75, "W"],
    ["ukai", "Ukai Dam", 21.24, 73.58, "W"],
    ["kadana", "Kadana Dam", 23.31, 73.83, "W"],
    ["koyna", "Koyna Dam", 17.4, 73.76, "W"],
    ["jayakwadi", "Jayakwadi Dam", 19.48, 75.38, "W"],
    ["ujani", "Ujani Dam", 18.29, 74.79, "W"],
    ["indira_sagar", "Indira Sagar Dam", 22.28, 76.97, "W"],
    ["gandhi_sagar", "Gandhi Sagar Dam", 24.71, 75.52, "W"],
    ["barna", "Barna Dam", 23.08, 78.06, "W"],
    ["bisalpur", "Bisalpur Dam", 25.93, 75.46, "W"],
    ["rana_pratap", "Rana Pratap Sagar", 24.93, 75.58, "W"],
    ["nagarjuna_sagar", "Nagarjuna Sagar Dam", 16.57, 79.31, "S"],
    ["srisailam", "Srisailam Dam", 16.08, 78.89, "S"],
    ["polavaram", "Polavaram Dam", 17.26, 81.65, "S"],
    ["tungabhadra", "Tungabhadra Dam", 15.26, 76.53, "S"],
    ["almatti", "Almatti Dam", 16.33, 75.88, "S"],
    ["krs", "Krishnarajasagara / KRS Dam", 12.42, 76.57, "S"],
    ["mullaperiyar", "Mullaperiyar Dam", 9.53, 77.16, "S"],
    ["idukki", "Idukki Dam", 9.85, 76.97, "S"],
    ["mettur", "Mettur Dam", 11.8, 77.8, "S"],
    ["bhavanisagar", "Bhavanisagar Dam", 11.47, 77.14, "S"],
  ];

  const REGIONS = {
    N: { label: "North", color: "#1687ee" },
    E: { label: "East & North-East", color: "#12a86b" },
    W: { label: "West & Central", color: "#f3a018" },
    S: { label: "South", color: "#8b5cf6" },
  };

  // Keep the "38 dams" number in the facts strip in sync with the list.
  const statDams = document.getElementById("statDams");
  if (statDams) statDams.textContent = DAMS.length;

  // ---------------------------------------------------------------
  // 2. Map
  // Scroll-wheel zoom is off so scrolling down the page never gets
  // "stuck" on the map. Use the +/- buttons or pinch to zoom.
  // ---------------------------------------------------------------
  const map = L.map("damMap", { scrollWheelZoom: false }).setView(
    [22.8, 79.2],
    5,
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
  }).addTo(map);

  const groups = {}; // region code -> layer group (used by the filter chips)
  const markers = {}; // dam id -> marker (used by the search box)

  Object.keys(REGIONS).forEach((code) => {
    groups[code] = L.layerGroup().addTo(map);
  });

  DAMS.forEach(([id, name, lat, lng, code]) => {
    const region = REGIONS[code];

    const marker = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: region.color,
      fillOpacity: 0.95,
    }).bindPopup(
      `<div class="hp-pop">
         <b>${name}</b>
         <small>${region.label}</small>
         <a href="simulation.html?dam=${id}">Simulate this dam</a>
       </div>`,
    );

    marker.addTo(groups[code]);
    markers[id] = marker;
  });

  // ---------------------------------------------------------------
  // 3. Region filter chips (click to hide or show a region)
  // ---------------------------------------------------------------
  const chipsBox = document.getElementById("regionChips");
  const chips = {};

  function setRegion(code, visible) {
    if (visible) map.addLayer(groups[code]);
    else map.removeLayer(groups[code]);
    chips[code].setAttribute("aria-pressed", String(visible));
  }

  Object.entries(REGIONS).forEach(([code, region]) => {
    const count = DAMS.filter((d) => d[4] === code).length;

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "hp-chip";
    chip.setAttribute("aria-pressed", "true");
    chip.innerHTML = `<i style="background:${region.color}"></i>${region.label} (${count})`;
    chip.addEventListener("click", () => {
      const isOn = chip.getAttribute("aria-pressed") === "true";
      setRegion(code, !isOn);
    });

    chips[code] = chip;
    chipsBox.appendChild(chip);
  });

  // ---------------------------------------------------------------
  // 4. Search box: type a dam name, the map flies there and opens it
  // ---------------------------------------------------------------
  const search = document.getElementById("damSearch");
  const list = document.getElementById("damList");

  DAMS.forEach(([, name]) => {
    const opt = document.createElement("option");
    opt.value = name;
    list.appendChild(opt);
  });

  search.addEventListener("change", () => {
    const wanted = search.value.trim().toLowerCase();
    const dam = DAMS.find((d) => d[1].toLowerCase() === wanted);
    if (!dam) return;

    const [id, , lat, lng, code] = dam;
    if (chips[code].getAttribute("aria-pressed") === "false") {
      setRegion(code, true); // show the region again if it was hidden
    }
    map.flyTo([lat, lng], 8, { duration: 1 });
    markers[id].openPopup();
  });
});

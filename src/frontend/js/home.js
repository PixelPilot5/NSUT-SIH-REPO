document.addEventListener("DOMContentLoaded", () => {
  const m = L.map("indiaMap").setView([22.8, 79.2], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
  }).addTo(m);
  [
    [30.1, 78.3, "Uttarakhand"],
    [26, 91.7, "Assam"],
    [25.5, 85.3, "Bihar"],
    [23.3, 78.2, "Madhya Pradesh"],
    [20.3, 85.8, "Odisha"],
  ].forEach((x) =>
    L.circleMarker(x, { radius: 10, fillOpacity: 0.65 })
      .addTo(m)
      .bindPopup(x[2]),
  );
});

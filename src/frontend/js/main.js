document.addEventListener("DOMContentLoaded", () => {
  const p = document.querySelector("[data-page]")?.dataset.page;

  // ---- has a simulation been run? (results.js saves "simulationResults" once the solver output arrives)
  let simRan = false;
  try {
    const r = JSON.parse(localStorage.getItem("simulationResults") || "null");
    simRan = !!(r && r.isIllustrative === false);
  } catch (e) {
    /* ignore */
  }

  // Flood Analysis and Reports & Export have no sidebar tabs: they are reached from the results page
  // ("View Impact Analysis") and from each other. A direct visit before any simulation has run
  // goes back to the Simulation page.
  if (!simRan && (p === "analysis" || p === "reports")) {
    location.replace("simulation.html");
    return;
  }

  document.querySelectorAll("nav a").forEach((a) => {
    if (a.dataset.p === p) a.classList.add("active");
  });

  // "Back to flood analysis" on the analysis page
  if (simRan && p === "reports") {
    const title = document.querySelector(
      ".content[data-page='reports'] .title",
    );
    const host = title && (title.firstElementChild || title);
    if (host) {
      const back = document.createElement("a");
      back.href = "analysis.html";
      back.className = "btn btn-sm btn-outline-primary mb-2";
      back.textContent = "← Back to flood analysis";
      host.insertBefore(back, host.firstChild);
    }
  }

  const toggle = () => {
    document.body.classList.toggle("dark");

    localStorage.setItem(
      "theme",
      document.body.classList.contains("dark") ? "dark" : "light",
    );
  };

  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
  }

  document.getElementById("theme")?.addEventListener("click", toggle);
  document.getElementById("themeTop")?.addEventListener("click", toggle);
});

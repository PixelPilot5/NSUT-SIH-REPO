document.addEventListener("DOMContentLoaded", () => {
  const p = document.querySelector("[data-page]")?.dataset.page;

  document.querySelectorAll("nav a").forEach((a) => {
    if (a.dataset.p === p) a.classList.add("active");
  });

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

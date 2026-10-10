// FloodSim-Frontend/js/simulation.js

let currentStep = 1;
const totalSteps = 4;
let activeMode = "preset"; // "preset" | "custom"

const stepNames = ["Study Area", "Scenario", "Model", "Review & Run"];

// --- 1. 38 Major Indian Dams Dataset ---
const DAM_PRESETS = [
  // NORTHERN REGION
  {
    id: "tehri",
    state: "Uttarakhand",
    district: "Tehri Garhwal",
    river: "Bhagirathi",
    dam: "Tehri Dam",
    point: [78.48, 30.38],
    bbox: [78.25, 30.12, 78.55, 30.45],
  },
  {
    id: "rishi_ganga",
    state: "Uttarakhand",
    district: "Chamoli",
    river: "Rishi Ganga",
    dam: "Rishi Ganga / Tapovan",
    point: [79.62, 30.49],
    bbox: [79.5, 30.42, 79.72, 30.56],
  },
  {
    id: "dhauliganga",
    state: "Uttarakhand",
    district: "Pithoragarh",
    river: "Dhauliganga",
    dam: "Dhauliganga Dam",
    point: [80.53, 29.97],
    bbox: [80.35, 29.85, 80.7, 30.1],
  },
  {
    id: "bhakra",
    state: "Himachal Pradesh",
    district: "Bilaspur",
    river: "Sutlej",
    dam: "Bhakra Dam",
    point: [76.43, 31.41],
    bbox: [76.2, 31.18, 76.55, 31.48],
  },
  {
    id: "pong",
    state: "Himachal Pradesh",
    district: "Kangra",
    river: "Beas",
    dam: "Pong Dam / Beas",
    point: [75.95, 31.97],
    bbox: [75.8, 31.85, 76.15, 32.1],
  },
  {
    id: "baglihar",
    state: "Jammu & Kashmir",
    district: "Ramban",
    river: "Chenab",
    dam: "Baglihar Dam",
    point: [75.32, 33.16],
    bbox: [75.15, 33.05, 75.5, 33.3],
  },
  {
    id: "uri",
    state: "Jammu & Kashmir",
    district: "Baramulla",
    river: "Jhelum",
    dam: "Uri Dam",
    point: [74.04, 34.14],
    bbox: [73.9, 34.0, 74.2, 34.25],
  },
  {
    id: "ranjit_sagar",
    state: "Punjab / J&K",
    district: "Pathankot",
    river: "Ravi",
    dam: "Ranjit Sagar / Thein Dam",
    point: [75.73, 32.44],
    bbox: [75.55, 32.3, 75.9, 32.6],
  },
  {
    id: "rihand",
    state: "Uttar Pradesh",
    district: "Sonbhadra",
    river: "Rihand",
    dam: "Rihand Dam",
    point: [83.03, 24.21],
    bbox: [82.9, 24.1, 83.25, 24.55],
  },

  // EASTERN & NORTH-EASTERN REGION
  {
    id: "teesta",
    state: "Sikkim",
    district: "Mangan",
    river: "Teesta",
    dam: "Teesta III Dam",
    point: [88.48, 27.12],
    bbox: [88.3, 26.45, 88.85, 27.18],
  },
  {
    id: "south_lhonak",
    state: "Sikkim",
    district: "Mangan",
    river: "Teesta Basin",
    dam: "South Lhonak Lake (GLOF)",
    point: [88.18, 27.91],
    bbox: [88.05, 27.8, 88.35, 28.05],
  },
  {
    id: "kosi",
    state: "Bihar",
    district: "Supaul",
    river: "Kosi",
    dam: "Kosi Barrage",
    point: [86.93, 26.52],
    bbox: [86.4, 25.3, 87.15, 26.6],
  },
  {
    id: "subansiri",
    state: "Arunachal / Assam",
    district: "Lower Subansiri",
    river: "Subansiri",
    dam: "Subansiri Lower Dam",
    point: [94.26, 27.55],
    bbox: [94.1, 27.4, 94.45, 27.7],
  },
  {
    id: "hirakud",
    state: "Odisha",
    district: "Sambalpur",
    river: "Mahanadi",
    dam: "Hirakud Dam",
    point: [83.87, 21.53],
    bbox: [83.7, 20.8, 84.1, 21.6],
  },
  {
    id: "rengali",
    state: "Odisha",
    district: "Angul",
    river: "Brahmani",
    dam: "Rengali Dam",
    point: [85.03, 21.27],
    bbox: [84.85, 21.1, 85.2, 21.4],
  },
  {
    id: "maithon",
    state: "Jharkhand / WB",
    district: "Dhanbad",
    river: "Barakar",
    dam: "Maithon Dam",
    point: [86.81, 23.78],
    bbox: [86.7, 23.65, 86.95, 23.85],
  },
  {
    id: "panchet",
    state: "Jharkhand / WB",
    district: "Dhanbad",
    river: "Damodar",
    dam: "Panchet Dam",
    point: [86.77, 23.68],
    bbox: [86.6, 23.55, 86.9, 23.8],
  },

  // WESTERN & CENTRAL REGION
  {
    id: "sardar_sarovar",
    state: "Gujarat",
    district: "Narmada",
    river: "Narmada",
    dam: "Sardar Sarovar Dam",
    point: [73.75, 21.83],
    bbox: [73.0, 21.6, 73.82, 21.9],
  },
  {
    id: "ukai",
    state: "Gujarat",
    district: "Tapi",
    river: "Tapi",
    dam: "Ukai Dam",
    point: [73.58, 21.24],
    bbox: [72.8, 21.1, 73.65, 21.3],
  },
  {
    id: "kadana",
    state: "Gujarat",
    district: "Mahisagar",
    river: "Mahi",
    dam: "Kadana Dam",
    point: [73.83, 23.31],
    bbox: [73.65, 23.15, 74.0, 23.45],
  },
  {
    id: "koyna",
    state: "Maharashtra",
    district: "Satara",
    river: "Koyna",
    dam: "Koyna Dam",
    point: [73.76, 17.4],
    bbox: [73.65, 17.22, 74.2, 17.48],
  },
  {
    id: "jayakwadi",
    state: "Maharashtra",
    district: "Chhatrapati Sambhajinagar",
    river: "Godavari",
    dam: "Jayakwadi Dam",
    point: [75.38, 19.48],
    bbox: [75.15, 19.3, 75.6, 19.65],
  },
  {
    id: "ujani",
    state: "Maharashtra",
    district: "Solapur",
    river: "Bhima",
    dam: "Ujani Dam",
    point: [74.79, 18.29],
    bbox: [74.55, 18.1, 75.05, 18.45],
  },
  {
    id: "indira_sagar",
    state: "Madhya Pradesh",
    district: "Khandwa",
    river: "Narmada",
    dam: "Indira Sagar Dam",
    point: [76.97, 22.28],
    bbox: [76.1, 22.18, 77.05, 22.35],
  },
  {
    id: "gandhi_sagar",
    state: "Madhya Pradesh",
    district: "Mandsaur",
    river: "Chambal",
    dam: "Gandhi Sagar Dam",
    point: [75.52, 24.71],
    bbox: [75.3, 24.5, 75.75, 24.9],
  },
  {
    id: "barna",
    state: "Madhya Pradesh",
    district: "Raisen",
    river: "Barna",
    dam: "Barna Dam",
    point: [78.06, 23.08],
    bbox: [77.9, 22.95, 78.2, 23.2],
  },
  {
    id: "bisalpur",
    state: "Rajasthan",
    district: "Tonk",
    river: "Banas",
    dam: "Bisalpur Dam",
    point: [75.46, 25.93],
    bbox: [75.25, 25.75, 75.65, 26.1],
  },
  {
    id: "rana_pratap",
    state: "Rajasthan",
    district: "Chittorgarh",
    river: "Chambal",
    dam: "Rana Pratap Sagar",
    point: [75.58, 24.93],
    bbox: [75.4, 24.8, 75.75, 25.05],
  },

  // SOUTHERN REGION
  {
    id: "nagarjuna_sagar",
    state: "Andhra Pradesh / Telangana",
    district: "Nalgonda",
    river: "Krishna",
    dam: "Nagarjuna Sagar Dam",
    point: [79.31, 16.57],
    bbox: [79.2, 16.45, 80.65, 16.65],
  },
  {
    id: "srisailam",
    state: "Andhra Pradesh / Telangana",
    district: "Nandyal",
    river: "Krishna",
    dam: "Srisailam Dam",
    point: [78.89, 16.08],
    bbox: [78.75, 15.95, 79.25, 16.35],
  },
  {
    id: "polavaram",
    state: "Andhra Pradesh",
    district: "Eluru",
    river: "Godavari",
    dam: "Polavaram Dam",
    point: [81.65, 17.26],
    bbox: [81.45, 17.1, 81.85, 17.4],
  },
  {
    id: "tungabhadra",
    state: "Karnataka",
    district: "Vijayanagara",
    river: "Tungabhadra",
    dam: "Tungabhadra Dam",
    point: [76.53, 15.26],
    bbox: [76.4, 15.2, 77.15, 15.95],
  },
  {
    id: "almatti",
    state: "Karnataka",
    district: "Bagalkot",
    river: "Krishna",
    dam: "Almatti Dam",
    point: [75.88, 16.33],
    bbox: [75.75, 16.15, 76.5, 16.45],
  },
  {
    id: "krs",
    state: "Karnataka",
    district: "Mandya",
    river: "Kaveri",
    dam: "Krishnarajasagara / KRS Dam",
    point: [76.57, 12.42],
    bbox: [76.4, 12.3, 76.75, 12.55],
  },
  {
    id: "mullaperiyar",
    state: "Kerala",
    district: "Idukki",
    river: "Periyar",
    dam: "Mullaperiyar Dam",
    point: [77.16, 9.53],
    bbox: [77.0, 9.45, 77.22, 9.58],
  },
  {
    id: "idukki",
    state: "Kerala",
    district: "Idukki",
    river: "Periyar",
    dam: "Idukki Dam",
    point: [76.97, 9.85],
    bbox: [76.8, 9.75, 77.05, 9.92],
  },
  {
    id: "mettur",
    state: "Tamil Nadu",
    district: "Salem",
    river: "Kaveri",
    dam: "Mettur Dam",
    point: [77.8, 11.8],
    bbox: [77.65, 11.65, 77.95, 11.95],
  },
  {
    id: "bhavanisagar",
    state: "Tamil Nadu",
    district: "Erode",
    river: "Bhavani",
    dam: "Bhavanisagar Dam",
    point: [77.14, 11.47],
    bbox: [76.95, 11.35, 77.3, 11.6],
  },
];

function getSelectedScenario() {
  const selected = document.querySelector("[name='scenario']:checked");
  return selected ? selected.value : "Full Dam Break";
}

function getSelectedModel() {
  const selected = document.querySelector("[name='model']:checked");
  return selected ? selected.value : "SPH";
}

// --- 2. Dynamic Data Collection ---
function collectSimulationData() {
  const scenario = getSelectedScenario();
  const model = getSelectedModel();

  if (activeMode === "preset") {
    const damSelect = document.getElementById("dam");
    const selectedDam = DAM_PRESETS.find((d) => d.id === damSelect.value);

    if (selectedDam) {
      return {
        mode: "PRESET",
        name: `${selectedDam.dam} - ${scenario}`,
        state: selectedDam.state,
        district: selectedDam.district,
        river: selectedDam.river,
        dam: selectedDam.dam,
        coordinates: selectedDam.point, // [lng, lat]
        bbox: selectedDam.bbox,
        scenario: scenario,
        model: model,
      };
    }
  } else {
    const lat = parseFloat(document.getElementById("custom-lat").value);
    const lng = parseFloat(document.getElementById("custom-lng").value);
    const customName =
      document.getElementById("custom-name").value.trim() ||
      `Custom Point (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
    const delta = 0.15; // ~15km buffer

    return {
      mode: "CUSTOM",
      name: `${customName} - ${scenario}`,
      state: "Custom Region",
      district: "Custom District",
      river: "Custom Waterway",
      dam: customName,
      coordinates: [lng, lat],
      bbox: [lng - delta, lat - delta, lng + delta, lat + delta],
      scenario: scenario,
      model: model,
    };
  }
}

// --- 3. Step 1 Validation ---
function validateStep1() {
  if (activeMode === "preset") {
    const damVal = document.getElementById("dam").value;
    if (!damVal) {
      alert(
        "Please complete the dropdown selection (State ➔ District ➔ River ➔ Dam/Lake) before continuing.",
      );
      return false;
    }
  } else {
    const lat = parseFloat(document.getElementById("custom-lat").value);
    const lng = parseFloat(document.getElementById("custom-lng").value);
    if (isNaN(lat) || isNaN(lng)) {
      alert("Please enter valid numerical Latitude and Longitude values.");
      return false;
    }
  }
  return true;
}

// --- 4. Dynamic Review Panel Renderer ---
function updateReview() {
  const data = collectSimulationData();
  const review = document.getElementById("review");

  if (data.mode === "PRESET") {
    review.innerHTML = `
      <div class="review-row"><span>Selection Mode</span><b>Preset Dam Catchment</b></div>
      <div class="review-row"><span>Simulation Name</span><b>${data.name}</b></div>
      <div class="review-row"><span>State / Region</span><b>${data.state}</b></div>
      <div class="review-row"><span>District</span><b>${data.district}</b></div>
      <div class="review-row"><span>River</span><b>${data.river}</b></div>
      <div class="review-row"><span>Dam / Lake</span><b>${data.dam}</b></div>
      <div class="review-row"><span>Coordinates</span><b>${data.coordinates[1]}°N, ${data.coordinates[0]}°E</b></div>
      <div class="review-row"><span>Scenario</span><b>${data.scenario}</b></div>
      <div class="review-row"><span>Model</span><b>${data.model}</b></div>
    `;
  } else {
    review.innerHTML = `
      <div class="review-row"><span>Selection Mode</span><b>Custom Coordinates</b></div>
      <div class="review-row"><span>Simulation Name</span><b>${data.name}</b></div>
      <div class="review-row"><span>Latitude</span><b>${data.coordinates[1]}°N</b></div>
      <div class="review-row"><span>Longitude</span><b>${data.coordinates[0]}°E</b></div>
      <div class="review-row"><span>Location Tag</span><b>${data.dam}</b></div>
      <div class="review-row"><span>Scenario</span><b>${data.scenario}</b></div>
      <div class="review-row"><span>Model</span><b>${data.model}</b></div>
    `;
  }

  localStorage.setItem("simulationData", JSON.stringify(data));
}

function showStep() {
  document.querySelectorAll(".s").forEach((section) => {
    section.classList.toggle(
      "active",
      Number(section.dataset.s) === currentStep,
    );
  });

  document.getElementById("step").textContent =
    `Step ${currentStep} of ${totalSteps}`;
  document.getElementById("back").disabled = currentStep === 1;
  document.getElementById("next").textContent =
    currentStep === totalSteps ? "Run Simulation" : "Continue →";

  document.querySelectorAll(".step-item").forEach((item, index) => {
    item.classList.toggle("active", index + 1 === currentStep);
    item.classList.toggle("completed", index + 1 < currentStep);
  });

  if (currentStep === totalSteps) {
    updateReview();
  }
}

// --- 5. DOM Initialization & Event Handlers ---
document.addEventListener("DOMContentLoaded", () => {
  const btnModePreset = document.getElementById("btn-mode-preset");
  const btnModeCustom = document.getElementById("btn-mode-custom");
  const sectionPreset = document.getElementById("section-preset");
  const sectionCustom = document.getElementById("section-custom");

  const stateSelect = document.getElementById("state");
  const districtSelect = document.getElementById("district");
  const riverSelect = document.getElementById("river");
  const damSelect = document.getElementById("dam");

  // Mode Switcher Toggle
  btnModePreset.addEventListener("click", () => {
    activeMode = "preset";
    btnModePreset.className = "btn btn-primary active";
    btnModeCustom.className = "btn btn-outline-primary";
    sectionPreset.classList.remove("d-none");
    sectionCustom.classList.add("d-none");
  });

  btnModeCustom.addEventListener("click", () => {
    activeMode = "custom";
    btnModeCustom.className = "btn btn-primary active";
    btnModePreset.className = "btn btn-outline-primary";
    sectionCustom.classList.remove("d-none");
    sectionPreset.classList.add("d-none");
  });

  // Populate States
  function populateStates() {
    const states = [...new Set(DAM_PRESETS.map((d) => d.state))].sort();
    stateSelect.innerHTML = '<option value="">Select State...</option>';
    states.forEach((st) => {
      stateSelect.innerHTML += `<option value="${st}">${st}</option>`;
    });
  }

  // Cascading Dropdown Listeners
  stateSelect.addEventListener("change", function () {
    const selectedState = this.value;
    districtSelect.innerHTML = '<option value="">Select District...</option>';
    riverSelect.innerHTML = '<option value="">Select River...</option>';
    damSelect.innerHTML = '<option value="">Select Dam/Lake...</option>';

    if (!selectedState) {
      districtSelect.disabled =
        riverSelect.disabled =
        damSelect.disabled =
          true;
      return;
    }

    const districts = [
      ...new Set(
        DAM_PRESETS.filter((d) => d.state === selectedState).map(
          (d) => d.district,
        ),
      ),
    ].sort();
    districts.forEach((dist) => {
      districtSelect.innerHTML += `<option value="${dist}">${dist}</option>`;
    });

    districtSelect.disabled = false;
    riverSelect.disabled = damSelect.disabled = true;
  });

  districtSelect.addEventListener("change", function () {
    const selectedState = stateSelect.value;
    const selectedDistrict = this.value;
    riverSelect.innerHTML = '<option value="">Select River...</option>';
    damSelect.innerHTML = '<option value="">Select Dam/Lake...</option>';

    if (!selectedDistrict) {
      riverSelect.disabled = damSelect.disabled = true;
      return;
    }

    const rivers = [
      ...new Set(
        DAM_PRESETS.filter(
          (d) => d.state === selectedState && d.district === selectedDistrict,
        ).map((d) => d.river),
      ),
    ].sort();
    rivers.forEach((riv) => {
      riverSelect.innerHTML += `<option value="${riv}">${riv}</option>`;
    });

    riverSelect.disabled = false;
    damSelect.disabled = true;
  });

  riverSelect.addEventListener("change", function () {
    const selectedState = stateSelect.value;
    const selectedDistrict = districtSelect.value;
    const selectedRiver = this.value;
    damSelect.innerHTML = '<option value="">Select Dam/Lake...</option>';

    if (!selectedRiver) {
      damSelect.disabled = true;
      return;
    }

    const dams = DAM_PRESETS.filter(
      (d) =>
        d.state === selectedState &&
        d.district === selectedDistrict &&
        d.river === selectedRiver,
    );

    dams.forEach((d) => {
      damSelect.innerHTML += `<option value="${d.id}">${d.dam}</option>`;
    });

    damSelect.disabled = false;
  });

  populateStates();

  // Navigation Buttons
  document.getElementById("next").addEventListener("click", () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
    }

    if (currentStep < totalSteps) {
      currentStep++;
      showStep();
    } else {
      const data = collectSimulationData();
      localStorage.setItem("simulationData", JSON.stringify(data));
      window.location.href = "simulation-running.html";
    }
  });

  document.getElementById("back").addEventListener("click", () => {
    if (currentStep > 1) {
      currentStep--;
      showStep();
    }
  });

  showStep();
});

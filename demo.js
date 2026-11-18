const palette = [
  ["Coral", "#F94C3E"],
  ["Teal", "#00A99A"],
  ["Cobalt", "#2A56E8"],
  ["Sunflower", "#FFC400"],
  ["Navy", "#1A2FA8"],
  ["Amber", "#E07700"],
  ["Aqua", "#2ED3C2"],
];
const colors = palette.map(([, color]) => color);
const directionColors = { left: colors[1], top: colors[3], right: colors[0] };
const query = new URLSearchParams(location.search);
// A literal # in a screenshot URL starts a fragment, including subsequent fill entries.
const screenshotFills = query.has("fills")
  ? new URLSearchParams(location.search + location.hash).get("fills")
  : "";
const stage = document.querySelector("#stage");
const pageSelect = document.querySelector("#page");
const modeButtons = document.querySelectorAll("[data-mode]");
const swatches = document.querySelector("#swatches");
const shuffle = document.querySelector("#shuffle");
const status = document.querySelector("#status");

const faceColors = new Map();
let faces = [];
let seed = 34;
let selectedColor = colors[0];
let activeMode = "one-side";
let requestId = 0;

function seededRandom(start) {
  let state = start;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Register the bucket with the tap handler and write to faceColors.
// Register brush pointer handlers on the stage and render strokes in #paint-layer.
// A future undo stack can record faceColors edits and brush commands together.
const modes = {
  "one-side": {
    help: "Black on the left faces, with white seams where they meet.",
    color: face => face.dataset.dir === "left" ? "#000" : null,
  },
  paladin: {
    help: "One color for each face direction.",
    color: face => directionColors[face.dataset.dir],
  },
  mage: {
    help: "The seven colors cycle across individual faces.",
    color: (_, index) => colors[index % colors.length],
  },
  random: {
    help: "A random color for each face. Shuffle for a new mix.",
    color: (_, index, random) => colors[Math.floor(random() * colors.length)],
  },
  tap: {
    help: "Pick a color, then tap or click any face.",
    activate(event) {
      const face = event.target.closest("[data-face-id]");
      if (!face || !stage.contains(face)) return;
      faceColors.set(face.dataset.faceId, selectedColor);
      renderColors();
    },
  },
};

function renderColors() {
  for (const face of faces) {
    face.setAttribute("fill", faceColors.get(face.dataset.faceId) ?? "#fff");
  }
}

function setMode(name, initialFills = "") {
  activeMode = name;
  const mode = modes[name];
  const interactive = Boolean(mode.activate);
  const random = seededRandom(seed);
  faceColors.clear();
  faces.forEach((face, index) => {
    const color = mode.color?.(face, index, random);
    if (color) faceColors.set(face.dataset.faceId, color);
    if (interactive) {
      face.setAttribute("tabindex", "0");
      face.setAttribute("role", "button");
      face.setAttribute("aria-label", `Fill ${face.dataset.faceId}`);
    } else {
      face.removeAttribute("tabindex");
      face.removeAttribute("role");
      face.removeAttribute("aria-label");
    }
  });

  if (interactive && initialFills) {
    const ids = new Set(faces.map(face => face.dataset.faceId));
    for (const entry of initialFills.split(",")) {
      const [id, color] = entry.split(":");
      if (ids.has(id) && /^#[\da-f]{6}$/i.test(color)) faceColors.set(id, color);
    }
  }

  stage.dataset.tool = name;
  stage.querySelector("#seams")?.setAttribute("display", name === "one-side" ? "inline" : "none");
  for (const button of modeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === name));
  }
  for (const input of swatches.querySelectorAll("input")) input.disabled = !interactive;
  document.querySelector("#mode-help").textContent = mode.help;
  shuffle.hidden = name !== "random";
  renderColors();
}

for (const [name, color] of palette) {
  const label = document.createElement("label");
  label.className = "swatch";
  label.style.setProperty("--swatch", color);
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "color";
  input.value = color;
  input.checked = color === selectedColor;
  input.disabled = true;
  const chip = document.createElement("span");
  chip.className = "chip";
  label.append(input, chip, name);
  swatches.append(label);
}

swatches.addEventListener("change", event => {
  selectedColor = event.target.value;
});
for (const button of modeButtons) {
  button.addEventListener("click", () => {
    if (activeMode !== button.dataset.mode) setMode(button.dataset.mode);
  });
}
shuffle.addEventListener("click", () => {
  seed += 1;
  setMode("random");
});
stage.addEventListener("click", event => modes[activeMode].activate?.(event));
stage.addEventListener("keydown", event => {
  if (!modes[activeMode].activate || !["Enter", " "].includes(event.key)) return;
  if (!event.target.closest("[data-face-id]")) return;
  event.preventDefault();
  modes[activeMode].activate(event);
});

async function fetchAsset(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response;
}

async function loadPage(page, initialFills) {
  const id = ++requestId;
  try {
    const response = await fetchAsset(`pages/${page.svg}`);
    const documentSvg = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
    if (id !== requestId) return;
    const svg = documentSvg.documentElement;
    if (svg.localName !== "svg") throw new Error(`Invalid artwork in ${page.svg}`);
    svg.setAttribute("aria-label", page.title);
    stage.replaceChildren(svg);
    faces = [...svg.querySelectorAll("[data-face-id]")];
    document.querySelector("#page-title").textContent = page.title;
    document.querySelector("#face-count").textContent = `${faces.length} faces`;
    pageSelect.value = page.id;
    setMode(activeMode, initialFills);
    status.hidden = true;
  } catch (error) {
    if (id !== requestId) return;
    status.textContent = error.message;
    status.hidden = false;
  }
}

async function init() {
  try {
    const response = await fetchAsset("pages/manifest.json");
    const pages = await response.json();
    for (const page of pages) pageSelect.add(new Option(page.title, page.id));
    const requested = query.get("mode");
    const aliases = { 1: "one-side", 2: "paladin", 3: "mage", 4: "random", 5: "tap" };
    const mode = Object.hasOwn(aliases, requested) ? aliases[requested] : requested;
    setMode(Object.hasOwn(modes, mode) ? mode : "one-side");
    const initialPage = pages.find(page => page.id === query.get("page")) ?? pages[0];
    await loadPage(initialPage, screenshotFills);
    pageSelect.disabled = false;
    pageSelect.addEventListener("change", () => {
      loadPage(pages.find(page => page.id === pageSelect.value));
    });
  } catch (error) {
    status.textContent = error.message;
  }
}

init();

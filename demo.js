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
const mobileSwatches = document.querySelector("#mobile-swatches");
const mobilePlay = document.querySelector("#mobile-play");
const shuffle = document.querySelector("#shuffle");
const status = document.querySelector("#status");
const modeNames = {
  "one-side": "One side only",
  paladin: "One color per side",
  mage: "One color per face",
  random: "Random colors",
  tap: "Tap to fill",
};

const faceColors = new Map();
let faces = [];
let seed = 34;
let selectedColor = colors[0];
let activeMode = "one-side";
let requestId = 0;
let ignoreClick = false;

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
  for (const input of document.querySelectorAll('input[name="color"], .color-picker')) {
    input.disabled = !interactive;
  }
  document.querySelector("#mode-help").textContent = mode.help;
  mobilePlay.classList.toggle("is-tap", name === "tap");
  updatePageLabel();
  shuffle.hidden = name !== "random";
  renderColors();
}

const customColorKey = "color-in-3d-custom-colors";
const maxCustomColors = 5;
const presetNodes = [];
let customNodes = [];

function normalizeHex(value) {
  if (typeof value !== "string") return "";
  const hex = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : "";
}

function makeSwatch(name, color) {
  const label = document.createElement("label");
  label.className = "swatch";
  label.style.setProperty("--swatch", color);
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "color";
  input.value = color;
  input.checked = color.toLowerCase() === selectedColor.toLowerCase();
  input.disabled = true;
  const chip = document.createElement("span");
  chip.className = "chip";
  const text = document.createElement("span");
  text.className = "swatch-name";
  text.textContent = name;
  label.append(input, chip, text);
  return label;
}

for (const [name, color] of palette) presetNodes.push(makeSwatch(name, color));

const addSwatch = document.createElement("label");
addSwatch.className = "swatch swatch-add";
const colorPicker = document.createElement("input");
colorPicker.type = "color";
colorPicker.className = "color-picker";
colorPicker.value = colors[0];
colorPicker.setAttribute("aria-label", "Choose a color");
colorPicker.title = "Choose a color";
const addChip = document.createElement("span");
addChip.className = "chip add-chip";
addChip.textContent = "+";
addChip.setAttribute("aria-hidden", "true");
const addName = document.createElement("span");
addName.className = "swatch-name";
addName.textContent = "Custom";
addSwatch.append(colorPicker, addChip, addName);

function readCustomColors() {
  try {
    const parsed = JSON.parse(localStorage.getItem(customColorKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    const presets = new Set(colors.map(color => color.toLowerCase()));
    const unique = [];
    for (const item of parsed) {
      const hex = normalizeHex(item);
      if (!hex || presets.has(hex) || unique.includes(hex)) continue;
      unique.push(hex);
    }
    return unique.slice(-maxCustomColors);
  } catch {
    return [];
  }
}

function writeCustomColors(list) {
  localStorage.setItem(customColorKey, JSON.stringify(list));
}

const compactQuery = window.matchMedia("(max-width: 640px)");
function placeSwatches() {
  const host = compactQuery.matches ? mobileSwatches : swatches;
  host.append(...presetNodes, ...customNodes, addSwatch);
}
function renderCustomSwatches(list) {
  for (const node of customNodes) node.remove();
  customNodes = list.map(hex => makeSwatch(hex.toUpperCase(), hex));
  placeSwatches();
  const interactive = Boolean(modes[activeMode].activate);
  for (const input of document.querySelectorAll('input[name="color"], .color-picker')) {
    input.disabled = !interactive;
  }
}
function selectSwatch(hex) {
  selectedColor = hex;
  for (const input of document.querySelectorAll('input[name="color"]')) {
    input.checked = input.value.toLowerCase() === hex.toLowerCase();
  }
}
function addCustomColor(value) {
  const hex = normalizeHex(value);
  if (!hex) return;
  const preset = colors.find(color => color.toLowerCase() === hex);
  if (preset) {
    selectSwatch(preset);
    return;
  }
  const list = readCustomColors().filter(color => color !== hex);
  list.push(hex);
  const kept = list.slice(-maxCustomColors);
  writeCustomColors(kept);
  renderCustomSwatches(kept);
  selectSwatch(hex);
}

colorPicker.addEventListener("change", () => addCustomColor(colorPicker.value));
renderCustomSwatches(readCustomColors());
compactQuery.addEventListener("change", placeSwatches);

document.addEventListener("change", event => {
  if (event.target.name === "color") selectedColor = event.target.value;
});
for (const button of modeButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.mode === "random" && activeMode === "random") {
      seed += 1;
      setMode("random");
      return;
    }
    if (activeMode !== button.dataset.mode) setMode(button.dataset.mode);
  });
}
shuffle.addEventListener("click", () => {
  seed += 1;
  setMode("random");
});
stage.addEventListener("click", event => {
  if (ignoreClick) {
    ignoreClick = false;
    return;
  }
  modes[activeMode].activate?.(event);
});

let swipeStart = null;
stage.addEventListener("touchstart", event => {
  if (event.touches.length !== 1) return;
  swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
stage.addEventListener("touchend", event => {
  if (!swipeStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipeStart.x;
  const dy = touch.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
  ignoreClick = true;
  stepPage(dx < 0 ? 1 : -1);
});
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
    fitArtwork(svg);
    faces = [...svg.querySelectorAll("[data-face-id]")];
    document.querySelector("#page-title").textContent = page.title;
    document.querySelector("#face-count").textContent = `${faces.length} faces`;
    pageSelect.value = page.id;
    updatePageLabel();
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
    for (const id of ["page-prev", "page-next"]) document.querySelector(`#${id}`).disabled = false;
    document.querySelector("#page-prev").addEventListener("click", () => stepPage(-1));
    document.querySelector("#page-next").addEventListener("click", () => stepPage(1));
  } catch (error) {
    status.textContent = error.message;
  }
}

function fitArtwork(svg) {
  const nodes = [...svg.querySelectorAll("#fills, #line-art, #seams")];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const box = node.getBBox();
    if (!box.width && !box.height) continue;
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return;
  const width = maxX - minX;
  const height = maxY - minY;
  // The drawing fills 87.5% of the canvas on its longer side.
  const scale = 1 / 0.875;
  svg.setAttribute("viewBox", [
    minX - width * (scale - 1) / 2,
    minY - height * (scale - 1) / 2,
    width * scale,
    height * scale,
  ].join(" "));
}

function updatePageLabel() {
  const options = [...pageSelect.options];
  const index = options.findIndex(option => option.value === pageSelect.value);
  const pageText = index >= 0 ? `${options[index].textContent} ${index + 1}/${options.length}` : "";
  const modeText = modeNames[activeMode] || "";
  const caption = document.querySelector("#mode-caption");
  if (caption) caption.textContent = pageText && modeText ? `${pageText} · ${modeText}` : pageText || modeText;
  const canvasPage = document.querySelector("#canvas-page");
  if (canvasPage) canvasPage.textContent = pageText;
}

function stepPage(delta) {
  const options = [...pageSelect.options];
  if (!options.length || pageSelect.disabled) return;
  const index = options.findIndex(option => option.value === pageSelect.value);
  const next = (index + delta + options.length) % options.length;
  pageSelect.value = options[next].value;
  pageSelect.dispatchEvent(new Event("change"));
}

init();

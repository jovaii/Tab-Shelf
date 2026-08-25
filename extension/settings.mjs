import {
  MAX_BACKGROUND_IMAGE_BYTES,
  THEME_PRESETS,
  exportPreferences,
  importPreferences,
  preferencesFromPreset,
  validatePreferences,
} from "./core/preferences.mjs";
import { createSafariGateway } from "./platform/safari-gateway.mjs";
import { element } from "./ui/dom.mjs";
import { applyTheme, themeCssVariables } from "./ui/theme-runtime.mjs";

const MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024;
const SAVE_DELAY_MS = 180;
const PRESET_META = Object.freeze({
  "quiet-neutral": { name: "Quiet Neutral", note: "Soft stone and glass" },
  "mist-teal": { name: "Mist Teal", note: "Coastal depth" },
  "ice-lavender": { name: "Ice Lavender", note: "Cool, airy color" },
  "neon-bloom": { name: "Neon Bloom", note: "Dark with magenta light" },
  "storm-horizon": { name: "Storm Horizon", note: "Navy sky, coral horizon" },
});

const controls = Object.freeze({
  form: document.querySelector("#theme-form"),
  presetGrid: document.querySelector("#preset-grid"),
  backgroundKind: document.querySelector("#background-kind"),
  backgroundColor: document.querySelector("#background-color"),
  gradientControls: document.querySelector("#gradient-controls"),
  gradientAngle: document.querySelector("#gradient-angle"),
  gradientAngleValue: document.querySelector("#gradient-angle-value"),
  gradientStops: document.querySelector("#gradient-stops"),
  addGradientStop: document.querySelector("#add-gradient-stop"),
  backgroundImage: document.querySelector("#background-image"),
  removeBackgroundImage: document.querySelector("#remove-background-image"),
  imageFit: document.querySelector("#image-fit"),
  blurPx: document.querySelector("#blur-px"),
  blurPxValue: document.querySelector("#blur-px-value"),
  imageOpacity: document.querySelector("#image-opacity"),
  imageOpacityValue: document.querySelector("#image-opacity-value"),
  overlayColor: document.querySelector("#overlay-color"),
  overlayOpacity: document.querySelector("#overlay-opacity"),
  overlayOpacityValue: document.querySelector("#overlay-opacity-value"),
  cardOpacity: document.querySelector("#card-opacity"),
  cardOpacityValue: document.querySelector("#card-opacity-value"),
  textMode: document.querySelector("#text-mode"),
  contrastBoost: document.querySelector("#contrast-boost"),
  accentColor: document.querySelector("#accent-color"),
  resetTheme: document.querySelector("#reset-theme"),
  resetWorkspace: document.querySelector("#reset-workspace"),
  exportTheme: document.querySelector("#export-theme"),
  importTheme: document.querySelector("#import-theme"),
  openShelf: document.querySelector("#open-shelf"),
  status: document.querySelector("#settings-status"),
});

let gateway;
let preferences;
let saveTimer;
let saveRevision = 0;

function detached(value) {
  return structuredClone(validatePreferences(value));
}

function setStatus(message = "", tone = "normal") {
  controls.status.textContent = message;
  controls.status.dataset.tone = tone;
}

function valueAsFraction(control) {
  return Number(control.value) / 100;
}

function applyCurrentTheme() {
  applyTheme(document.documentElement, preferences);
}

function updateReadouts() {
  controls.gradientAngleValue.value = `${preferences.background.angle}°`;
  controls.blurPxValue.value = `${preferences.blurPx} px`;
  controls.imageOpacityValue.value = `${Math.round(preferences.imageOpacity * 100)}%`;
  controls.overlayOpacityValue.value = `${Math.round(preferences.overlayOpacity * 100)}%`;
  controls.cardOpacityValue.value = `${Math.round(preferences.cardOpacity * 100)}%`;
}

async function saveImmediately(message = "Saved on this Mac") {
  const revision = ++saveRevision;
  window.clearTimeout(saveTimer);
  setStatus("Saving…");
  try {
    await gateway.setPreferences(preferences);
    if (revision === saveRevision) setStatus(message);
  } catch {
    if (revision === saveRevision) setStatus("Safari could not save this theme.", "error");
  }
}

function scheduleSave() {
  const revision = ++saveRevision;
  window.clearTimeout(saveTimer);
  setStatus("Saving…");
  saveTimer = window.setTimeout(async () => {
    try {
      await gateway.setPreferences(preferences);
      if (revision === saveRevision) setStatus("Saved on this Mac");
    } catch {
      if (revision === saveRevision) setStatus("Safari could not save this theme.", "error");
    }
  }, SAVE_DELAY_MS);
}

function renderPresetGrid() {
  const buttons = Object.entries(PRESET_META).map(([id, meta]) => {
    const variables = themeCssVariables(THEME_PRESETS[id]);
    const swatch = element(document, "span", {
      className: "preset-button__swatch",
      attributes: { "aria-hidden": "true" },
    });
    swatch.style.background = variables["--page-background"];

    const copy = element(document, "span", {
      className: "preset-button__copy",
      children: [
        element(document, "strong", { text: meta.name }),
        element(document, "small", { text: meta.note }),
      ],
    });
    const selected = preferences.preset === id;
    return element(document, "button", {
      className: "preset-button",
      type: "button",
      attributes: { "aria-pressed": String(selected) },
      children: [
        swatch,
        copy,
        element(document, "span", {
          className: "preset-button__state",
          text: selected ? "Selected" : "Choose",
        }),
      ],
      on: {
        click: () => selectPreset(id),
      },
    });
  });
  controls.presetGrid.replaceChildren(...buttons);
}

function adoptDraft(draft, { renderStops = false } = {}) {
  draft.preset = "custom";
  try {
    preferences = detached(draft);
    applyCurrentTheme();
    updateReadouts();
    updateConditionalControls();
    renderPresetGrid();
    if (renderStops) renderGradientStops();
    scheduleSave();
  } catch {
    setStatus("That combination is not valid yet.", "error");
  }
}

function gradientStopRow(stop, index) {
  const colorInput = element(document, "input", {
    type: "color",
    attributes: { "aria-label": `Color for stop ${index + 1}` },
    on: {
      input: (event) => {
        const draft = structuredClone(preferences);
        draft.background.stops[index].color = event.currentTarget.value;
        adoptDraft(draft);
      },
    },
  });
  colorInput.name = `gradient-stop-color-${index + 1}`;
  colorInput.autocomplete = "off";
  colorInput.value = stop.color;

  const positionOutput = element(document, "output", { text: `${stop.position}%` });
  const positionInput = element(document, "input", {
    type: "range",
    attributes: {
      "aria-label": `Position for stop ${index + 1}`,
      min: "0",
      max: "100",
      step: "1",
      name: `gradient-stop-position-${index + 1}`,
      autocomplete: "off",
    },
    on: {
      input: (event) => {
        positionOutput.value = `${event.currentTarget.value}%`;
      },
      change: (event) => {
        const draft = structuredClone(preferences);
        draft.background.stops[index].position = Number(event.currentTarget.value);
        adoptDraft(draft, { renderStops: true });
      },
    },
  });
  positionInput.value = String(stop.position);

  const removeButton = element(document, "button", {
    className: "icon-button",
    text: "×",
    type: "button",
    disabled: preferences.background.stops.length <= 2,
    attributes: { "aria-label": `Remove color stop ${index + 1}` },
    on: {
      click: () => removeGradientStop(index),
    },
  });

  return element(document, "div", {
    className: "gradient-stop",
    children: [colorInput, positionInput, positionOutput, removeButton],
  });
}

function renderGradientStops() {
  controls.gradientStops.replaceChildren(
    ...preferences.background.stops.map(gradientStopRow),
  );
  controls.addGradientStop.disabled = preferences.background.stops.length >= 6;
}

function widestStopGap(stops) {
  let result = { index: 1, size: -1 };
  for (let index = 1; index < stops.length; index += 1) {
    const size = stops[index].position - stops[index - 1].position;
    if (size > result.size) result = { index, size };
  }
  return result.index;
}

function addGradientStop() {
  if (preferences.background.stops.length >= 6) return;
  const draft = structuredClone(preferences);
  const insertionIndex = widestStopGap(draft.background.stops);
  const left = draft.background.stops[insertionIndex - 1];
  const right = draft.background.stops[insertionIndex];
  draft.background.stops.splice(insertionIndex, 0, {
    color: left.color,
    position: Math.round((left.position + right.position) / 2),
  });
  adoptDraft(draft, { renderStops: true });
}

function removeGradientStop(index) {
  if (preferences.background.stops.length <= 2) return;
  const draft = structuredClone(preferences);
  draft.background.stops.splice(index, 1);
  adoptDraft(draft, { renderStops: true });
}

function updateConditionalControls() {
  controls.gradientControls.hidden = controls.backgroundKind.value === "solid";
  controls.gradientAngle.closest(".field").hidden = controls.backgroundKind.value !== "linear";
  controls.removeBackgroundImage.disabled = preferences.backgroundImage === null;
}

function fillForm() {
  controls.backgroundKind.value = preferences.background.kind;
  controls.backgroundColor.value = preferences.background.color;
  controls.gradientAngle.value = String(preferences.background.angle);
  controls.imageFit.value = preferences.imageFit;
  controls.blurPx.value = String(preferences.blurPx);
  controls.imageOpacity.value = String(Math.round(preferences.imageOpacity * 100));
  controls.overlayColor.value = preferences.overlayColor;
  controls.overlayOpacity.value = String(Math.round(preferences.overlayOpacity * 100));
  controls.cardOpacity.value = String(Math.round(preferences.cardOpacity * 100));
  controls.textMode.value = preferences.textMode;
  controls.contrastBoost.checked = preferences.contrastBoost;
  controls.accentColor.value = preferences.accentColor;
  updateReadouts();
  updateConditionalControls();
  renderGradientStops();
  renderPresetGrid();
}

function readForm() {
  const draft = structuredClone(preferences);
  draft.background.kind = controls.backgroundKind.value;
  draft.background.color = controls.backgroundColor.value;
  draft.background.angle = Number(controls.gradientAngle.value);
  draft.imageFit = controls.imageFit.value;
  draft.blurPx = Number(controls.blurPx.value);
  draft.imageOpacity = valueAsFraction(controls.imageOpacity);
  draft.overlayColor = controls.overlayColor.value;
  draft.overlayOpacity = valueAsFraction(controls.overlayOpacity);
  draft.cardOpacity = valueAsFraction(controls.cardOpacity);
  draft.textMode = controls.textMode.value;
  draft.contrastBoost = controls.contrastBoost.checked;
  draft.accentColor = controls.accentColor.value;
  return draft;
}

function selectPreset(id) {
  preferences = preferencesFromPreset(id);
  applyCurrentTheme();
  fillForm();
  saveImmediately(`${PRESET_META[id].name} applied`);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new TypeError("Safari could not optimise this image."));
    }, type, quality);
  });
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(new TypeError("Safari could not read this image.")), { once: true });
    reader.readAsDataURL(blob);
  });
}

async function decodedImage(file) {
  if (typeof globalThis.createImageBitmap === "function") {
    return globalThis.createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function optimiseImage(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new TypeError("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new TypeError("Choose an image smaller than 24 MB.");
  }

  const source = await decodedImage(file);
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new TypeError("Safari could not prepare this image.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();

  const attempts = [
    ["image/webp", 0.84],
    ["image/webp", 0.7],
    ["image/jpeg", 0.78],
    ["image/jpeg", 0.62],
  ];
  for (const [type, quality] of attempts) {
    const blob = await canvasBlob(canvas, type, quality);
    if (blob.size <= MAX_BACKGROUND_IMAGE_BYTES
      && ["image/png", "image/jpeg", "image/webp"].includes(blob.type)) {
      return blobDataUrl(blob);
    }
  }
  throw new TypeError("This image remains too large after local optimisation.");
}

async function chooseBackgroundImage(event) {
  const [file] = event.currentTarget.files;
  if (!file) return;
  setStatus("Optimising image locally…");
  try {
    const dataUrl = await optimiseImage(file);
    const draft = structuredClone(preferences);
    draft.backgroundImage = dataUrl;
    adoptDraft(draft);
    setStatus("Background image applied");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    event.currentTarget.value = "";
  }
}

function removeBackgroundImage() {
  if (preferences.backgroundImage === null) return;
  const draft = structuredClone(preferences);
  draft.backgroundImage = null;
  adoptDraft(draft);
  setStatus("Background image removed");
}

function exportTheme() {
  const blob = new Blob([exportPreferences(preferences)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = element(document, "a", {
    attributes: {
      download: "tab-shelf-preferences-v1.json",
      href: url,
    },
  });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus("Theme exported");
}

async function importTheme(event) {
  const [file] = event.currentTarget.files;
  if (!file) return;
  try {
    if (file.size > 6 * 1024 * 1024) throw new TypeError("That settings file is too large.");
    preferences = detached(importPreferences(await file.text()));
    applyCurrentTheme();
    fillForm();
    await saveImmediately("Theme imported");
  } catch (error) {
    setStatus(error instanceof TypeError ? error.message : "The theme could not be imported.", "error");
  } finally {
    event.currentTarget.value = "";
  }
}

function bindControls() {
  for (const control of [
    controls.backgroundKind,
    controls.backgroundColor,
    controls.gradientAngle,
    controls.imageFit,
    controls.blurPx,
    controls.imageOpacity,
    controls.overlayColor,
    controls.overlayOpacity,
    controls.cardOpacity,
    controls.textMode,
    controls.contrastBoost,
    controls.accentColor,
  ]) {
    control.addEventListener("input", () => adoptDraft(readForm()));
  }
  controls.addGradientStop.addEventListener("click", addGradientStop);
  controls.backgroundImage.addEventListener("change", chooseBackgroundImage);
  controls.removeBackgroundImage.addEventListener("click", removeBackgroundImage);
  controls.exportTheme.addEventListener("click", exportTheme);
  controls.importTheme.addEventListener("change", importTheme);
  controls.resetTheme.addEventListener("click", () => selectPreset("quiet-neutral"));
  controls.resetWorkspace.addEventListener("click", async () => {
    if (!window.confirm("Reset every custom category and saved tab position? Your theme will stay unchanged.")) return;
    setStatus("Resetting tab layout…");
    try {
      await gateway.resetWorkspace();
      setStatus("Workspace layout reset");
    } catch {
      setStatus("Safari could not reset the workspace layout.", "error");
    }
  });
  controls.openShelf.addEventListener("click", async () => {
    try {
      await gateway.openShelf();
    } catch {
      setStatus("Safari could not open the shelf.", "error");
    }
  });
}

async function start() {
  try {
    gateway = createSafariGateway(globalThis.browser);
    preferences = detached(await gateway.getPreferences());
    applyCurrentTheme();
    fillForm();
    bindControls();
    setStatus("Changes save automatically on this Mac");
    document.documentElement.dataset.renderReady = "true";
  } catch {
    setStatus("Open Theme Studio through the Tab Shelf Safari extension.", "error");
    controls.form.querySelectorAll("button, input, select").forEach((control) => {
      control.disabled = true;
    });
    document.documentElement.dataset.renderReady = "error";
  }
}

start();

export const PREFERENCE_KEY = "tabShelf.preferences.v1";
export const MAX_BACKGROUND_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMPORT_TEXT_LENGTH = 6 * 1024 * 1024;

const HEX_COLOR = /^#[a-f0-9]{6}$/iu;
const IMAGE_DATA = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/]+={0,2})$/iu;
const TOP_LEVEL_KEYS = Object.freeze([
  "schema",
  "preset",
  "background",
  "backgroundImage",
  "imageFit",
  "blurPx",
  "imageOpacity",
  "overlayColor",
  "overlayOpacity",
  "cardOpacity",
  "textMode",
  "contrastBoost",
  "accentColor",
]);
const BACKGROUND_KEYS = Object.freeze(["kind", "color", "angle", "stops"]);
const STOP_KEYS = Object.freeze(["color", "position"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function theme({
  name,
  background,
  imageFit = "cover",
  blurPx = 0,
  imageOpacity = 1,
  overlayColor,
  overlayOpacity,
  cardOpacity,
  textMode,
  contrastBoost = false,
  accentColor,
}) {
  return deepFreeze({
    schema: PREFERENCE_KEY,
    preset: name,
    background,
    backgroundImage: null,
    imageFit,
    blurPx,
    imageOpacity,
    overlayColor,
    overlayOpacity,
    cardOpacity,
    textMode,
    contrastBoost,
    accentColor,
  });
}

export const THEME_PRESETS = deepFreeze({
  "quiet-neutral": theme({
    name: "quiet-neutral",
    background: {
      kind: "linear",
      color: "#e8ece9",
      angle: 145,
      stops: [
        { color: "#f2f3ef", position: 0 },
        { color: "#d8e0dd", position: 52 },
        { color: "#b9cac5", position: 100 },
      ],
    },
    overlayColor: "#ffffff",
    overlayOpacity: 0.12,
    cardOpacity: 0.88,
    textMode: "dark",
    accentColor: "#2f6f68",
  }),
  "mist-teal": theme({
    name: "mist-teal",
    background: {
      kind: "linear",
      color: "#b9cbc7",
      angle: 148,
      stops: [
        { color: "#e7e6df", position: 0 },
        { color: "#aec4c1", position: 46 },
        { color: "#075563", position: 100 },
      ],
    },
    overlayColor: "#eaf8f5",
    overlayOpacity: 0.1,
    cardOpacity: 0.86,
    textMode: "dark",
    contrastBoost: true,
    accentColor: "#159b91",
  }),
  "ice-lavender": theme({
    name: "ice-lavender",
    background: {
      kind: "linear",
      color: "#c5deea",
      angle: 132,
      stops: [
        { color: "#dff8ff", position: 0 },
        { color: "#acddeb", position: 43 },
        { color: "#c9b9e1", position: 100 },
      ],
    },
    overlayColor: "#ffffff",
    overlayOpacity: 0.14,
    cardOpacity: 0.87,
    textMode: "dark",
    accentColor: "#6e5ab5",
  }),
  "neon-bloom": theme({
    name: "neon-bloom",
    background: {
      kind: "radial",
      color: "#090710",
      angle: 180,
      stops: [
        { color: "#ff2abf", position: 0 },
        { color: "#28102d", position: 38 },
        { color: "#05060d", position: 100 },
      ],
    },
    overlayColor: "#05060d",
    overlayOpacity: 0.2,
    cardOpacity: 0.82,
    textMode: "light",
    contrastBoost: true,
    accentColor: "#ff2abf",
  }),
});

export const DEFAULT_PREFERENCES = THEME_PRESETS["quiet-neutral"];

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertKnownKeys(value, allowed, label) {
  const admitted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!admitted.has(key)) throw new TypeError(`Unknown ${label} key: ${key}`);
  }
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new TypeError(`${label} is not supported`);
  return value;
}

function boundedNumber(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function color(value, label) {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new TypeError(`${label} must be a six-digit hex color`);
  }
  return value.toLocaleLowerCase("en-US");
}

function validateStop(value) {
  assertPlainObject(value, "Gradient stop");
  assertKnownKeys(value, STOP_KEYS, "gradient stop");
  return {
    color: color(value.color, "Gradient stop color"),
    position: boundedNumber(value.position, 0, 100, "Gradient stop position"),
  };
}

function validateBackground(value) {
  assertPlainObject(value, "Background");
  assertKnownKeys(value, BACKGROUND_KEYS, "background");
  if (!Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > 6) {
    throw new TypeError("Background requires two to six gradient stops");
  }
  const stops = value.stops
    .map(validateStop)
    .sort((left, right) => left.position - right.position);
  return {
    kind: oneOf(value.kind, ["solid", "linear", "radial"], "background.kind"),
    color: color(value.color, "background.color"),
    angle: boundedNumber(value.angle, 0, 360, "background.angle"),
    stops,
  };
}

function validateBackgroundImage(value) {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new TypeError("backgroundImage must be null or an admitted image data URL");
  }
  const match = IMAGE_DATA.exec(value);
  if (!match || match[2].length % 4 !== 0) {
    throw new TypeError("backgroundImage must be PNG, JPEG, or WebP base64 data");
  }
  const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
  const decodedBytes = (match[2].length / 4) * 3 - padding;
  if (decodedBytes > MAX_BACKGROUND_IMAGE_BYTES) {
    throw new TypeError("backgroundImage exceeds the local storage budget");
  }
  return value;
}

function clonePreferences(value) {
  return {
    schema: value.schema,
    preset: value.preset,
    background: {
      kind: value.background.kind,
      color: value.background.color,
      angle: value.background.angle,
      stops: value.background.stops.map((stop) => ({ ...stop })),
    },
    backgroundImage: value.backgroundImage,
    imageFit: value.imageFit,
    blurPx: value.blurPx,
    imageOpacity: value.imageOpacity,
    overlayColor: value.overlayColor,
    overlayOpacity: value.overlayOpacity,
    cardOpacity: value.cardOpacity,
    textMode: value.textMode,
    contrastBoost: value.contrastBoost,
    accentColor: value.accentColor,
  };
}

export function preferencesFromPreset(name) {
  const preset = THEME_PRESETS[name];
  if (!preset) throw new TypeError("Unknown theme preset");
  return clonePreferences(preset);
}

export function validatePreferences(value) {
  assertPlainObject(value, "Preferences");
  assertKnownKeys(value, TOP_LEVEL_KEYS, "preference");
  if (value.schema !== PREFERENCE_KEY) {
    throw new TypeError("Unsupported preference schema");
  }
  const preset = requiredString(value.preset, "preset");
  if (![...Object.keys(THEME_PRESETS), "custom"].includes(preset)) {
    throw new TypeError("preset is not supported");
  }
  if (typeof value.contrastBoost !== "boolean") {
    throw new TypeError("contrastBoost must be a boolean");
  }

  return deepFreeze({
    schema: PREFERENCE_KEY,
    preset,
    background: validateBackground(value.background),
    backgroundImage: validateBackgroundImage(value.backgroundImage),
    imageFit: oneOf(value.imageFit, ["cover", "contain", "fill"], "imageFit"),
    blurPx: boundedNumber(value.blurPx, 0, 40, "blurPx"),
    imageOpacity: boundedNumber(value.imageOpacity, 0, 1, "imageOpacity"),
    overlayColor: color(value.overlayColor, "overlayColor"),
    overlayOpacity: boundedNumber(value.overlayOpacity, 0, 1, "overlayOpacity"),
    cardOpacity: boundedNumber(value.cardOpacity, 0, 1, "cardOpacity"),
    textMode: oneOf(value.textMode, ["auto", "light", "dark"], "textMode"),
    contrastBoost: value.contrastBoost,
    accentColor: color(value.accentColor, "accentColor"),
  });
}

export function importPreferences(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_IMPORT_TEXT_LENGTH) {
    throw new TypeError("Preference import must be a bounded JSON string");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError("Preference import is not valid JSON");
  }
  return validatePreferences(parsed);
}

export function exportPreferences(value) {
  return `${JSON.stringify(validatePreferences(value), null, 2)}\n`;
}

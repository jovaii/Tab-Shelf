const FALLBACK_HUES = Object.freeze([172, 204, 226, 252, 278, 318, 348, 18, 42, 78, 112, 146]);

const HEX_COLOR = /^#[0-9a-f]{6}$/u;
const CANVAS_SIZE = 24;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedHex(color, label = "color") {
  if (typeof color !== "string" || !HEX_COLOR.test(color.toLowerCase())) {
    throw new TypeError(`${label} must be a six-digit hexadecimal color`);
  }
  return color.toLowerCase();
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (maximum === r) hue = ((g - b) / delta) % 6;
  else if (maximum === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, saturation, lightness };
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (section < 1) [r, g] = [chroma, secondary];
  else if (section < 2) [r, g] = [secondary, chroma];
  else if (section < 3) [g, b] = [chroma, secondary];
  else if (section < 4) [g, b] = [secondary, chroma];
  else if (section < 5) [r, b] = [secondary, chroma];
  else [r, b] = [chroma, secondary];
  const match = lightness - chroma / 2;
  return [r, g, b].map((channel) => Math.round((channel + match) * 255));
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function fallbackAccentForDomain(domain) {
  if (typeof domain !== "string" || domain.trim() === "") {
    throw new TypeError("domain must be a non-empty string");
  }
  const normalizedDomain = domain.trim().toLowerCase();
  let hash = 2166136261;
  for (const character of normalizedDomain) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const unsignedHash = hash >>> 0;
  const family = FALLBACK_HUES[unsignedHash % FALLBACK_HUES.length];
  const hueOffset = ((unsignedHash >>> 8) % 9 - 4) * 2;
  const saturation = [0.48, 0.54, 0.6][(unsignedHash >>> 16) % 3];
  const lightness = [0.42, 0.47, 0.52][(unsignedHash >>> 20) % 3];
  return rgbToHex(...hslToRgb((family + hueOffset + 360) % 360, saturation, lightness));
}

export function representativeAccent(pixelData, fallbackColor) {
  const fallback = normalizedHex(fallbackColor, "fallback color");
  if (!pixelData || typeof pixelData.length !== "number") return fallback;

  const buckets = new Map();
  for (let index = 0; index + 3 < pixelData.length; index += 4) {
    const red = pixelData[index];
    const green = pixelData[index + 1];
    const blue = pixelData[index + 2];
    const alpha = pixelData[index + 3];
    if (alpha < 128) continue;

    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const hsl = rgbToHsl(red, green, blue);
    if (luminance < 22 || luminance > 238 || hsl.saturation < 0.22) continue;

    const bucketKey = Math.floor(hsl.hue / 30);
    const chromaWeight = 0.65 * hsl.saturation;
    const midtoneWeight = 0.35 * (1 - Math.abs(hsl.lightness - 0.5) * 2);
    const weight = Math.max(0.05, chromaWeight + midtoneWeight) * (alpha / 255);
    const bucket = buckets.get(bucketKey) ?? { red: 0, green: 0, blue: 0, weight: 0 };
    bucket.red += red * weight;
    bucket.green += green * weight;
    bucket.blue += blue * weight;
    bucket.weight += weight;
    buckets.set(bucketKey, bucket);
  }

  const winner = [...buckets.values()].sort((left, right) => right.weight - left.weight)[0];
  if (!winner) return fallback;

  const averaged = [winner.red, winner.green, winner.blue].map((value) => value / winner.weight);
  const hsl = rgbToHsl(...averaged);
  const saturation = clamp(hsl.saturation, 0.46, 0.72);
  const lightness = clamp(hsl.lightness, 0.38, 0.58);
  return rgbToHex(...hslToRgb(hsl.hue, saturation, lightness));
}

export function extractAccentFromImage(image, fallbackColor) {
  const fallback = normalizedHex(fallbackColor, "fallback color");
  try {
    const canvas = image?.ownerDocument?.createElement("canvas");
    if (!canvas || typeof canvas.getContext !== "function") return fallback;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(image, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const pixels = context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
    return representativeAccent(pixels, fallback);
  } catch {
    return fallback;
  }
}

export function applySiteAccent(node, color) {
  if (!node?.style || typeof node.style.setProperty !== "function") {
    throw new TypeError("A style-capable card node is required");
  }
  const accent = normalizedHex(color, "site accent color");
  const values = Object.freeze({
    "--site-accent": accent,
    "--site-accent-soft": `color-mix(in srgb, ${accent} 14%, transparent)`,
    "--site-accent-border": `color-mix(in srgb, ${accent} 42%, var(--color-border-subtle))`,
    "--site-accent-text": `color-mix(in srgb, ${accent} 72%, var(--color-text-primary))`,
  });
  for (const [name, value] of Object.entries(values)) node.style.setProperty(name, value);
  return values;
}

import { validatePreferences } from "../core/preferences.mjs";

const DARK_TEXT = Object.freeze({
  primary: "#17211f",
  secondary: "#53615d",
  disabled: "#74817d",
  surface: "251 252 250",
  sunken: "#f4f6f3",
  borderSubtle: "#d5ddda",
  border: "#bbc5c1",
  separator: "#d5ddda",
});

const LIGHT_TEXT = Object.freeze({
  primary: "#f7faf9",
  secondary: "#c6d0cd",
  disabled: "#91a09b",
  surface: "12 17 20",
  sunken: "#1c272a",
  borderSubtle: "#354246",
  border: "#536267",
  separator: "#354246",
});

function hexToRgb(value) {
  const normalized = value.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
}

function channelLuminance(value) {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(value) {
  const [red, green, blue] = hexToRgb(value).map(channelLuminance);
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrast(first, second) {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function percentage(value) {
  return `${Math.round(value * 100)}%`;
}

function rgbWithAlpha(color, alpha) {
  return `rgb(${hexToRgb(color).join(" ")} / ${percentage(alpha)})`;
}

function gradientStops(stops) {
  return [...stops]
    .sort((left, right) => left.position - right.position)
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(", ");
}

function pageBackground(background) {
  if (background.kind === "solid") return background.color;
  const stops = gradientStops(background.stops);
  if (background.kind === "radial") {
    return `radial-gradient(circle at 50% 110%, ${stops})`;
  }
  return `linear-gradient(${background.angle}deg, ${stops})`;
}

function cssImage(value) {
  if (value === null) return "none";
  return `url("${value}")`;
}

function accentColors(accentColor, textMode) {
  const onAccent = contrast(accentColor, "#ffffff") >= contrast(accentColor, "#17211f")
    ? "#ffffff"
    : "#17211f";
  const mixTarget = textMode === "light" ? "white" : "black";
  return {
    "--color-accent-solid": accentColor,
    "--color-accent-solid-hover": `color-mix(in srgb, ${accentColor} 84%, ${mixTarget})`,
    "--color-text-on-accent": onAccent,
    "--color-accent-text": textMode === "light"
      ? `color-mix(in srgb, ${accentColor} 62%, white)`
      : `color-mix(in srgb, ${accentColor} 70%, black)`,
    "--color-accent-border": `color-mix(in srgb, ${accentColor} 38%, transparent)`,
    "--color-accent-bg-subtle": `color-mix(in srgb, ${accentColor} 14%, transparent)`,
    "--color-focus-ring": accentColor,
  };
}

export function readableTextMode(backgroundColor) {
  if (!/^#[a-f0-9]{6}$/iu.test(backgroundColor)) {
    throw new TypeError("A six-digit hex color is required");
  }
  return luminance(backgroundColor) > 0.34 ? "dark" : "light";
}

export function themeCssVariables(value) {
  const preferences = validatePreferences(value);
  const textMode = preferences.textMode === "auto"
    ? readableTextMode(preferences.background.color)
    : preferences.textMode;
  const palette = textMode === "light" ? LIGHT_TEXT : DARK_TEXT;
  const secondary = preferences.contrastBoost
    ? (textMode === "light" ? "#e1e8e5" : "#36433f")
    : palette.secondary;

  return {
    "--text-mode": textMode,
    "--page-background": pageBackground(preferences.background),
    "--background-image": cssImage(preferences.backgroundImage),
    "--background-image-fit": preferences.imageFit,
    "--background-image-opacity": preferences.backgroundImage === null
      ? "0"
      : String(preferences.imageOpacity),
    "--background-image-blur": `${preferences.blurPx}px`,
    "--background-overlay": rgbWithAlpha(preferences.overlayColor, preferences.overlayOpacity),
    "--card-background": `rgb(${palette.surface} / ${percentage(preferences.cardOpacity)})`,
    "--color-bg-surface": `rgb(${palette.surface})`,
    "--color-bg-raised": `rgb(${palette.surface})`,
    "--color-bg-sunken": palette.sunken,
    "--color-text-primary": palette.primary,
    "--color-text-secondary": secondary,
    "--color-text-disabled": palette.disabled,
    "--color-text-inverse": textMode === "light" ? "#17211f" : "#f7faf9",
    "--color-border-subtle": preferences.contrastBoost ? palette.border : palette.borderSubtle,
    "--color-border": palette.border,
    "--color-border-strong": secondary,
    "--color-separator": preferences.contrastBoost ? palette.border : palette.separator,
    "--color-bg-overlay": textMode === "light" ? "rgb(0 0 0 / 58%)" : "rgb(23 33 31 / 42%)",
    ...accentColors(preferences.accentColor, textMode),
  };
}

export function applyTheme(root, value) {
  if (!root?.style || typeof root.style.setProperty !== "function") {
    throw new TypeError("A styled document root is required");
  }
  const variables = themeCssVariables(value);
  for (const [name, cssValue] of Object.entries(variables)) {
    root.style.setProperty(name, cssValue);
  }
  root.dataset.textMode = variables["--text-mode"];
  root.style.colorScheme = variables["--text-mode"] === "light" ? "dark" : "light";
  root.ownerDocument
    ?.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", validatePreferences(value).background.color);
  return variables;
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREFERENCES,
  MAX_BACKGROUND_IMAGE_BYTES,
  PREFERENCE_KEY,
  THEME_PRESETS,
  exportPreferences,
  importPreferences,
  preferencesFromPreset,
  validatePreferences,
} from "../extension/core/preferences.mjs";

test("uses only the new preference schema and five authored presets", () => {
  assert.equal(PREFERENCE_KEY, "tabShelf.preferences.v1");
  assert.equal(DEFAULT_PREFERENCES.schema, PREFERENCE_KEY);
  assert.equal(DEFAULT_PREFERENCES.preset, "storm-horizon");
  assert.deepEqual(
    Object.keys(THEME_PRESETS),
    ["quiet-neutral", "mist-teal", "ice-lavender", "neon-bloom", "storm-horizon"],
  );
  assert.equal(Object.isFrozen(DEFAULT_PREFERENCES), true);
  assert.equal(Object.isFrozen(THEME_PRESETS["storm-horizon"].background.stops), true);
  assert.equal(DEFAULT_PREFERENCES, THEME_PRESETS["storm-horizon"]);
});

test("creates a detached preference object from a preset", () => {
  const first = preferencesFromPreset("mist-teal");
  const second = preferencesFromPreset("mist-teal");

  assert.notEqual(first, second);
  assert.notEqual(first.background, second.background);
  assert.equal(first.accentColor, "#159b91");
  assert.equal(first.textMode, "dark");
});

test("round-trips a valid preference document with stable formatting", () => {
  const preferences = preferencesFromPreset("ice-lavender");
  const serialized = exportPreferences(preferences);
  const restored = importPreferences(serialized);

  assert.equal(serialized.endsWith("\n"), true);
  assert.deepEqual(restored, preferences);
  assert.equal(Object.isFrozen(restored), true);
});

test("rejects another schema without returning partial settings", () => {
  assert.throws(
    () => importPreferences('{"schema":"another.preferences.v1"}'),
    /Unsupported preference schema/,
  );
});

test("rejects unknown top-level and nested keys", () => {
  assert.throws(
    () => validatePreferences({ ...preferencesFromPreset("quiet-neutral"), unexpected: true }),
    /Unknown preference key/,
  );
  const nested = structuredClone(preferencesFromPreset("quiet-neutral"));
  nested.background.unexpected = true;
  assert.throws(() => validatePreferences(nested), /Unknown background key/);
});

test("rejects unsafe prototypes", () => {
  const unsafe = Object.create({ inherited: true });
  Object.assign(unsafe, preferencesFromPreset("quiet-neutral"));

  assert.throws(() => validatePreferences(unsafe), /plain object/);
});

test("rejects invalid ranges, colors, and stop counts", () => {
  const invalidBlur = structuredClone(preferencesFromPreset("quiet-neutral"));
  invalidBlur.blurPx = 41;
  assert.throws(() => validatePreferences(invalidBlur), /blurPx/);

  const invalidColor = structuredClone(preferencesFromPreset("quiet-neutral"));
  invalidColor.accentColor = "red";
  assert.throws(() => validatePreferences(invalidColor), /accentColor/);

  const invalidStops = structuredClone(preferencesFromPreset("quiet-neutral"));
  invalidStops.background.stops = [{ color: "#000000", position: 0 }];
  assert.throws(() => validatePreferences(invalidStops), /two to six/);
});

test("orders gradient stops in the validated result", () => {
  const preferences = structuredClone(preferencesFromPreset("quiet-neutral"));
  preferences.preset = "custom";
  preferences.background.stops = [
    { color: "#ffffff", position: 100 },
    { color: "#000000", position: 0 },
  ];

  const validated = validatePreferences(preferences);

  assert.deepEqual(validated.background.stops.map((stop) => stop.position), [0, 100]);
});

test("accepts admitted local image data and rejects unsafe media", () => {
  const preferences = structuredClone(preferencesFromPreset("quiet-neutral"));
  preferences.backgroundImage = "data:image/png;base64,AA==";
  assert.equal(validatePreferences(preferences).backgroundImage, "data:image/png;base64,AA==");

  preferences.backgroundImage = "data:text/html;base64,PGgxPk5vPC9oMT4=";
  assert.throws(() => validatePreferences(preferences), /backgroundImage/);
});

test("rejects a decoded local image above the storage budget", () => {
  const preferences = structuredClone(preferencesFromPreset("quiet-neutral"));
  const encodedLength = Math.ceil((MAX_BACKGROUND_IMAGE_BYTES + 1) / 3) * 4;
  preferences.backgroundImage = `data:image/webp;base64,${"A".repeat(encodedLength)}`;

  assert.throws(() => validatePreferences(preferences), /storage budget/);
});

test("does not mutate input while validating", () => {
  const input = structuredClone(preferencesFromPreset("neon-bloom"));
  input.background.stops.reverse();
  const before = structuredClone(input);

  validatePreferences(input);

  assert.deepEqual(input, before);
});

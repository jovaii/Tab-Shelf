import assert from "node:assert/strict";
import test from "node:test";
import {
  THEME_PRESETS,
  preferencesFromPreset,
} from "../extension/core/preferences.mjs";
import {
  applyTheme,
  readableTextMode,
  themeCssVariables,
} from "../extension/ui/theme-runtime.mjs";

test("maps Mist Teal to semantic CSS variables", () => {
  const variables = themeCssVariables(THEME_PRESETS["mist-teal"]);

  assert.match(variables["--page-background"], /^linear-gradient\(148deg,/);
  assert.equal(variables["--color-accent-solid"], "#159b91");
  assert.equal(variables["--text-mode"], "dark");
  assert.equal(variables["--background-image"], "none");
  assert.equal(variables["--background-image-blur"], "0px");
});

test("maps Neon Bloom to a bottom radial glow and light text", () => {
  const variables = themeCssVariables(THEME_PRESETS["neon-bloom"]);

  assert.match(variables["--page-background"], /^radial-gradient\(circle at 50% 110%,/);
  assert.equal(variables["--text-mode"], "light");
  assert.equal(variables["--color-text-primary"], "#f7faf9");
  assert.match(variables["--card-background"], /^rgb\(12 17 20 \/ 82%\)$/);
});

test("orders gradient stops and renders a solid without a gradient", () => {
  const preferences = preferencesFromPreset("quiet-neutral");
  preferences.preset = "custom";
  preferences.background.stops = [
    { color: "#ffffff", position: 100 },
    { color: "#000000", position: 0 },
  ];
  assert.ok(
    themeCssVariables(preferences)["--page-background"].indexOf("0%")
      < themeCssVariables(preferences)["--page-background"].indexOf("100%"),
  );
  preferences.background.kind = "solid";
  preferences.background.color = "#123456";
  assert.equal(themeCssVariables(preferences)["--page-background"], "#123456");
});

test("chooses readable automatic text from the visible background", () => {
  assert.equal(readableTextMode("#f2f3ef"), "dark");
  assert.equal(readableTextMode("#10151a"), "light");
});

test("applies every variable and appearance marker to a root", () => {
  const values = new Map();
  let themeColor = "";
  const root = {
    dataset: {},
    ownerDocument: {
      querySelector: () => ({
        setAttribute: (name, value) => {
          if (name === "content") themeColor = value;
        },
      }),
    },
    style: {
      colorScheme: "",
      setProperty: (name, value) => values.set(name, value),
    },
  };

  const result = applyTheme(root, THEME_PRESETS["ice-lavender"]);

  assert.equal(root.dataset.textMode, "dark");
  assert.equal(root.style.colorScheme, "light");
  assert.equal(themeColor, "#c5deea");
  assert.equal(values.get("--color-accent-solid"), "#6e5ab5");
  assert.deepEqual(result, Object.fromEntries(values));
});

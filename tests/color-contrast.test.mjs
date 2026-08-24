import assert from "node:assert/strict";
import test from "node:test";

function relativeLuminance(hex) {
  const channels = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("default semantic text pairs exceed WCAG AA", () => {
  const pairs = [
    ["primary text", "#17211f", "#fbfcfa", 4.5],
    ["secondary text", "#53615d", "#fbfcfa", 4.5],
    ["accent button", "#fbfcfa", "#2f6f68", 4.5],
    ["destructive text", "#7d3127", "#fce9e6", 4.5],
    ["focus and links", "#245851", "#fbfcfa", 4.5],
  ];

  for (const [label, foreground, background, minimum] of pairs) {
    assert.ok(
      contrastRatio(foreground, background) >= minimum,
      `${label} must reach ${minimum}:1`,
    );
  }
});

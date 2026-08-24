import assert from "node:assert/strict";
import test from "node:test";
import {
  applySiteAccent,
  extractAccentFromImage,
  fallbackAccentForDomain,
  representativeAccent,
} from "../extension/ui/site-accent.mjs";

function pixelData(...pixels) {
  return new Uint8ClampedArray(pixels.flat());
}

test("assigns a stable, varied accent without network or storage state", () => {
  assert.equal(
    fallbackAccentForDomain("Example.COM"),
    fallbackAccentForDomain(" example.com "),
  );

  const accents = new Set([
    "chatgpt.com",
    "deepl.com",
    "fleigumzuege.ch",
    "google.com",
    "jost-transport.ch",
    "raeumprofi.ch",
    "skyumzug.ch",
    "xxxlutz.ch",
  ].map(fallbackAccentForDomain));

  assert.ok(accents.size >= 5, `expected at least 5 accents, got ${accents.size}`);
  assert.throws(() => fallbackAccentForDomain(""), /domain/i);
});

test("derives a safe representative color from vivid favicon pixels", () => {
  const fallback = "#2f7f78";
  const accent = representativeAccent(pixelData(
    [219, 50, 112, 255],
    [226, 55, 120, 255],
    [18, 18, 18, 255],
    [252, 252, 252, 255],
    [120, 120, 120, 255],
  ), fallback);

  assert.match(accent, /^#[0-9a-f]{6}$/u);
  assert.notEqual(accent, fallback);
});

test("ignores unusable favicon pixels and keeps the domain fallback", () => {
  const fallback = "#4f6fb3";
  assert.equal(representativeAccent(pixelData(
    [255, 255, 255, 255],
    [0, 0, 0, 255],
    [120, 120, 120, 255],
    [50, 100, 150, 0],
  ), fallback), fallback);
});

test("extracts only from the already-loaded image and survives a tainted canvas", () => {
  const fallback = "#5f7d3b";
  let drawCount = 0;
  const image = {
    ownerDocument: {
      createElement(tagName) {
        assert.equal(tagName, "canvas");
        return {
          getContext() {
            return {
              drawImage() { drawCount += 1; },
              getImageData() {
                return { data: pixelData([48, 124, 205, 255], [42, 118, 198, 255]) };
              },
            };
          },
        };
      },
    },
  };

  assert.notEqual(extractAccentFromImage(image, fallback), fallback);
  assert.equal(drawCount, 1);

  const taintedImage = {
    ownerDocument: {
      createElement() {
        return {
          getContext() {
            return {
              drawImage() {},
              getImageData() { throw new DOMException("Blocked", "SecurityError"); },
            };
          },
        };
      },
    },
  };
  assert.equal(extractAccentFromImage(taintedImage, fallback), fallback);
});

test("applies validated card-local semantic variables", () => {
  const properties = new Map();
  const node = {
    style: {
      setProperty(name, value) { properties.set(name, value); },
    },
  };

  const values = applySiteAccent(node, "#5F6FC0");

  assert.equal(properties.get("--site-accent"), "#5f6fc0");
  assert.equal(properties.size, 4);
  assert.deepEqual(Object.keys(values), [
    "--site-accent",
    "--site-accent-soft",
    "--site-accent-border",
    "--site-accent-text",
  ]);
  for (const value of properties.values()) assert.doesNotMatch(value, /url|var\(--site-accent\)/iu);
  assert.throws(() => applySiteAccent(node, "red; background: url(evil)"), /color/i);
});

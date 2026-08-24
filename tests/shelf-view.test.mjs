import assert from "node:assert/strict";
import test from "node:test";
import { element } from "../extension/ui/dom.mjs";
import {
  buildShelfTree,
  formatShelfDate,
  greetingForHour,
  renderShelf,
} from "../extension/ui/shelf-view.mjs";

class FakeNode {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.className = "";
    this.textContent = "";
    this.disabled = false;
    this.style = {
      properties: new Map(),
      setProperty: (name, value) => this.style.properties.set(name, value),
    };
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  click() {
    this.listeners.get("click")?.({ preventDefault() {} });
  }

  dispatch(name) {
    this.listeners.get(name)?.({ currentTarget: this, target: this });
  }
}

const fakeDocument = {
  createElement: (tagName) => new FakeNode(tagName),
};

function walk(node) {
  return [node, ...node.children.flatMap(walk)];
}

const sampleModel = {
  visibleTabCount: 3,
  duplicatePageCount: 1,
  shelfTabCount: 2,
  groups: [
    {
      key: "alpha.test",
      label: "alpha.test",
      tabs: [
        {
          id: 1,
          title: "A title with <b>markup-like text</b>",
          url: "https://alpha.test/one",
          favIconUrl: null,
          isDuplicate: true,
        },
        {
          id: 2,
          title: "Second page",
          url: "https://alpha.test/two",
          favIconUrl: "data:image/png;base64,AA==",
          isDuplicate: false,
        },
      ],
    },
    {
      key: "beta.test",
      label: "beta.test",
      tabs: [
        {
          id: 3,
          title: "Beta page",
          url: "https://beta.test",
          favIconUrl: null,
          isDuplicate: false,
        },
      ],
    },
  ],
};

test("builds every website as one structurally equal card", () => {
  const tree = buildShelfTree(sampleModel);

  assert.equal(tree.role, "card-grid");
  assert.equal(tree.children.length, 2);
  for (const card of tree.children) {
    assert.equal(card.role, "site-card");
    assert.deepEqual(
      card.children.map((child) => child.role),
      ["site-card-header", "site-card-tabs", "site-card-footer"],
    );
    assert.equal(
      card.children.flatMap((child) => child.children ?? []).some((child) => child.role === "site-card"),
      false,
    );
  }
});

test("keeps full titles as text and exposes duplicate state", () => {
  const tree = buildShelfTree(sampleModel);
  const firstTab = tree.children[0].children[1].children[0];

  assert.equal(firstTab.title, "A title with <b>markup-like text</b>");
  assert.equal(firstTab.isDuplicate, true);
  assert.equal(firstTab.id, 1);
});

test("gives every card a stable domain accent in the render model", () => {
  const tree = buildShelfTree(sampleModel);

  for (const card of tree.children) assert.match(card.accent, /^#[0-9a-f]{6}$/u);
  assert.notEqual(tree.children[0].accent, tree.children[1].accent);
});

test("renders safe DOM and emits typed actions", () => {
  const root = new FakeNode("div");
  const actions = [];

  renderShelf(fakeDocument, root, sampleModel, {
    onActivate: (tabId) => actions.push(["activate", tabId]),
    onClose: (tabId) => actions.push(["close", tabId]),
    onCloseGroup: (tabIds) => actions.push(["close-group", tabIds]),
  });

  const nodes = walk(root);
  const titleNode = nodes.find((node) => node.className === "tab-row__title");
  const cardNode = nodes.find((node) => node.className === "site-card");
  const headingNode = nodes.find((node) => node.className === "site-card__title");
  const groupCloseButtons = nodes.filter((node) => node.className === "group-close-button");
  assert.equal(titleNode.textContent, "A title with <b>markup-like text</b>");
  assert.equal(titleNode.children.length, 0);
  assert.equal(cardNode.attributes.get("aria-labelledby"), "site-alpha.test");
  assert.equal(headingNode.attributes.get("id"), "site-alpha.test");
  assert.deepEqual(
    groupCloseButtons.map((node) => node.textContent),
    ["Close both tabs", "Close tab"],
  );
  nodes.find((node) => node.dataset.action === "activate").click();
  nodes.find((node) => node.dataset.action === "close-tab").click();
  nodes.find((node) => node.dataset.action === "close-group").click();
  assert.deepEqual(actions, [
    ["activate", 1],
    ["close", 1],
    ["close-group", [1, 2]],
  ]);
});

test("applies domain accents immediately and upgrades from the first usable favicon", () => {
  const root = new FakeNode("div");
  renderShelf(fakeDocument, root, sampleModel, {
    onActivate() {},
    onClose() {},
    onCloseGroup() {},
  });

  const cards = walk(root).filter((node) => node.className === "site-card");
  assert.equal(cards.length, 2);
  assert.notEqual(
    cards[0].style.properties.get("--site-accent"),
    cards[1].style.properties.get("--site-accent"),
  );

  const initialAccent = cards[0].style.properties.get("--site-accent");
  const favicon = walk(cards[0]).find((node) => node.className === "tab-row__favicon");
  favicon.ownerDocument = {
    createElement() {
      return {
        getContext() {
          return {
            drawImage() {},
            getImageData() {
              return { data: new Uint8ClampedArray([219, 50, 112, 255]) };
            },
          };
        },
      };
    },
  };
  favicon.dispatch("load");

  assert.notEqual(cards[0].style.properties.get("--site-accent"), initialAccent);
});

test("DOM helper rejects HTML and event attributes", () => {
  assert.throws(() => element(fakeDocument, "div", { html: "<strong>unsafe</strong>" }), /Unknown element option/);
  assert.throws(() => element(fakeDocument, "button", { attributes: { onclick: "unsafe()" } }), /attribute/);
});

test("formats the greeting and date without changing with locale defaults", () => {
  assert.equal(greetingForHour(5), "Good morning");
  assert.equal(greetingForHour(13), "Good afternoon");
  assert.equal(greetingForHour(19), "Good evening");
  assert.equal(greetingForHour(1), "A quiet night");
  assert.equal(
    formatShelfDate(new Date("2026-08-24T12:00:00Z"), { timeZone: "UTC" }),
    "Monday, August 24, 2026",
  );
});

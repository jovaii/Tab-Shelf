import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAG_THRESHOLD_PX,
  createSortableController,
  insertionTarget,
} from "../extension/ui/sortable-controller.mjs";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  emit(type, event = {}) {
    const value = {
      type,
      preventDefault() {},
      stopImmediatePropagation() {},
      ...event,
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(value);
  }
}

class FakeClassList {
  constructor(node) {
    this.node = node;
    this.values = new Set();
  }

  add(...values) {
    for (const value of values) this.values.add(value);
    this.node.className = [...this.values].join(" ");
  }

  remove(...values) {
    for (const value of values) this.values.delete(value);
    this.node.className = [...this.values].join(" ");
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeNode extends FakeEventTarget {
  constructor(className = "", dataset = {}, rect = {}) {
    super();
    this.children = [];
    this.parentNode = null;
    this.dataset = { ...dataset };
    this.attributes = new Map();
    this.style = {};
    this.className = "";
    this.classList = new FakeClassList(this);
    for (const name of className.split(/\s+/u).filter(Boolean)) this.classList.add(name);
    this.rect = { top: 0, left: 0, width: 200, height: 100, ...rect };
    this.isConnected = true;
    this.captured = [];
    this.released = [];
  }

  append(...nodes) {
    for (const node of nodes) this.insertBefore(node, null);
  }

  insertBefore(node, reference) {
    node.parentNode?.removeChild(node);
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    node.parentNode = this;
    node.isConnected = this.isConnected;
    return node;
  }

  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentNode = null;
    node.isConnected = false;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return this.parentNode.children[index + 1] ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getBoundingClientRect() {
    return { ...this.rect };
  }

  setPointerCapture(pointerId) {
    this.captured.push(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.released.push(pointerId);
  }

  contains(candidate) {
    let node = candidate;
    while (node) {
      if (node === this) return true;
      node = node.parentNode;
    }
    return false;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (selector === "[data-sort-kind]" && node.dataset.sortKind) return node;
      if (selector === ".site-card" && node.classList.contains("site-card")) return node;
      if (selector === ".category-section" && node.classList.contains("category-section")) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selector === ".site-card" && child.classList.contains("site-card")) results.push(child);
        if (selector === ".category-section" && child.classList.contains("category-section")) results.push(child);
        if (selector === ".category-card-grid" && child.classList.contains("category-card-grid")) results.push(child);
        if (selector === ".sort-placeholder" && child.classList.contains("sort-placeholder")) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }
}

class FakeWindow extends FakeEventTarget {
  constructor() {
    super();
    this.innerHeight = 900;
    this.scrolls = [];
    this.frames = [];
  }

  requestAnimationFrame(callback) {
    this.frames.push(callback);
    return this.frames.length;
  }

  cancelAnimationFrame() {}

  flushFrame() {
    const frames = this.frames.splice(0);
    for (const frame of frames) frame();
  }

  scrollBy(x, y) {
    this.scrolls.push([x, y]);
  }
}

function fixture() {
  const root = new FakeNode("workspace-root", {}, {
    top: 0,
    left: 0,
    width: 440,
    height: 500,
  });
  const category = new FakeNode("category-section", { groupId: "system:other" }, {
    top: 0,
    left: 0,
    width: 440,
    height: 180,
  });
  const grid = new FakeNode("category-card-grid", {
    groupId: "system:other",
    dropKind: "card",
  }, {
    top: 0,
    left: 0,
    width: 440,
    height: 120,
  });
  const first = new FakeNode("site-card", {
    domain: "a.test",
    groupId: "system:other",
  }, { top: 0, left: 0, width: 200, height: 100 });
  const second = new FakeNode("site-card", {
    domain: "b.test",
    groupId: "system:other",
  }, { top: 0, left: 220, width: 200, height: 100 });
  const handle = new FakeNode("sort-handle", {
    sortKind: "card",
    domain: "a.test",
    groupId: "system:other",
  });
  first.append(handle);
  grid.append(first, second);
  category.append(grid);
  root.append(category);
  root.ownerDocument = {
    createElement() {
      return new FakeNode();
    },
  };
  first.ownerDocument = root.ownerDocument;
  second.ownerDocument = root.ownerDocument;
  handle.ownerDocument = root.ownerDocument;
  grid.ownerDocument = root.ownerDocument;
  category.ownerDocument = root.ownerDocument;
  return { root, category, grid, first, second, handle };
}

test("uses the approved six-pixel threshold", () => {
  assert.equal(DRAG_THRESHOLD_PX, 6);
});

test("finds a stable before-domain from card midpoints", () => {
  const target = insertionTarget([
    {
      domain: "a.test",
      groupId: "system:other",
      rect: { top: 0, left: 0, width: 200, height: 100 },
    },
    {
      domain: "b.test",
      groupId: "system:other",
      rect: { top: 0, left: 220, width: 200, height: 100 },
    },
  ], { x: 230, y: 10 });

  assert.deepEqual(target, {
    groupId: "system:other",
    beforeDomain: "b.test",
  });
});

test("returns null for invalid or unreachable targets", () => {
  assert.equal(insertionTarget([], { x: 0, y: 0 }), null);
  assert.equal(insertionTarget([{
    domain: "a.test",
    groupId: "system:other",
    rect: { top: 0, left: 0, width: 20, height: 20 },
  }], { x: 100, y: 100 }), null);
});

test("movement below the threshold never starts or commits a drag", () => {
  const { root, handle } = fixture();
  const window = new FakeWindow();
  const actions = [];
  const states = [];
  const controller = createSortableController({
    root,
    window,
    onAction: (action) => actions.push(action),
    onDragStateChange: (active) => states.push(active),
  });

  root.emit("pointerdown", {
    target: handle,
    pointerId: 1,
    button: 0,
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  });
  root.emit("pointermove", { target: handle, pointerId: 1, clientX: 14, clientY: 13 });
  root.emit("pointerup", { target: handle, pointerId: 1, clientX: 14, clientY: 13 });

  assert.equal(controller.active, false);
  assert.deepEqual(actions, []);
  assert.deepEqual(states, []);
});

test("Escape restores the source and cancels without an action", () => {
  const { root, first, handle } = fixture();
  const window = new FakeWindow();
  const actions = [];
  const states = [];
  const controller = createSortableController({
    root,
    window,
    onAction: (action) => actions.push(action),
    onDragStateChange: (active) => states.push(active),
  });

  root.emit("pointerdown", {
    target: handle,
    pointerId: 2,
    button: 0,
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  });
  root.emit("pointermove", { target: handle, pointerId: 2, clientX: 30, clientY: 20 });
  window.flushFrame();
  assert.equal(controller.active, true);
  window.emit("keydown", { key: "Escape" });

  assert.equal(controller.active, false);
  assert.equal(first.classList.contains("is-dragging"), false);
  assert.equal(root.querySelectorAll(".sort-placeholder").length, 0);
  assert.deepEqual(actions, []);
  assert.deepEqual(states, [true, false]);
});

test("pointer release emits exactly one relative move-card action", () => {
  const { root, handle } = fixture();
  const window = new FakeWindow();
  const actions = [];
  const states = [];
  createSortableController({
    root,
    window,
    onAction: (action) => actions.push(action),
    onDragStateChange: (active) => states.push(active),
  });

  root.emit("pointerdown", {
    target: handle,
    pointerId: 3,
    button: 0,
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  });
  root.emit("pointermove", { target: handle, pointerId: 3, clientX: 230, clientY: 10 });
  window.flushFrame();
  root.emit("pointerup", { target: handle, pointerId: 3, clientX: 230, clientY: 10 });
  root.emit("pointerup", { target: handle, pointerId: 3, clientX: 230, clientY: 10 });

  assert.deepEqual(actions, [{
    type: "move-card",
    domain: "a.test",
    toGroupId: "system:other",
    beforeDomain: "b.test",
    visibleDomains: ["a.test", "b.test"],
  }]);
  assert.deepEqual(states, [true, false]);
});

test("destroy cancels an active drag and removes every listener", () => {
  const { root, handle } = fixture();
  const window = new FakeWindow();
  const states = [];
  const controller = createSortableController({
    root,
    window,
    onAction() {},
    onDragStateChange: (active) => states.push(active),
  });
  root.emit("pointerdown", {
    target: handle,
    pointerId: 4,
    button: 0,
    isPrimary: true,
    clientX: 0,
    clientY: 0,
  });
  root.emit("pointermove", { target: handle, pointerId: 4, clientX: 20, clientY: 0 });
  window.flushFrame();

  controller.destroy();
  root.emit("pointerup", { target: handle, pointerId: 4, clientX: 230, clientY: 10 });

  assert.deepEqual(states, [true, false]);
  assert.equal((root.listeners.get("pointerdown") ?? []).length, 0);
  assert.equal((window.listeners.get("keydown") ?? []).length, 0);
});

test("pointercancel restores an active card without committing", () => {
  const { root, first, handle } = fixture();
  const window = new FakeWindow();
  const actions = [];
  const states = [];
  const controller = createSortableController({
    root,
    window,
    onAction: (action) => actions.push(action),
    onDragStateChange: (active) => states.push(active),
  });
  root.emit("pointerdown", {
    target: handle,
    pointerId: 5,
    button: 0,
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  });
  root.emit("pointermove", { target: handle, pointerId: 5, clientX: 30, clientY: 10 });
  window.flushFrame();
  root.emit("pointercancel", { target: handle, pointerId: 5 });

  assert.equal(controller.active, false);
  assert.equal(first.classList.contains("is-dragging"), false);
  assert.deepEqual(actions, []);
  assert.deepEqual(states, [true, false]);
});

test("category handles emit the same relative ordering action boundary", () => {
  const { root, category } = fixture();
  const second = new FakeNode("category-section", { groupId: "custom:work" }, {
    top: 200,
    left: 0,
    width: 440,
    height: 180,
  });
  const categoryHandle = new FakeNode("sort-handle", {
    sortKind: "category",
    groupId: "system:other",
  });
  category.insertBefore(categoryHandle, category.children[0]);
  root.append(second);
  const window = new FakeWindow();
  const actions = [];
  createSortableController({
    root,
    window,
    onAction: (action) => actions.push(action),
    onDragStateChange() {},
  });

  root.emit("pointerdown", {
    target: categoryHandle,
    pointerId: 6,
    button: 0,
    isPrimary: true,
    clientX: 10,
    clientY: 10,
  });
  root.emit("pointermove", {
    target: categoryHandle,
    pointerId: 6,
    clientX: 10,
    clientY: 230,
  });
  window.flushFrame();
  root.emit("pointerup", {
    target: categoryHandle,
    pointerId: 6,
    clientX: 10,
    clientY: 230,
  });

  assert.deepEqual(actions, [{
    type: "move-category",
    groupId: "system:other",
    beforeGroupId: "custom:work",
  }]);
});

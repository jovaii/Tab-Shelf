const OPTION_KEYS = new Set([
  "attributes",
  "children",
  "className",
  "dataset",
  "disabled",
  "on",
  "text",
  "type",
]);
const EVENT_NAMES = new Set(["change", "click", "input", "keydown"]);
const TAG_NAME = /^[a-z][a-z0-9-]*$/u;

function plainRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function applyAttributes(node, attributes) {
  if (attributes === undefined) return;
  plainRecord(attributes, "attributes");
  for (const [name, value] of Object.entries(attributes)) {
    if (/^on/iu.test(name) || name === "style" || name === "srcdoc") {
      throw new TypeError(`Unsafe attribute: ${name}`);
    }
    if (value === null || value === undefined) continue;
    node.setAttribute(name, value);
  }
}

function applyDataset(node, dataset) {
  if (dataset === undefined) return;
  plainRecord(dataset, "dataset");
  for (const [name, value] of Object.entries(dataset)) {
    if (!/^[a-z][a-zA-Z0-9]*$/u.test(name)) {
      throw new TypeError(`Invalid dataset key: ${name}`);
    }
    node.dataset[name] = String(value);
  }
}

function applyListeners(node, listeners) {
  if (listeners === undefined) return;
  plainRecord(listeners, "event listeners");
  for (const [name, listener] of Object.entries(listeners)) {
    if (!EVENT_NAMES.has(name) || typeof listener !== "function") {
      throw new TypeError(`Invalid event listener: ${name}`);
    }
    node.addEventListener(name, listener);
  }
}

export function element(document, tagName, options = {}) {
  if (!document || typeof document.createElement !== "function") {
    throw new TypeError("A DOM document is required");
  }
  if (typeof tagName !== "string" || !TAG_NAME.test(tagName)) {
    throw new TypeError("Invalid element name");
  }
  plainRecord(options, "element options");
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.has(key)) throw new TypeError(`Unknown element option: ${key}`);
  }

  const node = document.createElement(tagName);
  if (options.className !== undefined) node.className = String(options.className);
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type !== undefined) node.type = String(options.type);
  if (options.disabled !== undefined) node.disabled = options.disabled === true;
  applyAttributes(node, options.attributes);
  applyDataset(node, options.dataset);
  applyListeners(node, options.on);

  if (options.children !== undefined) {
    if (!Array.isArray(options.children)) throw new TypeError("children must be an array");
    node.append(...options.children);
  }
  return node;
}

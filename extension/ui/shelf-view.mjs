import { element } from "./dom.mjs";

function requireModel(model) {
  if (!model || typeof model !== "object" || !Array.isArray(model.groups)) {
    throw new TypeError("A shelf model is required");
  }
}

function requireCallbacks(callbacks) {
  for (const name of ["onActivate", "onClose", "onCloseGroup"]) {
    if (typeof callbacks?.[name] !== "function") {
      throw new TypeError(`Missing shelf callback: ${name}`);
    }
  }
}

function tabTree(tab) {
  return Object.freeze({
    role: "tab-row",
    id: tab.id,
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    isDuplicate: tab.isDuplicate === true,
  });
}

export function buildShelfTree(model) {
  requireModel(model);
  return Object.freeze({
    role: "card-grid",
    children: Object.freeze(model.groups.map((group) => {
      const tabs = Object.freeze(group.tabs.map(tabTree));
      return Object.freeze({
        role: "site-card",
        key: group.key,
        label: group.label,
        tabIds: Object.freeze(tabs.map((tab) => tab.id)),
        children: Object.freeze([
          Object.freeze({ role: "site-card-header", tabCount: tabs.length }),
          Object.freeze({ role: "site-card-tabs", children: tabs }),
          Object.freeze({ role: "site-card-footer", tabCount: tabs.length }),
        ]),
      });
    })),
  });
}

function labelForCount(count) {
  return `${count} ${count === 1 ? "tab" : "tabs"}`;
}

function closeGroupLabel(count) {
  if (count === 1) return "Close tab";
  if (count === 2) return "Close both tabs";
  return `Close all ${count} tabs`;
}

function markerText(label) {
  const value = typeof label === "string" ? label.trim() : "";
  return (value[0] ?? "•").toLocaleUpperCase("en-US");
}

function renderTab(document, tab, callbacks) {
  const marker = tab.favIconUrl
    ? element(document, "img", {
        className: "tab-row__favicon",
        attributes: {
          src: tab.favIconUrl,
          alt: "",
          width: "18",
          height: "18",
          decoding: "async",
          loading: "lazy",
        },
      })
    : element(document, "span", {
        className: "tab-row__fallback",
        text: markerText(tab.title),
        attributes: { "aria-hidden": "true" },
      });

  const title = element(document, "bdi", {
    className: "tab-row__title",
    text: tab.title,
    attributes: { title: tab.title },
  });
  const duplicate = tab.isDuplicate
    ? element(document, "span", {
        className: "tab-row__duplicate",
        text: "Duplicate",
        attributes: { title: "This page is open more than once" },
      })
    : null;
  const activate = element(document, "button", {
    className: "tab-row__activate",
    type: "button",
    dataset: { action: "activate" },
    attributes: { "aria-label": `Open ${tab.title}` },
    children: duplicate ? [title, duplicate] : [title],
    on: { click: () => callbacks.onActivate(tab.id) },
  });
  const planned = element(document, "button", {
    className: "icon-button icon-button--planned",
    type: "button",
    disabled: true,
    text: "◇",
    attributes: {
      "aria-label": "Save for later is planned",
      title: "Save for later is planned",
    },
  });
  const close = element(document, "button", {
    className: "icon-button icon-button--close",
    type: "button",
    text: "×",
    dataset: { action: "close-tab" },
    attributes: {
      "aria-label": `Close ${tab.title}`,
      title: `Close ${tab.title}`,
    },
    on: { click: () => callbacks.onClose(tab.id) },
  });

  return element(document, "li", {
    className: "tab-row",
    children: [marker, activate, planned, close],
  });
}

function renderCard(document, card, callbacks) {
  const countLabel = labelForCount(card.tabIds.length);
  const header = element(document, "header", {
    className: "site-card__header",
    children: [
      element(document, "span", {
        className: "site-card__marker",
        text: markerText(card.label),
        attributes: { "aria-hidden": "true" },
      }),
      element(document, "h3", {
        className: "site-card__title",
        attributes: { id: `site-${card.key}` },
        children: [element(document, "bdi", { text: card.label })],
      }),
      element(document, "span", {
        className: "site-card__count",
        text: countLabel,
      }),
    ],
  });
  const tabSection = card.children.find((child) => child.role === "site-card-tabs");
  const tabs = element(document, "ul", {
    className: "site-card__tabs",
    children: tabSection.children.map((tab) => renderTab(document, tab, callbacks)),
  });
  const footer = element(document, "footer", {
    className: "site-card__footer",
    children: [element(document, "button", {
      className: "group-close-button",
      type: "button",
      text: closeGroupLabel(card.tabIds.length),
      dataset: { action: "close-group" },
      on: { click: () => callbacks.onCloseGroup([...card.tabIds]) },
    })],
  });

  return element(document, "article", {
    className: "site-card",
    attributes: { "aria-labelledby": `site-${card.key}` },
    children: [header, tabs, footer],
  });
}

export function renderShelf(document, root, model, callbacks) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("A shelf root is required");
  }
  requireCallbacks(callbacks);
  const tree = buildShelfTree(model);
  if (tree.children.length === 0) {
    root.replaceChildren(element(document, "section", {
      className: "empty-state",
      attributes: { "aria-live": "polite" },
      children: [
        element(document, "p", { className: "empty-state__eyebrow", text: "Shelf clear" }),
        element(document, "h3", { text: "No web tabs are open" }),
        element(document, "p", { text: "Open a website and it will appear here by domain." }),
      ],
    }));
    return tree;
  }
  root.replaceChildren(...tree.children.map((card) => renderCard(document, card, callbacks)));
  return tree;
}

export function greetingForHour(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new TypeError("hour must be an integer from 0 through 23");
  }
  if (hour < 4) return "A quiet night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function formatShelfDate(date, { timeZone } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
    throw new TypeError("A valid date is required");
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
}

import { element } from "./dom.mjs";
import {
  applySiteAccent,
  extractAccentFromImage,
  fallbackAccentForDomain,
} from "./site-accent.mjs";

function requireModel(model) {
  if (!model || typeof model !== "object" || !Array.isArray(model.categories)) {
    throw new TypeError("An organized shelf model is required");
  }
  for (const category of model.categories) {
    if (
      !category
      || typeof category.id !== "string"
      || typeof category.name !== "string"
      || !["system", "custom"].includes(category.kind)
      || typeof category.collapsed !== "boolean"
      || !Array.isArray(category.cards)
    ) {
      throw new TypeError("An organized shelf category is invalid");
    }
  }
}

function requireCallbacks(callbacks) {
  for (const name of [
    "onActivate",
    "onClose",
    "onCloseGroup",
    "onWorkspaceAction",
    "onCreateCategory",
    "onEditCategory",
  ]) {
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

function cardTree(group) {
  const tabs = Object.freeze(group.tabs.map(tabTree));
  return Object.freeze({
    role: "site-card",
    key: group.key,
    label: group.label,
    accent: fallbackAccentForDomain(group.key),
    tabIds: Object.freeze(tabs.map((tab) => tab.id)),
    children: Object.freeze([
      Object.freeze({ role: "site-card-header", tabCount: tabs.length }),
      Object.freeze({ role: "site-card-tabs", children: tabs }),
      Object.freeze({ role: "site-card-footer", tabCount: tabs.length }),
    ]),
  });
}

export function buildShelfTree(model) {
  requireModel(model);
  return Object.freeze({
    role: "workspace",
    children: Object.freeze(model.categories.map((category) => Object.freeze({
      role: "category-section",
      id: category.id,
      name: category.name,
      kind: category.kind,
      collapsed: category.collapsed,
      cards: Object.freeze(category.cards.map(cardTree)),
    }))),
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

function renderTab(document, tab, callbacks, onFavicon) {
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

  if (marker.tagName?.toLowerCase() === "img") onFavicon?.(marker);

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

function moveCardAction(card, category, beforeDomain) {
  return {
    type: "move-card",
    domain: card.key,
    toGroupId: category.id,
    beforeDomain,
    visibleDomains: category.cards.map(({ key }) => key),
  };
}

function renderCardMoveMenu(document, card, category, categories, callbacks) {
  const index = category.cards.findIndex(({ key }) => key === card.key);
  const controls = [];
  if (index > 0) {
    controls.push(element(document, "button", {
      className: "move-menu__item",
      type: "button",
      text: "Move before previous card",
      dataset: { action: "move-card-earlier" },
      on: {
        click: () => callbacks.onWorkspaceAction(
          moveCardAction(card, category, category.cards[index - 1].key),
        ),
      },
    }));
  }
  if (index >= 0 && index < category.cards.length - 1) {
    controls.push(element(document, "button", {
      className: "move-menu__item",
      type: "button",
      text: "Move after next card",
      dataset: { action: "move-card-later" },
      on: {
        click: () => callbacks.onWorkspaceAction(
          moveCardAction(card, category, category.cards[index + 2]?.key ?? null),
        ),
      },
    }));
  }
  for (const destination of categories) {
    if (destination.id === category.id) continue;
    controls.push(element(document, "button", {
      className: "move-menu__item",
      type: "button",
      text: `Move to ${destination.name}`,
      dataset: {
        action: "move-card-to-category",
        groupId: destination.id,
      },
      on: {
        click: () => callbacks.onWorkspaceAction({
          type: "move-card",
          domain: card.key,
          toGroupId: destination.id,
          beforeDomain: null,
          visibleDomains: destination.cards.map(({ key }) => key),
        }),
      },
    }));
  }
  controls.push(element(document, "button", {
    className: "move-menu__item",
    type: "button",
    text: "New category…",
    dataset: { action: "new-category-for-card" },
    on: { click: () => callbacks.onCreateCategory(card.key) },
  }));
  const menu = element(document, "div", {
    className: "move-menu card-move-menu",
    attributes: {
      id: `move-menu-${card.key}`,
      role: "menu",
      "aria-label": `Move ${card.label}`,
    },
    children: controls,
  });
  menu.hidden = true;
  return menu;
}

function menuToggle(button, menu) {
  let open = false;
  return () => {
    open = !open;
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  };
}

function renderCard(document, card, category, categories, callbacks) {
  const countLabel = labelForCount(card.tabIds.length);
  const moveMenu = renderCardMoveMenu(document, card, category, categories, callbacks);
  let moveHandle;
  let toggleMoveMenu;
  moveHandle = element(document, "button", {
    className: "sort-handle site-card__move-handle",
    type: "button",
    text: "⠿",
    dataset: {
      action: "card-move-menu",
      sortKind: "card",
      domain: card.key,
      groupId: category.id,
    },
    attributes: {
      "aria-label": `Move ${card.label}`,
      "aria-controls": `move-menu-${card.key}`,
      "aria-expanded": "false",
      title: `Move ${card.label}`,
    },
    on: { click: () => toggleMoveMenu() },
  });
  toggleMoveMenu = menuToggle(moveHandle, moveMenu);
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
      moveHandle,
    ],
  });
  const tabSection = card.children.find((child) => child.role === "site-card-tabs");
  const faviconImages = [];
  const tabs = element(document, "ul", {
    className: "site-card__tabs",
    children: tabSection.children.map((tab) => renderTab(
      document,
      tab,
      callbacks,
      (image) => faviconImages.push(image),
    )),
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

  const article = element(document, "article", {
    className: "site-card",
    attributes: { "aria-labelledby": `site-${card.key}` },
    dataset: { domain: card.key, groupId: category.id },
    children: [header, moveMenu, tabs, footer],
  });
  applySiteAccent(article, card.accent);

  const favicon = faviconImages[0];
  if (favicon) {
    const updateAccent = () => {
      applySiteAccent(article, extractAccentFromImage(favicon, card.accent));
    };
    favicon.addEventListener("load", updateAccent, { once: true });
    if (favicon.complete && favicon.naturalWidth > 0) updateAccent();
  }
  return article;
}

function renderCategoryMoveMenu(document, category, categories, callbacks) {
  const index = categories.findIndex(({ id }) => id === category.id);
  const controls = [];
  if (index > 0) {
    controls.push(element(document, "button", {
      className: "move-menu__item",
      type: "button",
      text: "Move category up",
      dataset: { action: "move-category-earlier" },
      on: { click: () => callbacks.onWorkspaceAction({
        type: "move-category",
        groupId: category.id,
        beforeGroupId: categories[index - 1].id,
      }) },
    }));
  }
  if (index >= 0 && index < categories.length - 1) {
    controls.push(element(document, "button", {
      className: "move-menu__item",
      type: "button",
      text: "Move category down",
      dataset: { action: "move-category-later" },
      on: { click: () => callbacks.onWorkspaceAction({
        type: "move-category",
        groupId: category.id,
        beforeGroupId: categories[index + 2]?.id ?? null,
      }) },
    }));
  }
  const menu = element(document, "div", {
    className: "move-menu category-move-menu",
    attributes: {
      id: `category-move-menu-${category.id}`,
      role: "menu",
      "aria-label": `Move ${category.name}`,
    },
    children: controls,
  });
  menu.hidden = true;
  return menu;
}

function renderCategory(document, category, categories, callbacks) {
  const headingId = `category-${category.id}`;
  const moveMenu = renderCategoryMoveMenu(document, category, categories, callbacks);
  let moveHandle;
  let toggleMoveMenu;
  moveHandle = element(document, "button", {
    className: "sort-handle category-section__move-handle",
    type: "button",
    text: "⠿",
    dataset: {
      action: "category-move-menu",
      sortKind: "category",
      groupId: category.id,
    },
    attributes: {
      "aria-label": `Move ${category.name}`,
      "aria-controls": `category-move-menu-${category.id}`,
      "aria-expanded": "false",
      title: `Move ${category.name}`,
    },
    on: { click: () => toggleMoveMenu() },
  });
  toggleMoveMenu = menuToggle(moveHandle, moveMenu);
  const headerControls = [
    moveHandle,
    element(document, "button", {
      className: "category-section__collapse",
      type: "button",
      text: category.collapsed ? "Expand" : "Collapse",
      dataset: { action: "toggle-category", groupId: category.id },
      attributes: {
        "aria-expanded": category.collapsed ? "false" : "true",
        "aria-controls": `category-cards-${category.id}`,
      },
      on: { click: () => callbacks.onWorkspaceAction({
        type: "toggle-category",
        groupId: category.id,
      }) },
    }),
  ];
  if (category.kind === "custom") {
    headerControls.push(
      element(document, "button", {
        className: "category-section__action",
        type: "button",
        text: "Rename",
        dataset: { action: "rename-category", groupId: category.id },
        on: { click: () => callbacks.onEditCategory({
          id: category.id,
          name: category.name,
        }) },
      }),
      element(document, "button", {
        className: "category-section__action category-section__action--delete",
        type: "button",
        text: "Delete",
        dataset: { action: "delete-category", groupId: category.id },
        on: { click: () => callbacks.onWorkspaceAction({
          type: "delete-category",
          groupId: category.id,
        }) },
      }),
    );
  }

  const header = element(document, "header", {
    className: "category-section__header",
    children: [
      element(document, "h3", {
        className: "category-section__title",
        text: category.name,
        attributes: { id: headingId },
      }),
      element(document, "span", {
        className: "category-section__count",
        text: `${category.cards.length} ${category.cards.length === 1 ? "domain" : "domains"}`,
      }),
      ...headerControls,
      moveMenu,
    ],
  });
  const cards = category.cards.map((card) => renderCard(
    document,
    card,
    category,
    categories,
    callbacks,
  ));
  if (category.kind === "custom" && cards.length === 0) {
    cards.push(element(document, "p", {
      className: "category-empty-target",
      text: "Move a domain here",
      dataset: { groupId: category.id, dropKind: "card" },
    }));
  }
  const grid = element(document, "div", {
    className: "card-grid category-card-grid",
    dataset: { groupId: category.id, dropKind: "card" },
    attributes: {
      id: `category-cards-${category.id}`,
      ...(category.collapsed ? { hidden: "" } : {}),
    },
    children: cards,
  });

  return element(document, "section", {
    className: "category-section",
    dataset: { groupId: category.id },
    attributes: { "aria-labelledby": headingId },
    children: [header, grid],
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
  root.replaceChildren(...tree.children.map((category) => renderCategory(
    document,
    category,
    tree.children,
    callbacks,
  )));
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

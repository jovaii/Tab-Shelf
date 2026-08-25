export const DRAG_THRESHOLD_PX = 6;

const EDGE_SCROLL_PX = 32;
const EDGE_SCROLL_STEP_PX = 12;

function containsPoint(rect, point) {
  return point.x >= rect.left
    && point.x <= rect.left + rect.width
    && point.y >= rect.top
    && point.y <= rect.top + rect.height;
}

function validRecord(record) {
  return record
    && typeof record.groupId === "string"
    && record.groupId.length > 0
    && (record.domain === null || typeof record.domain === "string")
    && record.rect
    && ["top", "left", "width", "height"].every(
      (key) => Number.isFinite(record.rect[key]),
    );
}

export function insertionTarget(rectangles, point) {
  if (!Array.isArray(rectangles) || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    return null;
  }
  const records = rectangles.filter(validRecord);
  const containers = records.filter(({ domain }) => domain === null);
  const containingCard = records.find(
    ({ domain, rect }) => domain !== null && containsPoint(rect, point),
  );
  const containingContainer = containers.find(({ rect }) => containsPoint(rect, point));
  const groupId = containingContainer?.groupId ?? containingCard?.groupId;
  if (!groupId) return null;

  const cards = records
    .filter(({ domain, groupId: candidate }) => domain !== null && candidate === groupId)
    .sort((left, right) => {
      const vertical = left.rect.top - right.rect.top;
      if (Math.abs(vertical) > 4) return vertical;
      return left.rect.left - right.rect.left;
    });
  if (cards.length === 0) return { groupId, beforeDomain: null };

  const rows = [];
  for (const card of cards) {
    const row = rows.find(({ top, bottom }) => card.rect.top < bottom && top < card.rect.top + card.rect.height);
    if (row) {
      row.cards.push(card);
      row.top = Math.min(row.top, card.rect.top);
      row.bottom = Math.max(row.bottom, card.rect.top + card.rect.height);
    } else {
      rows.push({
        top: card.rect.top,
        bottom: card.rect.top + card.rect.height,
        cards: [card],
      });
    }
  }
  rows.sort((left, right) => left.top - right.top);
  for (const row of rows) row.cards.sort((left, right) => left.rect.left - right.rect.left);

  const rowIndex = rows.findIndex(({ top, bottom }) => point.y >= top && point.y <= bottom);
  const selectedIndex = rowIndex >= 0
    ? rowIndex
    : rows.findIndex(({ top, bottom }) => point.y < top + (bottom - top) / 2);
  if (selectedIndex < 0) return { groupId, beforeDomain: null };
  const selected = rows[selectedIndex];
  const before = selected.cards.find(
    ({ rect }) => point.x < rect.left + rect.width / 2,
  );
  if (before) return { groupId, beforeDomain: before.domain };
  const nextRow = rows[selectedIndex + 1];
  if (nextRow) return { groupId, beforeDomain: nextRow.cards[0].domain };
  return { groupId, beforeDomain: null };
}

function setDragStyle(node, rect, point, origin) {
  node.style.position = "fixed";
  node.style.left = `${rect.left}px`;
  node.style.top = `${rect.top}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
  node.style.zIndex = "1000";
  node.style.pointerEvents = "none";
  node.style.transform = `translate(${point.x - origin.x}px, ${point.y - origin.y}px)`;
}

function restoreStyle(node, previous) {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete node.style[name];
    else node.style[name] = value;
  }
}

function captureStyle(node) {
  return Object.fromEntries([
    "position",
    "left",
    "top",
    "width",
    "height",
    "zIndex",
    "pointerEvents",
    "transform",
  ].map((name) => [name, node.style[name]]));
}

function nodeArray(root, selector) {
  return [...root.querySelectorAll(selector)].filter((node) => node.isConnected !== false);
}

function cardDropRecords(root, source) {
  const records = [];
  for (const grid of nodeArray(root, ".category-card-grid")) {
    const groupId = grid.dataset.groupId;
    records.push({ domain: null, groupId, rect: grid.getBoundingClientRect() });
    for (const card of nodeArray(grid, ".site-card")) {
      if (card === source) continue;
      records.push({
        domain: card.dataset.domain,
        groupId,
        rect: card.getBoundingClientRect(),
      });
    }
  }
  return records;
}

function categoryDropTarget(root, source, point) {
  const sections = nodeArray(root, ".category-section").filter((section) => section !== source);
  if (sections.length === 0) return { beforeGroupId: null };
  const workspaceRect = root.getBoundingClientRect?.();
  if (workspaceRect && !containsPoint(workspaceRect, point)) return null;
  const target = sections.find((section) => {
    const rect = section.getBoundingClientRect();
    return point.y < rect.top + rect.height / 2;
  });
  return { beforeGroupId: target?.dataset.groupId ?? null };
}

function cardGrid(root, groupId) {
  return nodeArray(root, ".category-card-grid").find(
    (grid) => grid.dataset.groupId === groupId,
  ) ?? null;
}

function cardNode(grid, domain, source) {
  return nodeArray(grid, ".site-card").find(
    (card) => card !== source && card.dataset.domain === domain,
  ) ?? null;
}

function visibleDomains(grid) {
  return nodeArray(grid, ".site-card")
    .map((card) => card.dataset.domain)
    .filter((domain) => typeof domain === "string" && domain.length > 0);
}

export function createSortableController({ root, window, onAction, onDragStateChange }) {
  if (!root || typeof root.addEventListener !== "function") {
    throw new TypeError("A sortable root is required");
  }
  if (!window || typeof window.addEventListener !== "function") {
    throw new TypeError("A window is required");
  }
  if (typeof onAction !== "function" || typeof onDragStateChange !== "function") {
    throw new TypeError("Sortable callbacks are required");
  }

  let pending = null;
  let dragging = null;
  let frame = null;
  let suppressClick = false;
  let destroyed = false;

  function releaseCapture(session) {
    try {
      session.handle.releasePointerCapture?.(session.pointerId);
    } catch {
      // Pointer capture may already have been released by WebKit.
    }
  }

  function finish({ commit = false } = {}) {
    const session = dragging ?? pending;
    if (!session) return;
    pending = null;
    dragging = null;
    if (frame !== null) window.cancelAnimationFrame?.(frame);
    frame = null;
    releaseCapture(session);

    let action = null;
    if (commit && session.started && session.validTarget && session.source.isConnected !== false) {
      action = session.action;
    }
    if (session.started) {
      session.placeholder?.remove();
      session.source.classList.remove("is-dragging");
      session.handle.setAttribute?.("aria-grabbed", "false");
      restoreStyle(session.source, session.previousStyle);
      suppressClick = true;
      onDragStateChange(false);
    }
    if (action) onAction(action);
  }

  function start(session) {
    if (session.source.isConnected === false) return false;
    const placeholder = root.ownerDocument.createElement("div");
    placeholder.classList.add("sort-placeholder", `sort-placeholder--${session.kind}`);
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.width = `${session.rect.width}px`;
    placeholder.style.height = `${session.rect.height}px`;
    session.source.parentNode?.insertBefore(placeholder, session.source.nextSibling);
    session.placeholder = placeholder;
    session.previousStyle = captureStyle(session.source);
    session.source.classList.add("is-dragging");
    session.handle.setAttribute?.("aria-grabbed", "true");
    session.started = true;
    dragging = session;
    pending = null;
    setDragStyle(session.source, session.rect, session.point, session.origin);
    onDragStateChange(true);
    return true;
  }

  function positionCard(session) {
    const target = insertionTarget(
      cardDropRecords(root, session.source),
      { x: session.point.x, y: session.point.y },
    );
    if (!target) {
      session.validTarget = false;
      session.action = null;
      return;
    }
    const grid = cardGrid(root, target.groupId);
    if (!grid) {
      session.validTarget = false;
      session.action = null;
      return;
    }
    const before = target.beforeDomain
      ? cardNode(grid, target.beforeDomain, session.source)
      : null;
    grid.insertBefore(session.placeholder, before);
    session.validTarget = true;
    session.action = {
      type: "move-card",
      domain: session.domain,
      toGroupId: target.groupId,
      beforeDomain: target.beforeDomain,
      visibleDomains: visibleDomains(grid),
    };
  }

  function positionCategory(session) {
    const target = categoryDropTarget(root, session.source, {
      x: session.point.x,
      y: session.point.y,
    });
    if (!target) {
      session.validTarget = false;
      session.action = null;
      return;
    }
    const before = target.beforeGroupId
      ? nodeArray(root, ".category-section").find(
          (section) => section !== session.source
            && section.dataset.groupId === target.beforeGroupId,
        )
      : null;
    root.insertBefore(session.placeholder, before);
    session.validTarget = true;
    session.action = {
      type: "move-category",
      groupId: session.groupId,
      beforeGroupId: target.beforeGroupId,
    };
  }

  function update() {
    frame = null;
    const session = dragging;
    if (!session || session.source.isConnected === false) {
      if (session) finish();
      return;
    }
    setDragStyle(session.source, session.rect, session.point, session.origin);
    if (session.kind === "card") positionCard(session);
    else positionCategory(session);

    if (session.point.y < EDGE_SCROLL_PX) window.scrollBy?.(0, -EDGE_SCROLL_STEP_PX);
    else if (session.point.y > window.innerHeight - EDGE_SCROLL_PX) {
      window.scrollBy?.(0, EDGE_SCROLL_STEP_PX);
    }
  }

  function scheduleUpdate() {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(update);
  }

  function pointerDown(event) {
    if (destroyed || pending || dragging || event.button !== 0 || event.isPrimary === false) return;
    const handle = event.target?.closest?.("[data-sort-kind]");
    if (!handle || !root.contains(handle)) return;
    const kind = handle.dataset.sortKind;
    if (kind !== "card" && kind !== "category") return;
    const source = handle.closest(kind === "card" ? ".site-card" : ".category-section");
    if (!source) return;
    const rect = source.getBoundingClientRect();
    pending = {
      pointerId: event.pointerId,
      kind,
      handle,
      source,
      domain: handle.dataset.domain,
      groupId: handle.dataset.groupId,
      origin: { x: event.clientX, y: event.clientY },
      point: { x: event.clientX, y: event.clientY },
      rect,
      started: false,
      validTarget: false,
      action: null,
    };
    handle.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event) {
    const session = dragging ?? pending;
    if (!session || event.pointerId !== session.pointerId) return;
    session.point = { x: event.clientX, y: event.clientY };
    if (!session.started) {
      const distance = Math.hypot(
        session.point.x - session.origin.x,
        session.point.y - session.origin.y,
      );
      if (distance < DRAG_THRESHOLD_PX || !start(session)) return;
    }
    event.preventDefault?.();
    scheduleUpdate();
  }

  function pointerUp(event) {
    const session = dragging ?? pending;
    if (!session || event.pointerId !== session.pointerId) return;
    if (session.started) {
      session.point = { x: event.clientX, y: event.clientY };
      if (frame !== null) {
        window.cancelAnimationFrame?.(frame);
        frame = null;
      }
      update();
    }
    finish({ commit: session.started });
  }

  function pointerCancel(event) {
    const session = dragging ?? pending;
    if (session && event.pointerId === session.pointerId) finish();
  }

  function keyDown(event) {
    if (event.key !== "Escape" || (!dragging && !pending)) return;
    event.preventDefault?.();
    finish();
  }

  function click(event) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }

  root.addEventListener("pointerdown", pointerDown);
  root.addEventListener("pointermove", pointerMove);
  root.addEventListener("pointerup", pointerUp);
  root.addEventListener("pointercancel", pointerCancel);
  root.addEventListener("click", click, true);
  window.addEventListener("keydown", keyDown);

  return Object.freeze({
    get active() {
      return dragging !== null;
    },
    cancel() {
      finish();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      finish();
      root.removeEventListener("pointerdown", pointerDown);
      root.removeEventListener("pointermove", pointerMove);
      root.removeEventListener("pointerup", pointerUp);
      root.removeEventListener("pointercancel", pointerCancel);
      root.removeEventListener("click", click, true);
      window.removeEventListener("keydown", keyDown);
    },
  });
}

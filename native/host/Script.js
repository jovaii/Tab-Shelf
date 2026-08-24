const approvedActions = new Set([
  "open-preferences",
  "open-privacy",
  "open-support",
  "open-source",
]);

function post(action) {
  if (!approvedActions.has(action)) return;
  window.webkit.messageHandlers.controller.postMessage(action);
}

function showExtensionState(enabled, usesSettingsName) {
  const title = document.querySelector("#status-title");
  const detail = document.querySelector("#status-detail");
  const state = enabled === true ? "on" : enabled === false ? "off" : "unknown";

  document.body.dataset.extensionState = state;
  title.textContent = state === "on"
    ? "Tab Shelf is enabled"
    : state === "off"
      ? "Tab Shelf needs to be enabled"
      : "Safari status is unavailable";
  detail.textContent = state === "on"
    ? "Open a new Safari tab to use your shelf."
    : state === "off"
      ? `Enable Tab Shelf in Safari ${usesSettingsName ? "Settings" : "Preferences"} → Extensions.`
      : "Open Safari Settings to check whether Tab Shelf is enabled.";
}

document.querySelector("#open-preferences").addEventListener("click", () => post("open-preferences"));
for (const button of document.querySelectorAll("[data-action]")) {
  button.addEventListener("click", () => post(button.dataset.action));
}

window.showExtensionState = showExtensionState;

import { createSafariGateway } from "./platform/safari-gateway.mjs";

const count = document.querySelector("#web-tab-count");
const status = document.querySelector("#popup-status");
const openShelf = document.querySelector("#open-shelf");
const openSettings = document.querySelector("#open-settings");

function isWebTab(tab) {
  try {
    const protocol = new URL(tab?.url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function setStatus(message = "") {
  status.textContent = message;
}

async function openWith(operation) {
  setStatus();
  try {
    await operation();
    window.close();
  } catch {
    setStatus("Safari could not open that page.");
  }
}

async function start() {
  let gateway;
  try {
    gateway = createSafariGateway(globalThis.browser);
    const tabs = await gateway.listTabs();
    count.textContent = String(tabs.filter(isWebTab).length);
  } catch {
    count.textContent = "—";
    setStatus("Safari tab access is unavailable.");
    openShelf.disabled = true;
    openSettings.disabled = true;
    return;
  }

  openShelf.addEventListener("click", () => openWith(() => gateway.openShelf()));
  openSettings.addEventListener("click", () => openWith(() => gateway.openSettings()));
}

start();

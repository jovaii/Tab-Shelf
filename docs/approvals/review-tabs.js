const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

function selectView(selectedTab) {
  tabs.forEach((tab) => {
    const selected = tab === selectedTab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });

  panels.forEach((panel) => {
    panel.hidden = panel.getAttribute("aria-labelledby") !== selectedTab.id;
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectView(tab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = tabs[(index + direction + tabs.length) % tabs.length];
    selectView(nextTab);
    nextTab.focus();
  });
});

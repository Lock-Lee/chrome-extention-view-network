// Create a panel in Chrome DevTools
chrome.devtools.panels.create(
  "Net Watcher", // Title
  "icons/icon16.png", // Icon
  "panel.html", // HTML page for the panel
  function (panel) {
    // Panel created
  }
);

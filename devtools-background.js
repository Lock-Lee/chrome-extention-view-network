// This file helps to create a connection between DevTools and the background page
chrome.runtime.onConnect.addListener(function (port) {
  // Check if the connection is from our devtools panel
  if (port.name === "devtools-panel") {
    // Listen for messages from the devtools panel
    port.onMessage.addListener(function (message) {
      // Handle messages from DevTools here
      if (message.action === "getNetworkRequests") {
        // Send network requests to the devtools panel
        chrome.runtime.sendMessage(
          {
            action: "getNetworkRequests",
          },
          (response) => {
            if (response && response.requests) {
              port.postMessage({
                action: "networkRequestsUpdate",
                requests: response.requests,
              });
            }
          }
        );
      }
    });
  }
});

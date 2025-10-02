// Similar to popup.js but with DevTools specific integrations
let networkRequests = [];
let selectedRequestId = null;

// Initialize when the panel is loaded
document.addEventListener("DOMContentLoaded", function () {
  initTabs();
  initButtons();
  setShortcutDisplay();

  // Connect to the background page
  const backgroundPageConnection = chrome.runtime.connect({
    name: "devtools-panel",
  });

  // Request network data from background page
  backgroundPageConnection.postMessage({
    action: "getNetworkRequests",
    tabId: chrome.devtools.inspectedWindow.tabId,
  });

  // Listen for updates from background page
  backgroundPageConnection.onMessage.addListener((message) => {
    if (message.action === "networkRequestsUpdate") {
      networkRequests = message.requests;
      renderRequestsTable(networkRequests);
    }
  });

  // Set the shortcut display based on operating system
  function setShortcutDisplay() {
    const shortcutDisplay = document.getElementById("shortcut-display");
    if (!shortcutDisplay) return;

    // Detect if user is on macOS
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

    // Display appropriate shortcut
    shortcutDisplay.textContent = isMac ? "Shift+Command+M" : "Ctrl+Shift+M";
  }

  // Request initial data
  chrome.runtime.sendMessage({ action: "getNetworkRequests" }, (response) => {
    if (response && response.requests) {
      networkRequests = response.requests;
      renderRequestsTable(networkRequests);
    }
  });
});

// Initialize tab functionality
function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.dataset.tab;

      // Update active tab button
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      // Show corresponding tab content
      tabContents.forEach((content) => {
        content.classList.remove("active");
        if (content.id === `${tabName}-tab`) {
          content.classList.add("active");
        }
      });
    });
  });
}

// Initialize button actions
function initButtons() {
  // Export JSON button
  document.getElementById("export-json").addEventListener("click", () => {
    exportAsJson();
  });

  // Clear data button
  document.getElementById("clear-data").addEventListener("click", () => {
    clearNetworkData();
  });

  // Copy buttons
  document.querySelectorAll(".copy-button").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      copyToClipboard(document.getElementById(targetId).textContent);
    });
  });

  // Copy cURL command
  document.getElementById("copy-curl").addEventListener("click", () => {
    copyCurlCommand();
  });

  // Filter input
  document.getElementById("filter").addEventListener("input", (e) => {
    applyFilters();
  });

  // Method filter
  document.getElementById("method-filter").addEventListener("change", () => {
    applyFilters();
  });

  // Type filter
  document.getElementById("type-filter").addEventListener("change", () => {
    applyFilters();
  });
}

// Render the requests table
function renderRequestsTable(requests) {
  const tbody = document.getElementById("requests-body");
  tbody.innerHTML = "";

  requests.forEach((request) => {
    const row = document.createElement("tr");
    row.dataset.id = request.id;
    row.addEventListener("click", () => selectRequest(request.id));

    // Determine status class
    let statusClass = "";
    if (request.status) {
      const statusFirstDigit = Math.floor(request.status / 100);
      statusClass = `status-${statusFirstDigit}xx`;
    }

    // Determine method class
    const methodClass = `method-${request.method.toLowerCase()}`;

    row.innerHTML = `
      <td><span class="${methodClass}">${request.method}</span></td>
      <td>${shortenUrl(request.url)}</td>
      <td>${formatSize(request.size || 0)}</td>
      <td>${request.time ? request.time + " ms" : "-"}</td>
      <td><span class="${statusClass}">${request.status || "-"}</span></td>
    `;

    tbody.appendChild(row);
  });

  // If there was a selected request, keep it selected
  if (selectedRequestId) {
    selectRequest(selectedRequestId);
  }
}

// Handle request selection
function selectRequest(id) {
  // Update selected row in table
  document.querySelectorAll("#requests-body tr").forEach((row) => {
    row.classList.remove("selected");
    if (row.dataset.id === id) {
      row.classList.add("selected");
    }
  });

  // Find the selected request
  const request = networkRequests.find((req) => req.id === id);
  if (!request) return;

  selectedRequestId = id;

  // Show details in the details tab
  document.getElementById("general-details").innerHTML = `
    <p><strong>URL:</strong> ${request.url}</p>
    <p><strong>Method:</strong> ${request.method}</p>
    <p><strong>Type:</strong> ${request.type || "unknown"}</p>
    <p><strong>Status:</strong> ${request.status || "-"}</p>
    <p><strong>Time:</strong> ${request.time ? request.time + " ms" : "-"}</p>
    <p><strong>Size:</strong> ${formatSize(request.size || 0)}</p>
  `;

  // Display request headers
  document.getElementById("request-headers").textContent = formatHeaders(
    request.requestHeaders
  );

  // Display request body
  document.getElementById("request-body").textContent = formatBody(
    request.requestBody
  );

  // Display response headers
  document.getElementById("response-headers").textContent = formatHeaders(
    request.responseHeaders
  );

  // Display response body preview
  document.getElementById("response-body").textContent = formatBody(
    request.responseBody
  );

  // Switch to details tab
  document.querySelector('.tab-button[data-tab="details"]').click();
}

// Export data as JSON
function exportAsJson() {
  const dataStr = JSON.stringify(networkRequests, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `network-requests-${new Date().toISOString()}.json`;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Clear all network data
function clearNetworkData() {
  chrome.runtime.sendMessage({ action: "clearNetworkRequests" }, () => {
    networkRequests = [];
    renderRequestsTable(networkRequests);
    selectedRequestId = null;

    // Clear details
    document.getElementById("general-details").innerHTML = "";
    document.getElementById("request-headers").textContent = "";
    document.getElementById("request-body").textContent = "";
    document.getElementById("response-headers").textContent = "";
    document.getElementById("response-body").textContent = "";
  });
}

// Filter requests based on search term
// Apply all filters (text and method)
function applyFilters() {
  const searchTerm = document.getElementById("filter").value;
  const methodFilter = document.getElementById("method-filter").value;
  const typeFilter = document.getElementById("type-filter").value;

  let filtered = [...networkRequests];

  // Apply text filter if provided
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(
      (req) =>
        req.url.toLowerCase().includes(term) ||
        req.method.toLowerCase().includes(term) ||
        (req.status && req.status.toString().includes(term))
    );
  }

  // Apply method filter if provided
  if (methodFilter) {
    if (methodFilter === "OTHER") {
      // Filter for uncommon methods not in the standard list
      const standardMethods = [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS",
        "HEAD",
        "PATCH",
        "CONNECT",
        "TRACE",
        "FETCH",
      ];
      filtered = filtered.filter(
        (req) => !standardMethods.includes(req.method)
      );
    } else {
      filtered = filtered.filter((req) => req.method === methodFilter);
    }
  }

  // Apply type filter if provided
  if (typeFilter) {
    if (typeFilter === "fetch") {
      // Fetch/XHR requests are typically of type 'xmlhttprequest' or have specific headers
      filtered = filtered.filter((req) => {
        const isXHR = req.type === "xmlhttprequest";
        const isFetch = req.type === "fetch";
        const hasXHRHeader =
          req.requestHeaders &&
          (req.requestHeaders["X-Requested-With"] === "XMLHttpRequest" ||
            req.requestHeaders["Accept"] === "application/json");

        return isXHR || isFetch || hasXHRHeader;
      });
    } else if (typeFilter === "other") {
      // Filter for request types that don't match the common ones
      const standardTypes = [
        "xmlhttprequest",
        "fetch",
        "script",
        "stylesheet",
        "image",
        "font",
        "media",
      ];
      filtered = filtered.filter((req) => !standardTypes.includes(req.type));
    } else {
      // Filter by the specific type
      filtered = filtered.filter((req) => req.type === typeFilter);
    }
  }

  renderRequestsTable(filtered);
}

// Filter requests based on search term (legacy function kept for compatibility)
function filterRequests(searchTerm) {
  document.getElementById("filter").value = searchTerm;
  applyFilters();
}

// Generate and copy cURL command
function copyCurlCommand() {
  const request = networkRequests.find((req) => req.id === selectedRequestId);
  if (!request) return;

  let curlCmd = `curl -X ${request.method} '${request.url}'`;

  // Add headers
  if (request.requestHeaders) {
    for (const [key, value] of Object.entries(request.requestHeaders)) {
      // Skip certain headers that curl adds automatically
      if (!["host", "content-length"].includes(key.toLowerCase())) {
        curlCmd += ` \\\n  -H '${key}: ${value}'`;
      }
    }
  }

  // Add request body
  if (request.requestBody) {
    let bodyStr;
    try {
      // If it's JSON, format it properly
      const bodyObj = JSON.parse(request.requestBody);
      bodyStr = JSON.stringify(bodyObj);
      curlCmd += ` \\\n  -d '${bodyStr}'`;
    } catch (e) {
      // Not JSON, add as is
      curlCmd += ` \\\n  -d '${request.requestBody}'`;
    }
  }

  copyToClipboard(curlCmd);
}

// Utility: Copy text to clipboard
function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      // Show success feedback
      showToast("Copied to clipboard");
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
    });
}

// Show a toast notification
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  }, 10);
}

// Utility: Format size in bytes to readable format
function formatSize(bytes) {
  if (bytes === 0) return "0 B";

  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  if (i === 0) return bytes + " " + sizes[i];

  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
}

// Utility: Format headers object to string
function formatHeaders(headers) {
  if (!headers || Object.keys(headers).length === 0) {
    return "No headers";
  }

  let result = "";
  for (const [key, value] of Object.entries(headers)) {
    result += `${key}: ${value}\n`;
  }

  return result;
}

// Utility: Format request/response body
function formatBody(body) {
  if (!body) return "No data";

  try {
    // If it's JSON, format it nicely
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Return as is if not valid JSON
    return body;
  }
}

// Utility: Shorten URL for display
function shortenUrl(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // Return just the pathname if it's not too long
    if (path.length <= 40) {
      return path || "/";
    }

    // Otherwise, truncate the middle
    return path.substring(0, 20) + "..." + path.substring(path.length - 20);
  } catch (e) {
    // If invalid URL, return as is or truncate
    return url.length <= 40 ? url : url.substring(0, 37) + "...";
  }
}

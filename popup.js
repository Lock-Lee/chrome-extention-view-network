// =============================
// popup.js (fixed, full file)
// =============================

// Global state
let networkRequests = []; // [{ id, url, method, status, time, size, type, requestHeaders, requestBody, responseHeaders, responseBody }]
let selectedRequestId = null;

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initButtons();
  setShortcutDisplay();
  loadNetworkData();
  showWelcomeImage();
});

// Show welcome image when popup opens
function showWelcomeImage() {
  const welcomeContainer = document.getElementById("welcome-container");

  // Show welcome image for 2 seconds then fade out
  setTimeout(() => {
    if (welcomeContainer) {
      welcomeContainer.style.transition = "opacity 0.5s ease";
      welcomeContainer.style.opacity = "0";

      // Remove from DOM after fade out
      setTimeout(() => {
        welcomeContainer.style.display = "none";
      }, 500);
    }
  }, 2000);
}

// ---------- UI: Tabs ----------
function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.dataset.tab;

      tabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      tabContents.forEach((content) => {
        content.classList.remove("active");
        if (content.id === `${tabName}-tab`) content.classList.add("active");
      });
    });
  });
}

// ---------- UI: Buttons & Inputs ----------
function initButtons() {
  const exportBtn = document.getElementById("export-json");
  const clearBtn = document.getElementById("clear-data");
  const filterInput = document.getElementById("filter");
  const methodFilter = document.getElementById("method-filter");
  const typeFilter = document.getElementById("type-filter");
  const copyCurlBtn = document.getElementById("copy-curl");

  if (exportBtn) exportBtn.addEventListener("click", exportAsJson);
  if (clearBtn) clearBtn.addEventListener("click", clearNetworkData);
  if (copyCurlBtn) copyCurlBtn.addEventListener("click", copyCurlCommand);

  // Copy buttons with data-target attribute
  document.querySelectorAll(".copy-button").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      const el = document.getElementById(targetId);
      if (!el) return;
      copyToClipboard(el.textContent || "");
    });
  });

  // Filters
  if (filterInput) filterInput.addEventListener("input", applyFilters);
  if (methodFilter) methodFilter.addEventListener("change", applyFilters);
  if (typeFilter) typeFilter.addEventListener("change", applyFilters);
}

// ---------- Keyboard shortcut hint ----------
function setShortcutDisplay() {
  const shortcutDisplay = document.getElementById("shortcut-display");
  if (!shortcutDisplay) return;
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  shortcutDisplay.textContent = isMac ? "Shift+Command+M" : "Ctrl+Shift+M";
}

// ---------- Data: load from background ----------
function loadNetworkData() {
  chrome.runtime.sendMessage({ action: "getNetworkRequests" }, (response) => {
    if (response && Array.isArray(response.requests)) {
      networkRequests = response.requests;
      renderRequestsTable(networkRequests);
    } else {
      // fallback if background ไม่ส่งอะไรกลับ
      networkRequests = [];
      renderRequestsTable(networkRequests);
    }
  });
}

// ---------- Render: Table ----------
function renderRequestsTable(requests) {
  const tbody = document.getElementById("requests-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  requests.forEach((request) => {
    const tr = document.createElement("tr");
    tr.dataset.id = request.id;

    // CSS class ตาม method/status
    const statusClass = request.status
      ? `status-${Math.floor(request.status / 100)}xx`
      : "";
    const methodClass = request.method
      ? `method-${String(request.method).toLowerCase()}`
      : "";

    tr.innerHTML = `
      <td><span class="${methodClass}">${escapeHtml(
      request.method || ""
    )}</span></td>
      <td title="${escapeHtml(request.url || "")}">${escapeHtml(
      shortenUrl(request.url || "")
    )}</td>
      <td>${formatSize(request.size || 0)}</td>
      <td>${request.time ? `${request.time} ms` : "-"}</td>
      <td><span class="${statusClass}">${request.status ?? "-"}</span></td>
    `;

    tr.addEventListener("click", () => selectRequest(request.id));
    tbody.appendChild(tr);
  });

  // keep selection
  if (selectedRequestId) selectRequest(selectedRequestId);
}

// ---------- Selection & detail panel ----------
function selectRequest(id) {
  const rows = document.querySelectorAll("#requests-body tr");
  rows.forEach((r) => {
    r.classList.toggle("selected", r.dataset.id === String(id));
  });

  const req = networkRequests.find((r) => String(r.id) === String(id));
  if (!req) return;
  selectedRequestId = String(id);

  // General
  const general = document.getElementById("general-details");
  if (general) {
    general.innerHTML = `
      <p><strong>URL:</strong> ${escapeHtml(req.url || "")}</p>
      <p><strong>Method:</strong> ${escapeHtml(req.method || "")}</p>
      <p><strong>Type:</strong> ${escapeHtml(req.type || "unknown")}</p>
      <p><strong>Status:</strong> ${req.status ?? "-"}</p>
      <p><strong>Time:</strong> ${req.time ? `${req.time} ms` : "-"}</p>
      <p><strong>Size:</strong> ${formatSize(req.size || 0)}</p>
    `;
  }

  // Headers & bodies
  setText("request-headers", formatHeaders(req.requestHeaders));
  setText("request-body", formatBody(req.requestBody));
  setText("response-headers", formatHeaders(req.responseHeaders));
  setText("response-body", formatBody(req.responseBody));

  // switch to details tab
  const detailsTabBtn = document.querySelector(
    '.tab-button[data-tab="details"]'
  );
  if (detailsTabBtn) detailsTabBtn.click();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ---------- Export / Clear ----------
function exportAsJson() {
  const dataStr = JSON.stringify(networkRequests, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `network-requests-${new Date().toISOString()}.json`;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function clearNetworkData() {
  chrome.runtime.sendMessage({ action: "clearNetworkRequests" }, () => {
    networkRequests = [];
    selectedRequestId = null;
    renderRequestsTable(networkRequests);

    // clear detail panel
    setText("request-headers", "");
    setText("request-body", "");
    setText("response-headers", "");
    setText("response-body", "");
    const general = document.getElementById("general-details");
    if (general) general.innerHTML = "";
  });
}

// ---------- Filters ----------
function applyFilters() {
  const searchEl = document.getElementById("filter");
  const methodEl = document.getElementById("method-filter");
  const typeEl = document.getElementById("type-filter");

  const searchTerm = (searchEl?.value || "").toLowerCase().trim();
  const methodFilter = methodEl?.value || "";
  const typeFilter = typeEl?.value || "";

  let filtered = [...networkRequests];

  // text filter
  if (searchTerm) {
    filtered = filtered.filter((req) => {
      const inUrl = (req.url || "").toLowerCase().includes(searchTerm);
      const inMethod = (req.method || "").toLowerCase().includes(searchTerm);
      const inStatus = req.status
        ? String(req.status).includes(searchTerm)
        : false;
      return inUrl || inMethod || inStatus;
    });
  }

  // method filter
  if (methodFilter) {
    if (methodFilter === "OTHER") {
      const standard = [
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
        (r) => !standard.includes(String(r.method).toUpperCase())
      );
    } else {
      filtered = filtered.filter(
        (r) => String(r.method).toUpperCase() === methodFilter
      );
    }
  }

  // type filter
  if (typeFilter) {
    if (typeFilter === "fetch") {
      filtered = filtered.filter((r) => {
        const t = String(r.type || "").toLowerCase();
        const isXHR = t === "xmlhttprequest";
        const isFetch = t === "fetch";
        const hdrs = normalizeHeaderObj(r.requestHeaders);
        const hasXHRHeader =
          hdrs["x-requested-with"] === "XMLHttpRequest" ||
          hdrs["accept"] === "application/json";
        return isXHR || isFetch || hasXHRHeader;
      });
    } else if (typeFilter === "other") {
      const standardTypes = [
        "xmlhttprequest",
        "fetch",
        "script",
        "stylesheet",
        "image",
        "font",
        "media",
      ];
      filtered = filtered.filter(
        (r) => !standardTypes.includes(String(r.type || "").toLowerCase())
      );
    } else {
      filtered = filtered.filter(
        (r) => String(r.type || "").toLowerCase() === typeFilter
      );
    }
  }

  renderRequestsTable(filtered);
}

// ---------- Copy cURL ----------
function copyCurlCommand() {
  const req = networkRequests.find(
    (r) => String(r.id) === String(selectedRequestId)
  );
  if (!req) return;

  let cmd = `curl -X ${req.method || "GET"} '${req.url || ""}'`;

  // headers
  const hdrs = req.requestHeaders || {};
  Object.entries(hdrs).forEach(([k, v]) => {
    if (!["host", "content-length"].includes(String(k).toLowerCase())) {
      cmd += ` \\\n  -H '${k}: ${v}'`;
    }
  });

  // body
  if (req.requestBody) {
    let bodyStr = String(req.requestBody);
    try {
      const asObj =
        typeof req.requestBody === "string"
          ? JSON.parse(req.requestBody)
          : req.requestBody;
      bodyStr = JSON.stringify(asObj);
    } catch (_) {
      /* keep as raw */
    }
    cmd += ` \\\n  -d '${bodyStr.replace(/'/g, "'\\''")}'`;
  }

  copyToClipboard(cmd);
}

// ---------- Utils ----------
function copyToClipboard(text) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => console.log("Copied to clipboard"))
    .catch((err) => console.error("Copy failed:", err));
}

function formatSize(bytes) {
  if (!bytes || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return i === 0
    ? `${bytes} ${units[i]}`
    : `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatHeaders(headers) {
  if (!headers || Object.keys(headers).length === 0) return "No headers";
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function formatBody(body) {
  if (!body) return "No data";
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(body);
  }
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname || "/";
    if (path.length <= 40) return path;
    return path.slice(0, 20) + "..." + path.slice(-20);
  } catch {
    return url.length <= 40 ? url : url.slice(0, 37) + "...";
  }
}

function normalizeHeaderObj(headers) {
  const out = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers))
    out[String(k).toLowerCase()] = v;
  return out;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

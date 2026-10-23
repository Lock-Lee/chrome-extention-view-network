// View Network — background service worker.
// Captures requests with chrome.webRequest, keeps them in chrome.storage.session
// (so they survive the worker being suspended), and pushes live updates to any
// open popup through a long-lived port.

import { decodeRequestBody, getHeader, headersToObject } from "./lib.js";

const MAX_REQUESTS = 1000;
const FILTER = { urls: ["<all_urls>"] };

/** requestId -> record (Map keeps insertion order = chronological) */
let requests = new Map();
let recording = true;
let counter = 0;
const ports = new Set();

// ---------- persistence ----------

const ready = (async () => {
  try {
    const saved = await chrome.storage.session.get(["requests", "recording", "counter"]);
    if (Array.isArray(saved.requests)) {
      requests = new Map(saved.requests.map((r) => [r.requestId, r]));
    }
    if (typeof saved.recording === "boolean") recording = saved.recording;
    if (typeof saved.counter === "number") counter = saved.counter;
  } catch (e) {
    console.warn("View Network: could not restore session data", e);
  }
})();

let saveQueued = false;
let pushTimer = null;

function changed() {
  // Save on the next tick (batched): Chrome may stop an idle worker at any time,
  // so a long debounce would lose the last requests.
  if (!saveQueued) {
    saveQueued = true;
    Promise.resolve().then(() => {
      saveQueued = false;
      chrome.storage.session
        .set({ requests: [...requests.values()], recording, counter })
        .catch((e) => console.warn("View Network: save failed", e));
    });
  }
  if (!pushTimer && ports.size) {
    pushTimer = setTimeout(() => {
      pushTimer = null;
      broadcast();
    }, 200);
  }
}

function snapshot() {
  return { type: "state", recording, requests: [...requests.values()] };
}

function broadcast() {
  const msg = snapshot();
  for (const port of ports) {
    try {
      port.postMessage(msg);
    } catch {
      ports.delete(port);
    }
  }
}

function trim() {
  while (requests.size > MAX_REQUESTS) {
    requests.delete(requests.keys().next().value);
  }
}

// ---------- capture ----------
// Listeners are registered synchronously at top level (required for MV3 workers).

chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    ready.then(() => {
      if (!recording) return;
      // A new page load in a tab starts a fresh log for that tab, like DevTools.
      if (d.type === "main_frame" && d.tabId >= 0) {
        for (const [id, r] of requests) if (r.tabId === d.tabId) requests.delete(id);
      }
      const existing = requests.get(d.requestId);
      if (existing) {
        // Redirect: same requestId, new URL. Keep the hop and start a new record.
        requests.delete(d.requestId);
        const hopId = `${d.requestId}:${counter}`;
        requests.set(hopId, {
          ...existing,
          requestId: hopId,
          time: existing.time ?? Math.round(d.timeStamp - existing.startTime),
        });
      }
      requests.set(d.requestId, {
        id: `r${counter++}`,
        requestId: d.requestId,
        tabId: d.tabId,
        url: d.url,
        method: d.method,
        type: d.type,
        startTime: d.timeStamp,
        status: null,
        statusText: "",
        time: null,
        size: null,
        error: null,
        fromCache: false,
        requestHeaders: {},
        requestBody: decodeRequestBody(d.requestBody),
        responseHeaders: {},
      });
      trim();
      changed();
    });
  },
  FILTER,
  ["requestBody"]
);

function update(requestId, fn) {
  ready.then(() => {
    const rec = requests.get(requestId);
    if (!rec) return;
    fn(rec);
    changed();
  });
}

chrome.webRequest.onSendHeaders.addListener(
  (d) => update(d.requestId, (r) => (r.requestHeaders = headersToObject(d.requestHeaders))),
  FILTER,
  ["requestHeaders", "extraHeaders"]
);

chrome.webRequest.onHeadersReceived.addListener(
  (d) =>
    update(d.requestId, (r) => {
      r.status = d.statusCode;
      r.statusText = (d.statusLine || "").replace(/^HTTP\/[\d.]+\s+\d+\s*/, "");
      r.responseHeaders = headersToObject(d.responseHeaders);
      const len = getHeader(r.responseHeaders, "content-length");
      if (len != null) r.size = parseInt(len, 10);
    }),
  FILTER,
  ["responseHeaders", "extraHeaders"]
);

chrome.webRequest.onCompleted.addListener(
  (d) =>
    update(d.requestId, (r) => {
      r.status = d.statusCode;
      r.fromCache = d.fromCache;
      r.ip = d.ip;
      r.time = Math.round(d.timeStamp - r.startTime);
    }),
  FILTER
);

chrome.webRequest.onErrorOccurred.addListener(
  (d) =>
    update(d.requestId, (r) => {
      r.error = d.error.replace(/^net::/, "");
      r.status = r.status || 0;
      r.time = Math.round(d.timeStamp - r.startTime);
    }),
  FILTER
);

chrome.tabs.onRemoved.addListener((tabId) =>
  ready.then(() => {
    let removed = false;
    for (const [id, r] of requests) {
      if (r.tabId === tabId) {
        requests.delete(id);
        removed = true;
      }
    }
    if (removed) changed();
  })
);

// ---------- UI connection ----------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ui") return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(async (msg) => {
    await ready;
    if (msg.type === "hello") {
      port.postMessage(snapshot());
    } else if (msg.type === "clear") {
      if (msg.tabId == null) {
        requests.clear();
      } else {
        for (const [id, r] of requests) if (r.tabId === msg.tabId) requests.delete(id);
      }
      changed();
      broadcast();
    } else if (msg.type === "setRecording") {
      recording = Boolean(msg.value);
      changed();
      broadcast();
    }
  });
});

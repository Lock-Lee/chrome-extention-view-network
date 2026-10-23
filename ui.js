// Shared UI for the toolbar popup and the DevTools panel.
//   popup  -> data comes from the background worker (works without DevTools)
//   panel  -> data comes from chrome.devtools.network (adds response bodies)

import {
  applyChip, formatSize, formatTime, isError, isPending, matchesQuery,
  prettyBody, splitUrl, toCurl, toFetch, toHAR,
} from "./lib.js";

const VERSION = chrome.runtime.getManifest().version;
const params = new URLSearchParams(location.search);
const IS_PANEL = document.body.dataset.mode === "panel";

const state = {
  chip: "all",
  query: "",
  allTabs: false,
  tabId: null,
  expanded: null,
};

// ---------- tiny DOM helper (always textContent, never innerHTML) ----------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const $ = (sel) => document.querySelector(sel);

// ---------- data sources ----------

function backgroundSource(onChange) {
  let records = [];
  let recording = true;
  let port;
  const connect = () => {
    port = chrome.runtime.connect({ name: "ui" });
    port.onMessage.addListener((msg) => {
      if (msg.type !== "state") return;
      records = msg.requests;
      recording = msg.recording;
      onChange();
    });
    // The worker may be restarted by Chrome; reconnect transparently.
    port.onDisconnect.addListener(() => setTimeout(connect, 300));
    port.postMessage({ type: "hello" });
  };
  connect();
  return {
    scoped: true,
    list: () => records,
    get recording() { return recording; },
    setRecording: (value) => port.postMessage({ type: "setRecording", value }),
    clear: (tabId) => port.postMessage({ type: "clear", tabId }),
    reload: (tabId) => chrome.tabs.reload(tabId),
  };
}

function devtoolsSource(onChange) {
  const net = chrome.devtools.network;
  let records = [];
  let recording = true;
  let n = 0;

  const toObj = (arr) => Object.fromEntries((arr || []).map((x) => [x.name, x.value]));
  const fromHar = (e) => ({
    id: `d${n++}`,
    url: e.request.url,
    method: e.request.method,
    type: e._resourceType || "other",
    startTime: Date.parse(e.startedDateTime),
    status: e.response.status || (e.response._error ? 0 : null),
    statusText: e.response.statusText,
    error: e.response._error ? String(e.response._error).replace(/^net::/, "") : null,
    time: Math.round(e.time),
    size: e.response._transferSize ?? (e.response.bodySize > 0 ? e.response.bodySize : e.response.content.size),
    requestHeaders: toObj(e.request.headers),
    requestBody: e.request.postData ? e.request.postData.text : null,
    responseHeaders: toObj(e.response.headers),
    responseBody: null,
    loadBody: (cb) => e.getContent((content, encoding) =>
      cb(encoding === "base64" ? `[ข้อมูลไบนารี ${formatSize(content ? content.length * 0.75 : 0)}]` : content)),
  });

  net.getHAR((har) => {
    records = har.entries.map(fromHar).concat(records);
    onChange();
  });
  net.onRequestFinished.addListener((entry) => {
    if (!recording) return;
    records.push(fromHar(entry));
    if (records.length > 2000) records.shift();
    onChange();
  });
  net.onNavigated.addListener(() => {
    if (!recording) return;
    records = [];
    state.expanded = null;
    onChange();
  });

  return {
    scoped: false,
    list: () => records,
    get recording() { return recording; },
    setRecording: (value) => { recording = value; onChange(); },
    clear: () => { records = []; onChange(); },
    reload: () => chrome.devtools.inspectedWindow.reload(),
  };
}

// ---------- rendering ----------

let source;
const rows = new Map(); // id -> { el, sig }

function visibleRecords() {
  const all = source.list();
  const scoped = source.scoped && !state.allTabs && state.tabId != null
    ? all.filter((r) => r.tabId === state.tabId)
    : all;
  const searched = scoped.filter((r) => matchesQuery(r, state.query));
  return {
    scopedCount: scoped.length,
    counts: {
      all: searched.length,
      api: searched.filter((r) => applyChip(r, "api")).length,
      error: searched.filter((r) => applyChip(r, "error")).length,
    },
    list: searched.filter((r) => applyChip(r, state.chip)).reverse(), // newest first
  };
}

function statusLabel(rec) {
  if (rec.error) return rec.error === "ERR_BLOCKED_BY_CLIENT" ? "Blocked" : "Failed";
  if (isPending(rec)) return "…";
  return String(rec.status);
}

function statusClass(rec) {
  if (isError(rec)) return "bad";
  if (isPending(rec)) return "pending";
  if (rec.status >= 300) return "redirect";
  return "ok";
}

function signature(rec) {
  return [rec.status, rec.time, rec.size, rec.error, rec.url, state.expanded === rec.id,
    Object.keys(rec.requestHeaders || {}).length, Object.keys(rec.responseHeaders || {}).length].join("|");
}

function renderRow(rec) {
  const { host, path } = splitUrl(rec.url);
  const open = state.expanded === rec.id;
  const line = h("button", {
    class: "line",
    "aria-expanded": String(open),
    title: rec.url,
    onclick: () => toggle(rec.id),
  },
  h("span", { class: `method m-${(rec.method || "").toLowerCase()}` }, rec.method),
  h("span", { class: `status ${statusClass(rec)}` }, statusLabel(rec)),
  h("span", { class: "url" },
    h("span", { class: "path" }, path),
    h("span", { class: "host" }, host)),
  h("span", { class: "meta" },
    h("span", { class: "type" }, prettyType(rec.type)),
    h("span", { class: "time" }, formatTime(rec.time)),
    h("span", { class: "size" }, rec.fromCache ? "cache" : formatSize(rec.size))));

  return h("li", { class: `req ${isError(rec) ? "is-error" : ""} ${open ? "open" : ""}`, dataset: { id: rec.id } },
    line,
    open ? renderDetail(rec) : null);
}

function prettyType(t) {
  const map = { xmlhttprequest: "API", xhr: "API", fetch: "API", main_frame: "หน้าเว็บ", document: "หน้าเว็บ",
    sub_frame: "iframe", stylesheet: "CSS", script: "JS", image: "รูป", font: "ฟอนต์", media: "สื่อ",
    websocket: "WS", ping: "ping" };
  return map[String(t).toLowerCase()] || t || "";
}

function section(title, body, { open = true, copyable = true, empty = "—" } = {}) {
  const text = body || "";
  return h("details", { class: "section", open },
    h("summary", {}, title,
      copyable && text ? h("button", { class: "mini", onclick: (e) => { e.preventDefault(); copy(text, `คัดลอก ${title} แล้ว`); } }, "คัดลอก") : null),
    h("pre", { class: text ? "" : "empty" }, text || empty));
}

function headersText(obj) {
  return Object.entries(obj || {}).map(([k, v]) => `${k}: ${v}`).join("\n");
}

function renderDetail(rec) {
  const facts = [
    ["URL", rec.url],
    ["สถานะ", rec.error ? `${rec.error}` : `${rec.status ?? "กำลังโหลด"} ${rec.statusText || ""}`.trim()],
    ["เวลา", formatTime(rec.time)],
    ["ขนาด", rec.fromCache ? "จาก cache" : formatSize(rec.size)],
  ];
  if (rec.ip) facts.push(["IP", rec.ip]);

  const responseBox = h("pre", { class: "empty" }, IS_PANEL ? "กำลังโหลด…" : "");
  let responseSection = null;
  if (IS_PANEL && rec.loadBody) {
    responseSection = h("details", { class: "section", open: true },
      h("summary", {}, "Response",
        h("button", { class: "mini", onclick: (e) => { e.preventDefault(); copy(responseBox.textContent, "คัดลอก Response แล้ว"); } }, "คัดลอก")),
      responseBox);
    rec.loadBody((body) => {
      responseBox.textContent = body ? prettyBody(body) : "ไม่มีข้อมูล";
      responseBox.className = body ? "" : "empty";
    });
  } else if (!IS_PANEL) {
    responseSection = h("p", { class: "hint" },
      "อยากดู Response body? เปิด DevTools (F12) แล้วไปที่แท็บ ", h("b", {}, "Net Watcher"));
  }

  return h("div", { class: "detail" },
    h("dl", { class: "facts" }, facts.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
    h("div", { class: "actions" },
      h("button", { class: "primary", onclick: () => copy(toCurl(rec), "คัดลอก cURL แล้ว — วางใน Terminal ได้เลย") }, "คัดลอก cURL"),
      h("button", { onclick: () => copy(toFetch(rec), "คัดลอก fetch() แล้ว") }, "คัดลอก fetch"),
      h("button", { onclick: () => copy(rec.url, "คัดลอก URL แล้ว") }, "คัดลอก URL")),
    rec.requestBody ? section("Payload ที่ส่งไป", prettyBody(rec.requestBody)) : null,
    responseSection,
    section("Request headers", headersText(rec.requestHeaders), { open: !rec.requestBody }),
    section("Response headers", headersText(rec.responseHeaders), { open: false }));
}

function toggle(id) {
  state.expanded = state.expanded === id ? null : id;
  render();
}

function render() {
  const { list, counts, scopedCount } = visibleRecords();

  for (const chip of document.querySelectorAll(".chip")) {
    const key = chip.dataset.chip;
    chip.classList.toggle("active", state.chip === key);
    chip.setAttribute("aria-pressed", String(state.chip === key));
    chip.querySelector(".count").textContent = counts[key];
  }
  $("#chip-error").classList.toggle("has-errors", counts.error > 0);

  const recording = source.recording;
  const rec = $("#record");
  rec.classList.toggle("paused", !recording);
  rec.querySelector(".label").textContent = recording ? "กำลังบันทึก" : "หยุดชั่วคราว";
  rec.title = recording ? "กดเพื่อหยุดบันทึกชั่วคราว" : "กดเพื่อบันทึกต่อ";

  // keyed list update: reuse rows whose data didn't change
  const listEl = $("#list");
  const seen = new Set();
  const els = list.map((r) => {
    seen.add(r.id);
    const sig = signature(r);
    const cached = rows.get(r.id);
    if (cached && cached.sig === sig) return cached.el;
    const el = renderRow(r);
    if (cached && cached.el.querySelector(".detail") && el.querySelector(".detail")) {
      // keep the open detail (and its scroll / loaded response) when only timing changed
      el.replaceChild(cached.el.querySelector(".detail"), el.querySelector(".detail"));
    }
    rows.set(r.id, { el, sig });
    return el;
  });
  for (const id of rows.keys()) if (!seen.has(id)) rows.delete(id);
  const current = [...listEl.children];
  if (current.length !== els.length || current.some((el, i) => el !== els[i])) listEl.replaceChildren(...els);

  // empty states
  const empty = $("#empty");
  if (list.length) {
    empty.hidden = true;
  } else {
    empty.hidden = false;
    if (scopedCount === 0) {
      $("#empty-title").textContent = recording ? "ยังไม่มี request" : "หยุดบันทึกอยู่";
      $("#empty-text").textContent = recording
        ? "เปิดหรือรีโหลดหน้าเว็บ แล้ว request จะขึ้นที่นี่ทันที"
        : "กดปุ่ม “หยุดชั่วคราว” ด้านบนเพื่อบันทึกต่อ";
      $("#empty-reload").hidden = !recording;
    } else {
      $("#empty-title").textContent = state.chip === "error" && !state.query ? "ไม่มี error 🎉" : "ไม่พบรายการที่ตรงกัน";
      $("#empty-text").textContent = state.query ? `ไม่มี request ที่มีคำว่า “${state.query}”` : "ลองเลือก “ทั้งหมด”";
      $("#empty-reload").hidden = true;
    }
  }
  $("#total").textContent = `${scopedCount} รายการ`;
}

// ---------- actions ----------

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // DevTools panels can't always use the async clipboard API.
    const ta = h("textarea", { style: "position:fixed;opacity:0" }, text);
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(message);
}

function exportHar() {
  const { list } = visibleRecords();
  const records = list.slice().reverse();
  if (!records.length) return toast("ยังไม่มีข้อมูลให้ export");
  const har = toHAR(records, VERSION);
  const host = splitUrl(records[0].url).host.replace(/[^\w.-]/g, "_") || "network";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const url = URL.createObjectURL(new Blob([JSON.stringify(har, null, 2)], { type: "application/json" }));
  h("a", { href: url, download: `${host}-${stamp}.har` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`ดาวน์โหลด ${records.length} รายการเป็นไฟล์ .har แล้ว`);
}

// ---------- boot ----------

async function resolveTabId() {
  if (params.has("tabId")) return Number(params.get("tabId"));
  if (IS_PANEL) return chrome.devtools.inspectedWindow.tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ? tab.id : null;
}

function bindControls() {
  $("#record").addEventListener("click", () => source.setRecording(!source.recording));
  $("#clear").addEventListener("click", () => {
    source.clear(state.allTabs ? null : state.tabId);
    state.expanded = null;
    toast("ล้างรายการแล้ว");
  });
  $("#export").addEventListener("click", exportHar);
  $("#empty-reload").addEventListener("click", () => source.reload(state.tabId));

  for (const chip of document.querySelectorAll(".chip")) {
    chip.addEventListener("click", () => { state.chip = chip.dataset.chip; render(); });
  }

  const search = $("#search");
  search.addEventListener("input", () => { state.query = search.value; render(); });

  const scope = $("#scope");
  if (source.scoped) {
    scope.addEventListener("change", () => { state.allTabs = scope.checked; render(); });
  } else {
    scope.closest("label").hidden = true;
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
    } else if (e.key === "Escape") {
      if (search.value) { search.value = ""; state.query = ""; }
      else state.expanded = null;
      render();
    }
  });

  const isMac = navigator.userAgent.includes("Mac");
  $("#shortcut").textContent = IS_PANEL ? "" : `เปิดเร็ว: ${isMac ? "⇧⌘M" : "Ctrl+Shift+M"}`;
}

(async function main() {
  if (params.has("full")) document.body.classList.add("full");
  if (IS_PANEL && chrome.devtools.panels.themeName === "dark") document.documentElement.dataset.theme = "dark";
  state.tabId = await resolveTabId();
  let scheduled = false;
  const onChange = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  };
  source = IS_PANEL ? devtoolsSource(onChange) : backgroundSource(onChange);
  bindControls();
  render();
})();

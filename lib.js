// Pure helpers shared by the background worker, the UI and the tests.
// No chrome.* calls in here, so everything can run under `node --test`.

export const MAX_BODY_CHARS = 64 * 1024;

/** webRequest header array -> plain object (duplicate names joined with ", "). */
export function headersToObject(list) {
  const out = {};
  for (const h of list || []) {
    if (!h || !h.name) continue;
    const value = h.value != null ? h.value : decodeBytes(h.binaryValue);
    out[h.name] = h.name in out ? `${out[h.name]}, ${value}` : value;
  }
  return out;
}

/** Case-insensitive header lookup. */
export function getHeader(headers, name) {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return undefined;
}

function decodeBytes(bytes) {
  if (!bytes) return "";
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function truncate(text) {
  if (text.length <= MAX_BODY_CHARS) return text;
  return `${text.slice(0, MAX_BODY_CHARS)}\n… [ตัดเหลือ ${MAX_BODY_CHARS / 1024} KB จากทั้งหมด ${Math.round(text.length / 1024)} KB]`;
}

/**
 * webRequest `details.requestBody` -> readable text.
 * Raw bytes (JSON, text) are decoded as UTF-8; form data becomes urlencoded.
 */
export function decodeRequestBody(requestBody) {
  if (!requestBody) return null;
  if (requestBody.error) return `[อ่าน body ไม่ได้: ${requestBody.error}]`;

  if (requestBody.formData) {
    const params = new URLSearchParams();
    for (const [key, values] of Object.entries(requestBody.formData)) {
      for (const v of values) params.append(key, v);
    }
    return truncate(params.toString());
  }

  if (Array.isArray(requestBody.raw)) {
    const parts = requestBody.raw;
    if (parts.some((p) => p.file)) {
      return `[อัปโหลดไฟล์: ${parts.filter((p) => p.file).map((p) => p.file).join(", ")}]`;
    }
    const chunks = parts.filter((p) => p.bytes).map((p) => new Uint8Array(p.bytes));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    const text = decodeBytes(all);
    if (text == null) return `[ข้อมูลไบนารี ${formatSize(total)}]`;
    return truncate(text);
  }
  return null;
}

// ---------- classification & filtering ----------

const API_TYPES = new Set(["xmlhttprequest", "xhr", "fetch", "websocket", "eventsource"]);

export function isError(rec) {
  return Boolean(rec.error) || rec.status === 0 || (rec.status != null && rec.status >= 400);
}

export function isApi(rec) {
  return API_TYPES.has(String(rec.type || "").toLowerCase());
}

export function isPending(rec) {
  return rec.status == null && !rec.error;
}

export function matchesQuery(rec, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((word) =>
    [rec.url, rec.method, rec.status, rec.type, rec.error]
      .filter((x) => x != null)
      .some((field) => String(field).toLowerCase().includes(word))
  );
}

/** chip: "all" | "api" | "error" */
export function applyChip(rec, chip) {
  if (chip === "api") return isApi(rec);
  if (chip === "error") return isError(rec);
  return true;
}

// ---------- formatting ----------

export function formatSize(bytes) {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatTime(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

export function splitUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "data:") return { host: "data:", path: url.slice(5, 60) };
    return { host: u.host, path: `${u.pathname}${u.search}` || "/" };
  } catch {
    return { host: "", path: url || "" };
  }
}

/** Pretty-print JSON when possible, otherwise return the text unchanged. */
export function prettyBody(text) {
  if (text == null || text === "") return "";
  const t = String(text).trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return String(text);
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return String(text);
  }
}

// ---------- copy as cURL / fetch ----------

/** POSIX shell single-quoting: safe for any input, including quotes. */
export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

const CURL_SKIP = new Set(["host", "content-length", "connection"]);

export function toCurl(rec) {
  const parts = [`curl ${shellQuote(rec.url)}`];
  const method = (rec.method || "GET").toUpperCase();
  const hasBody = rec.requestBody != null && !String(rec.requestBody).startsWith("[");
  if (method !== "GET" && !(method === "POST" && hasBody)) parts.push(`-X ${method}`);

  let compressed = false;
  for (const [name, value] of Object.entries(rec.requestHeaders || {})) {
    const lower = name.toLowerCase();
    if (lower.startsWith(":") || CURL_SKIP.has(lower)) continue;
    if (lower === "accept-encoding") {
      compressed = true;
      continue;
    }
    parts.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  }
  if (hasBody) parts.push(`--data-raw ${shellQuote(rec.requestBody)}`);
  if (compressed) parts.push("--compressed");
  return parts.join(" \\\n  ");
}

const FETCH_SKIP = new Set([
  "host", "content-length", "connection", "cookie", "user-agent", "accept-encoding",
  "origin", "referer",
]);

export function toFetch(rec) {
  const init = { method: (rec.method || "GET").toUpperCase() };
  const headers = {};
  for (const [name, value] of Object.entries(rec.requestHeaders || {})) {
    const lower = name.toLowerCase();
    if (lower.startsWith(":") || lower.startsWith("sec-") || FETCH_SKIP.has(lower)) continue;
    headers[name] = value;
  }
  if (Object.keys(headers).length) init.headers = headers;
  const hasBody = rec.requestBody != null && !String(rec.requestBody).startsWith("[");
  if (hasBody) init.body = rec.requestBody;
  return `fetch(${JSON.stringify(rec.url)}, ${JSON.stringify(init, null, 2)});`;
}

// ---------- HAR 1.2 export ----------

function objToHarHeaders(obj) {
  return Object.entries(obj || {}).map(([name, value]) => ({ name, value: String(value) }));
}

function queryString(url) {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

export function toHAR(records, version = "2.0.0") {
  const entries = records.map((rec) => {
    const reqMime = getHeader(rec.requestHeaders, "content-type") || "";
    const resMime = getHeader(rec.responseHeaders, "content-type") || "";
    const entry = {
      startedDateTime: new Date(rec.startTime ?? Date.now()).toISOString(),
      time: rec.time || 0,
      request: {
        method: rec.method || "GET",
        url: rec.url,
        httpVersion: "HTTP/1.1",
        headers: objToHarHeaders(rec.requestHeaders),
        queryString: queryString(rec.url),
        cookies: [],
        headersSize: -1,
        bodySize: rec.requestBody ? rec.requestBody.length : 0,
      },
      response: {
        status: rec.status || 0,
        statusText: rec.statusText || rec.error || "",
        httpVersion: "HTTP/1.1",
        headers: objToHarHeaders(rec.responseHeaders),
        cookies: [],
        content: { size: rec.size ?? -1, mimeType: resMime },
        redirectURL: getHeader(rec.responseHeaders, "location") || "",
        headersSize: -1,
        bodySize: rec.size ?? -1,
      },
      cache: {},
      timings: { send: 0, wait: rec.time || 0, receive: 0 },
      _resourceType: rec.type || "other",
    };
    if (rec.requestBody) entry.request.postData = { mimeType: reqMime, text: rec.requestBody };
    if (rec.responseBody != null) entry.response.content.text = rec.responseBody;
    if (rec.error) entry._error = rec.error;
    return entry;
  });
  return {
    log: {
      version: "1.2",
      creator: { name: "View Network", version },
      pages: [],
      entries,
    },
  };
}

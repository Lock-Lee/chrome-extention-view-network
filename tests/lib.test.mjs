import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeRequestBody, headersToObject, isApi, isError, matchesQuery, shellQuote,
  toCurl, toFetch, toHAR, formatSize, splitUrl, prettyBody,
} from "../lib.js";

const bytes = (s) => new TextEncoder().encode(s).buffer;

test("raw JSON body is decoded instead of 'Binary data'", () => {
  assert.equal(decodeRequestBody({ raw: [{ bytes: bytes('{"a":1}') }] }), '{"a":1}');
});

test("multi-chunk raw body is joined", () => {
  assert.equal(decodeRequestBody({ raw: [{ bytes: bytes("ab") }, { bytes: bytes("cd") }] }), "abcd");
});

test("non-UTF8 body is reported as binary", () => {
  const out = decodeRequestBody({ raw: [{ bytes: new Uint8Array([0xff, 0xfe, 0x00]).buffer }] });
  assert.match(out, /ไบนารี/);
});

test("form data becomes urlencoded", () => {
  assert.equal(decodeRequestBody({ formData: { q: ["a b"], x: ["1", "2"] } }), "q=a+b&x=1&x=2");
});

test("duplicate headers are joined", () => {
  assert.deepEqual(headersToObject([{ name: "a", value: "1" }, { name: "a", value: "2" }]), { a: "1, 2" });
});

test("shellQuote survives single quotes", () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`);
});

test("cURL quotes url, headers and body; skips host/content-length", () => {
  const curl = toCurl({
    method: "POST",
    url: "https://x.test/a?b='1'",
    requestHeaders: { Host: "x.test", "Content-Length": "9", "X-Note": "it's", "Accept-Encoding": "gzip" },
    requestBody: `{"n":"o'k"}`,
  });
  assert.ok(curl.startsWith(`curl 'https://x.test/a?b='\\''1'\\'''`));
  assert.ok(!/Host:|Content-Length/.test(curl));
  assert.ok(curl.includes(`-H 'X-Note: it'\\''s'`));
  assert.ok(curl.includes(`--data-raw '{"n":"o'\\''k"}'`));
  assert.ok(curl.includes("--compressed"));
  assert.ok(!curl.includes("-X POST"), "POST with body is implied by --data-raw");
});

test("cURL adds -X for non-GET without body", () => {
  assert.match(toCurl({ method: "DELETE", url: "https://x.test/1" }), /-X DELETE/);
});

test("fetch() output is valid JS", () => {
  const code = toFetch({ method: "PUT", url: "https://x.test", requestHeaders: { "content-type": "application/json", Cookie: "s" }, requestBody: "{}" });
  assert.doesNotThrow(() => new Function("fetch", code));
  assert.ok(!code.includes("Cookie"));
});

test("classification", () => {
  assert.ok(isError({ status: 500 }));
  assert.ok(isError({ status: 0, error: "ERR_FAILED" }));
  assert.ok(!isError({ status: 304 }));
  assert.ok(!isError({ status: null }));
  assert.ok(isApi({ type: "xmlhttprequest" }) && isApi({ type: "fetch" }) && !isApi({ type: "image" }));
});

test("search matches every word across fields", () => {
  const rec = { url: "https://x.test/api/users", method: "POST", status: 500 };
  assert.ok(matchesQuery(rec, "users 500"));
  assert.ok(!matchesQuery(rec, "users 404"));
});

test("HAR has required 1.2 fields", () => {
  const har = toHAR([{ url: "https://x.test/?q=1", method: "GET", status: 200, time: 12, startTime: 0, size: 10,
    requestHeaders: { a: "b" }, responseHeaders: { "Content-Type": "text/plain" } }]);
  const e = har.log.entries[0];
  assert.equal(har.log.version, "1.2");
  assert.equal(e.request.queryString[0].name, "q");
  assert.equal(e.response.content.mimeType, "text/plain");
  assert.equal(e.startedDateTime, "1970-01-01T00:00:00.000Z");
});

test("formatting helpers", () => {
  assert.equal(formatSize(null), "—");
  assert.equal(formatSize(512), "512 B");
  assert.equal(formatSize(1536), "1.5 KB");
  assert.deepEqual(splitUrl("https://a.test/p?q=1"), { host: "a.test", path: "/p?q=1" });
  assert.equal(prettyBody('{"a":1}'), '{\n  "a": 1\n}');
  assert.equal(prettyBody("plain"), "plain");
});

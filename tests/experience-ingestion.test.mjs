import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sessionId = "b2222222-2222-4222-8222-222222222222";
const event = { sessionId, name: "page_view", path: "/p/sample" };
const origin = "https://site.test";
async function compile(path) {
  return ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
async function load(path, env = {}, mocks = {}) {
  const exports = {};
  new Function("require", "exports", "process", "Response", "URL", "TextDecoder", "console", await compile(path))(
    (name) => name in mocks ? mocks[name] : require(name), exports, { env, cwd: process.cwd }, Response, URL, TextDecoder, { error() {} },
  );
  return exports;
}
const request = (headers = {}, body = JSON.stringify(event)) => new Request("http://internal:3000/api/experience", {
  method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body,
});

test("experience origin, UTF-8 and streamed-size checks run before quota or persistence", async () => {
  const guard = await load("../src/lib/admin-origin.ts", { NEXTAUTH_URL: origin, MEDIA_ADMIN_ORIGINS: "https://phone.test:8443" });
  const validator = await load("../src/lib/experience.ts");
  let quota = 0;
  const saved = [];
  let limited = null;
  let storageFails = false;
  let admin = false;
  const route = await load("../src/app/api/experience/route.ts", {}, {
    "@/lib/admin-origin": guard,
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: admin } }) },
    "@/lib/auth": { isAdmin: (user) => user?.isAdmin },
    "@/lib/experience": { ...validator, recordExperienceEvent: async (value) => {
      if (storageFails) throw new Error("disk unavailable");
      saved.push(value);
    }, readExperienceSummary: async () => ({ pageViews: saved.length }) },
    "@/lib/operational-logging": { recordApplicationFailure: async () => {} },
    "@/lib/experience-rate-limit": { limitExperienceEvent: async () => { quota++; return limited; } },
  });
  const check = async (req, status) => {
    const result = await route.POST(req);
    assert.equal(result.status, status);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    return result;
  };
  for (const value of ["https://evil.test", "http://site.test", "https://site.test:8443", "null", "https://user@site.test", "https://site.test/path"]) {
    await check(request({ origin: value, host: "evil.test", "x-forwarded-host": "evil.test", referer: origin + "/" }), 403);
  }
  await check(request({ "sec-fetch-site": "cross-site" }), 403);
  const missing = request(); missing.headers.delete("origin");
  await check(missing, 403);
  await check(request({ "content-type": "application/jsonp" }), 415);
  await check(request({ "content-type": "application/json-extra" }), 415);
  await check(request({ "content-length": "4097" }), 413);
  await check(request({}, " ".repeat(4097)), 413);
  await check(request({}, '{"name":"page_view","path":"/","sessionId":"bad"}'), 400);
  await check(request({}, "[]"), 400);
  await check(request({}, new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125])), 400);
  let cancelled = false;
  const tooLarge = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(2049)); }, cancel() { cancelled = true; } });
  await check(new Request("http://internal:3000/api/experience", { method: "POST", headers: { origin, "content-type": "application/json", "content-length": "1" }, body: tooLarge, duplex: "half" }), 413);
  assert.equal(cancelled, true);
  const broken = new ReadableStream({ start(controller) { controller.error(new Error("disconnected")); } });
  await check(new Request("http://internal:3000/api/experience", { method: "POST", headers: { origin, "content-type": "application/json" }, body: broken, duplex: "half" }), 400);
  assert.equal(quota, 0);
  assert.equal(saved.length, 0);

  await check(request({ host: "wrong.test", "x-forwarded-host": "wrong.test", "content-type": "Application/JSON; charset=utf-8" }), 200);
  const fallback = request({ referer: origin + "/p/sample" }); fallback.headers.delete("origin");
  await check(fallback, 200);
  await check(request({ origin: "https://phone.test:8443" }), 200);
  // Exact byte boundary and a multibyte sequence split across stream chunks.
  await check(request({}, JSON.stringify(event).padEnd(4096, " ")), 200);
  const bytes = new TextEncoder().encode(JSON.stringify({ ...event, source: "café" }));
  const splitAt = bytes.indexOf(0xc3) + 1;
  const split = new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, splitAt)); controller.enqueue(bytes.slice(splitAt)); controller.close(); } });
  await check(new Request("http://internal:3000/api/experience", { method: "POST", headers: { origin, "content-type": "application/json" }, body: split, duplex: "half" }), 200);
  assert.equal(saved.at(-1).source, "café");
  assert.equal(saved.length, 5);
  limited = Response.json({ accepted: false }, { status: 429, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Retry-After": "12" } });
  assert.equal((await check(request(), 429)).headers.get("retry-after"), "12");
  assert.equal(saved.length, 5);
  limited = null;
  storageFails = true;
  await check(request(), 503);
  assert.equal((await route.GET()).status, 401);
  admin = true;
  const report = await route.GET();
  assert.equal(report.headers.get("cache-control"), "private, no-store");
  assert.equal((await report.json()).pageViews, 5);
});

test("experience quotas share bounded persistent state and cannot be bypassed by rotating sessions", { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-experience-quota-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const make = () => load("../src/lib/experience-rate-limit.ts", { MEDIA_DATA_DIR: directory }, {
    "./catalog-lock.cjs": require("../src/lib/catalog-lock.cjs"),
    "./operational-logging": { recordApplicationFailure: async () => {} },
  });
  const first = await make();
  assert.equal(await first.limitExperienceEvent(sessionId, 100_000), null);
  const file = join(directory, "rate-limits", "experience.json");
  await writeFile(file, JSON.stringify(Array.from({ length: 59 }, () => ({ at: 100_000, sessionId }))));
  const second = await make();
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? first : second).limitExperienceEvent(sessionId, 100_000)));
  assert.equal(responses.filter((value) => value === null).length, 1);
  assert.equal(responses.filter((value) => value?.status === 429).length, 7);
  assert.equal(responses.find((value) => value)?.headers.get("Retry-After"), "60");
  assert.equal(await second.limitExperienceEvent("other-session", 100_000), null);
  assert.equal((await (await make()).limitExperienceEvent(sessionId, 130_000)).headers.get("Retry-After"), "30");
  assert.equal(await second.limitExperienceEvent(sessionId, 160_000), null);
  await writeFile(file, JSON.stringify(Array.from({ length: 1198 }, (_, i) => ({ at: 200_000, sessionId: String(i) }))));
  const global = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? first : second).limitExperienceEvent(`new-${i}`, 200_000)));
  assert.equal(global.filter((value) => value === null).length, 2);
  assert.equal(global.filter((value) => value?.status === 429).length, 6);
  assert.equal(JSON.parse(await readFile(file, "utf8")).length, 1200);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await readdir(join(directory, "rate-limits"))).filter((name) => name.endsWith(".tmp")).length, 0);
  assert.equal(await (await make()).limitExperienceEvent("recovered", 260_000), null);
  await writeFile(file, JSON.stringify([
    ...Array.from({ length: 1140 }, (_, i) => ({ at: 300_000, sessionId: String(i) })),
    ...Array.from({ length: 60 }, () => ({ at: 330_000, sessionId })),
  ]));
  assert.equal((await first.limitExperienceEvent(sessionId, 350_000)).headers.get("Retry-After"), "40");
  assert.equal((await first.limitExperienceEvent("new-visitor", 350_000)).headers.get("Retry-After"), "10");
  for (const state of ["corrupt", "{}", '[{"at":"bad","sessionId":"s"}]', JSON.stringify(Array(1201).fill({ at: 100_000, sessionId }))]) {
    await writeFile(file, state);
    const unavailable = await second.limitExperienceEvent(sessionId, 300_000);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("Retry-After"), "10");
    assert.equal(await readFile(file, "utf8"), state);
  }
});

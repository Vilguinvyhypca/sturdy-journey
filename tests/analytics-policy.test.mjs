import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/analytics-policy.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { isAnalyticsUrl } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const allowed = (path) => isAnalyticsUrl(new URL(path, "https://gallery.example"));

test("anonymous gallery routes and known media filters are eligible", () => {
  for (const path of ["/", "/photos", "/videos", "/feed", "/albums", "/p/creator", "/p/creator?type=video"]) {
    assert.equal(allowed(path), true, path);
  }
});

test("admin, auth, detail pages and unknown routes stay out of recording", () => {
  for (const path of ["/admin", "/admin/profiles", "/upload", "/api/auth/signin", "/photos/private-id", "/videos/unlisted-id", "/albums/123", "/unknown"]) {
    assert.equal(allowed(path), false, path);
  }
});

test("shared media links, arbitrary query data, and fragments are excluded", () => {
  for (const path of ["/?media=unlisted-id", "/?token=secret", "/?type=private", "/?type=video&email=person", "/#secret"]) {
    assert.equal(allowed(path), false, path);
  }
});

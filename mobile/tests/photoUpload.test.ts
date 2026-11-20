import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Run the installed Expo encoder. Its file implementation reads bytes through
// the native bridge, so provide an in-memory file in the Node test process.
function load(file: URL, modules: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", source)(exports, (name: string) => modules[name]);
  return exports as Record<string, Function>;
}

test("a local photo produces a binary file part with the installed Expo fetch encoder", async () => {
  const bytes = Uint8Array.from([255, 216, 255, 217]);
  class LocalFile {
    name = "sample.jpg";
    type = "image/jpeg";
    readonly uri: string; constructor(uri: string) { this.uri = uri; }
    async bytes() { return bytes; }
  }
  const { appendPhoto } = load(new URL("../src/photo/native.ts", import.meta.url), {
    "expo-file-system": { File: LocalFile },
  });
  const { convertFormDataAsync } = load(new URL("../node_modules/expo/src/winter/fetch/convertFormData.ts", import.meta.url), {});
  const entries = new Map<string, LocalFile>();
  const form = { append: entries.set.bind(entries), entries: entries.entries.bind(entries) };
  appendPhoto(form, "file", {uri:"file:///cache/sample.jpg",name:"sample.jpg",type:"image/jpeg"});
  const { body, boundary } = await convertFormDataAsync(form);
  const parsed = await new Response(body, {headers:{"Content-Type":"multipart/form-data; boundary=" + boundary}}).formData();
  const file = parsed.get("file");
  assert.ok(file instanceof File);
  assert.equal(file.type, "image/jpeg");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
});

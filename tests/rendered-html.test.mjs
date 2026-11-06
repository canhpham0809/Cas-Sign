import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("validates application build artifacts and components", async () => {
  const [page, lookup, worker, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lookup/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  // Check home page features
  assert.match(page, /CAS Sign/);
  assert.match(page, /quét mã QR/i);
  assert.match(page, /new EventSource\(`\/api\/esign\/stream\//);
  assert.match(page, /signType/);
  assert.match(page, /Huỷ yêu cầu/);
  assert.match(page, /qrcode/);
  assert.match(page, /session-storage/);

  // Check lookup page features
  assert.match(lookup, /Tra cứu lịch sử chữ ký/);
  assert.match(lookup, /orgIdSigned/);
  assert.match(lookup, /signing-round/);
  assert.match(lookup, /kysoqr\.com#vpl2z_/);

  // Check worker endpoints
  assert.match(worker, /request-document/);
  assert.match(worker, /\/api\/esign\/signing-round/);
  assert.match(worker, /\/api\/esign\/webhook/);
  assert.match(worker, /\/api\/esign\/signed-file/);
  assert.match(worker, /validateSignType/);
  assert.doesNotMatch(worker, /https:\/\/sandbox\.bankhub\.dev/);

  // Check package.json dependencies
  assert.match(packageJson, /"qrcode"/);
});

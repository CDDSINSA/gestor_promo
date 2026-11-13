import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignImageUrlCache } from "../src/features/catalogDesign/designImageUrls.js";

test("signed URLs renew before expiry and do not sign on every render", async () => {
  let clock = 0, calls = 0;
  const get = createDesignImageUrlCache(async () => `url-${++calls}`, () => clock);
  assert.equal((await get("a")).url,"url-1");
  clock = 3200000;
  assert.equal((await get("a")).url,"url-1");
  clock = 3300000;
  assert.equal((await get("a")).url,"url-2");
  assert.equal(calls,2);
});

test("failed renewal backs off and never returns an expired link", async () => {
  let clock = 0, fail = false, calls = 0;
  const get = createDesignImageUrlCache(async () => { calls++; if(fail) throw new Error("offline"); return "valid"; }, () => clock);
  await get("a"); fail = true; clock = 3300000;
  assert.equal((await get("a")).url,"valid");
  await get("a"); assert.equal(calls,2);
  clock = 3600000;
  const expired = await get("a");
  assert.equal(expired.url,""); assert.ok(expired.error);
  fail = false; clock += 60000;
  assert.equal((await get("a")).error,"");
});

test("retry backoff cannot extend a signed URL beyond its expiry", async () => {
  let clock = 0;
  const get = createDesignImageUrlCache(async () => { if(clock) throw new Error("offline"); return "url"; }, () => clock);
  await get("a"); clock = 3590000; await get("a"); clock = 3610000;
  assert.equal((await get("a")).url, "");
});

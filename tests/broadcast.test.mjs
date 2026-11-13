import assert from "node:assert/strict";
import { test } from "node:test";
import { createBroadcastRequestId, validateBroadcast } from "../src/features/notifications/broadcast.js";

test("blank content is rejected; limits include multiline messages", () => {
  assert.ok(validateBroadcast(" ", "Aviso"));
  assert.ok(validateBroadcast("Asunto", "\n "));
  assert.ok(validateBroadcast("x".repeat(101), "Aviso"));
  assert.ok(validateBroadcast("Asunto", "x".repeat(1001)));
  assert.equal(validateBroadcast("x".repeat(100), "x".repeat(1000)), "");
  assert.equal(validateBroadcast(" Asunto ", "Primera línea\nSegunda línea"), "");
});
test("broadcast requests have distinct UUIDs", () => {
  const first = createBroadcastRequestId();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(createBroadcastRequestId(), first);
});

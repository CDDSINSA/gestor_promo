import assert from "node:assert/strict";
import { test } from "node:test";
import { createNotificationSound } from "../src/features/notifications/notificationSound.js";

function setup() {
  let time = 0;
  let tones = 0;
  const parameter = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const context = {
    state: "suspended", currentTime: 0, destination: {},
    async resume() { this.state = "running"; },
    async close() { this.state = "closed"; },
    createOscillator() { return { frequency: parameter, connect() {}, disconnect() {}, start() { tones++; }, stop() {} }; },
    createGain() { return { gain: parameter, connect() {}, disconnect() {} }; },
  };
  return { context, player: createNotificationSound({ createContext: () => context, now: () => time }), advance: () => { time += 2000; }, get tones() { return tones; } };
}

test("audio waits for interaction, without replaying alerts that arrived before it", async () => {
  const h = setup();
  assert.equal(h.player.play("old"), false);
  await h.player.unlock();
  assert.equal(h.player.play("old"), false);
  assert.equal(h.player.play("new"), true);
  assert.equal(h.tones, 2);
});

test("duplicate events and bursts do not produce repeated chimes", async () => {
  const h = setup();
  await h.player.unlock();
  assert.equal(h.player.play("one"), true);
  assert.equal(h.player.play("two"), false);
  h.advance();
  assert.equal(h.player.play("one"), false);
  assert.equal(h.player.play("three"), true);
});

test("unsupported or blocked audio does not interrupt notifications", async () => {
  const player = createNotificationSound({ createContext: () => { throw new Error("Blocked"); } });
  await player.unlock();
  assert.equal(player.play("one"), false);
  player.dispose();
});

test("disposing the player closes audio and prevents later playback", async () => {
  const h = setup();
  await h.player.unlock();
  h.player.dispose();
  assert.equal(h.context.state, "closed");
  assert.equal(h.player.play("one"), false);
});

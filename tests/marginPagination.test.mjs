import assert from "node:assert/strict";
import { test } from "node:test";
import { paginateOffers } from "../src/features/margins/marginPagination.js";

const offers = Array.from({ length: 60 }, (_, index) => ({ key: `O${index + 1}` }));

test("divide las ofertas en páginas con rango visible", () => {
  const first = paginateOffers(offers, 1, 25);
  assert.equal(first.items.length, 25);
  assert.deepEqual([first.from, first.to, first.totalPages, first.hasPrevious, first.hasNext], [1, 25, 3, false, true]);
  const last = paginateOffers(offers, 3, 25);
  assert.equal(last.items.length, 10);
  assert.deepEqual([last.from, last.to, last.hasNext], [51, 60, false]);
});

test("ajusta páginas fuera de rango, tamaños inválidos y listas vacías", () => {
  assert.equal(paginateOffers(offers, 99, 50).page, 2);
  assert.equal(paginateOffers(offers, 0, 50).page, 1);
  assert.equal(paginateOffers(offers, 1, 7).pageSize, 25);
  const empty = paginateOffers([], 1, 25);
  assert.deepEqual([empty.total, empty.from, empty.to, empty.totalPages], [0, 0, 0, 1]);
});

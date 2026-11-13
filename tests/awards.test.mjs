import test from "node:test";
import assert from "node:assert/strict";
import { buildAwards } from "../awards.js";

const g = (id, interests) => ({ id, name: id[0].toUpperCase() + id.slice(1), emoji: "x", interests });
const guests = [
  g("ana", ["rock", "hiking", "coffee"]), g("ben", ["metal", "climbing", "coffee"]), g("cy", ["jazz", "pottery"]),
  g("dee", ["dogs", "history"]), g("eli", ["rock", "hiking", "coffee"]), g("fay", ["kpop"]), g("gus", ["wine"]),
];
const T = Date.parse("2026-11-14T21:00:00-05:00");
const pair = (a, b, by, min) => ({ id: a < b ? `${a}_${b}` : `${b}_${a}`, a: a < b ? a : b, b: a < b ? b : a, by, at: T + min * 60000 });
const pairs = [
  pair("ana", "eli", "ana", 4), pair("ana", "ben", "ana", 6), pair("ben", "eli", "eli", 9),   // a circle of three
  pair("ana", "dee", "dee", 20), pair("dee", "fay", "dee", 31), pair("ana", "cy", "ana", 40),
  pair("gone", "ana", "gone", 50),                                                           // a guest who left
];
const stats = { ana: { wrong: 3, nudges: 0, skips: 0 }, dee: { wrong: 1, nudges: 2, skips: 4 }, eli: { nudges: 0 } };
const out = buildAwards({ guests, pairs, stats, meId: "ana" });
const award = (key) => out.awards.find((a) => a.key === key);

test("pairs with a guest who left are ignored", () => {
  assert.equal(out.pairs, 6);
});

test("people awards", () => {
  assert.deepEqual(award("connected").who, ["ana"]);
  assert.equal(award("connected").detail, "Met 4 guests.");
  assert.deepEqual(award("detective").who, ["ana"]);
  assert.match(award("detective").detail, /3 guests/);
  assert.deepEqual(award("wanted").who, ["ana", "ben", "eli"].filter((id) => award("wanted").who.includes(id)));
});

test("pair awards", () => {
  assert.deepEqual(award("closest").who.sort(), ["ana", "eli"]);
  assert.equal(award("closest").detail, "Both picked Rock, Hiking and Coffee.");
  assert.equal(award("unlikeliest").who.length, 2);
  assert.match(award("unlikeliest").detail, /Nothing in common/);
  assert.deepEqual(award("first").who.sort(), ["ana", "eli"]);
  assert.match(award("first").detail, /at \d+:04 pm/);
  assert.deepEqual(award("last").who.sort(), ["ana", "cy"]);
});

test("mixing awards", () => {
  assert.deepEqual(award("circle").who.sort(), ["ana", "ben", "eli"]);
  assert.equal(award("apart").detail, "3 introductions away from each other.");   // fay - dee - ana - ben/eli/cy
  assert.deepEqual(award("bridge").who, ["ana"]);
  assert.equal(award("kind") !== undefined, true);
  assert.match(award("obsession").detail, /Coffee, picked by 3 guests/);
});

test("play awards come from each guest's own tally", () => {
  assert.deepEqual(award("thirsty").who, ["ana"]);
  assert.equal(award("thirsty").detail, "3 wrong guesses, so 3 sips.");
  assert.deepEqual(award("sharp").who, ["ana"]);
  assert.deepEqual(award("picky").who, ["dee"]);
});

test("leaderboard shares places on ties and leaves out guests with no pairs", () => {
  assert.deepEqual(out.board.map((b) => [b.id, b.count, b.place]), [["ana", 4, 1], ["ben", 2, 2], ["dee", 2, 2], ["eli", 2, 2], ["cy", 1, 5], ["fay", 1, 5]]);
});

test("the viewer's own night", () => {
  assert.equal(out.mine.lead, "You met 4 of 6 other guests.");
  const rows = Object.fromEntries(out.mine.rows);
  assert.equal(rows["Your place"], "1st of 7");
  assert.equal(rows["You found"], "3 guests");
  assert.equal(rows["Found you"], "1 guest");
  assert.equal(rows["Closest match"], "Eli");
  assert.equal(rows["Sips for wrong guesses"], "3");
  assert.match(rows["Your awards"], /Most connected/);
  assert.equal(buildAwards({ guests, pairs, stats, meId: "gus" }).mine.lead, "You did not pair with anyone tonight.");
});

test("numbers", () => {
  const n = Object.fromEntries(out.numbers);
  assert.equal(n["Pairs made"], "6");
  assert.equal(n["Of every pair that could exist"], "29%");
  assert.equal(n["Sips taken for wrong guesses"], "4");
});

test("an empty party gives no awards and does not crash", () => {
  const none = buildAwards({ guests: [], pairs: [], meId: "x" });
  assert.deepEqual(none.awards, []);
  assert.equal(none.mine, null);
  const one = buildAwards({ guests: guests.slice(0, 2), pairs: [], meId: "ana" });
  assert.equal(one.board.length, 0);
});

test("40 guests and 240 pairs is quick", () => {
  let s = 3; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const tags = ["rock", "metal", "coffee", "tea", "hiking", "dogs", "ai", "chess", "wine", "anime"];
  const many = Array.from({ length: 40 }, (_, i) => g("guest" + String(i).padStart(2, "0"), [tags[i % 10], tags[(i * 3 + 1) % 10], tags[(i * 7 + 2) % 10]]));
  const seen = new Set(); const ps = [];
  while (ps.length < 240) { const a = Math.floor(rnd() * 40), b = Math.floor(rnd() * 40); if (a === b) continue; const p = pair(many[a].id, many[b].id, many[a].id, ps.length); if (!seen.has(p.id)) { seen.add(p.id); ps.push(p); } }
  const t = performance.now();
  const big = buildAwards({ guests: many, pairs: ps, meId: many[0].id });
  assert.ok(performance.now() - t < 1500, "took " + (performance.now() - t));
  assert.equal(big.board.length, 40);
});

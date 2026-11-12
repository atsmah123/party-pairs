import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../match.js";
import { CATEGORIES, LINKS, PROMPTS } from "../data.js";

test("tag ids are unique and every group has prompts and a clue", () => {
  const ids = CATEGORIES.flatMap((c) => c.groups.flatMap((g) => g.tags.map((t) => t[0])));
  assert.equal(new Set(ids).size, ids.length);
  const groups = CATEGORIES.flatMap((c) => c.groups);
  assert.equal(new Set(groups.map((g) => g.id)).size, groups.length);
  for (const g of groups) {
    assert.ok(g.clue, g.id);
    assert.ok(PROMPTS[g.id]?.length >= 2, "prompts for " + g.id);
  }
  for (const [a, b] of LINKS) assert.ok(M.TAGS.has(a) && M.TAGS.has(b), `${a}/${b}`);
});

test("rock and metal are a close match, rock and jazz a loose one", () => {
  assert.equal(M.sim("rock", "rock"), 1);
  assert.equal(M.sim("rock", "metal"), 0.7);
  assert.equal(M.sim("rock", "jazz"), 0.3);
  assert.equal(M.sim("rock", "hiking"), 0);
  assert.equal(M.sim("karaoke", "singing"), 0.7);
});

test("a metal fan ranks above a jazz fan for a rock fan", () => {
  const me = ["rock", "climbing", "coffee"];
  const metal = M.compare(me, ["metal", "pottery", "wine"]).score;
  const jazz = M.compare(me, ["jazz", "pottery", "wine"]).score;
  const none = M.compare(me, ["pottery", "dogs", "history"]).score;
  assert.ok(metal > jazz && jazz > none, `${metal} ${jazz} ${none}`);
});

test("shared counts from the smaller side", () => {
  assert.equal(M.compare(["rock", "punk"], ["metal"]).shared, 1);
  assert.equal(M.compare(["rock", "hiking"], ["metal", "climbing"]).shared, 2);
  assert.equal(M.compare(["rock"], ["dogs"]).shared, 0);
  assert.equal(M.compare([], ["dogs"]).score, 0);
  assert.equal(M.compare(["nonsense"], ["dogs"]).score, 0);
});

test("compare is symmetric in score and shared", () => {
  const a = ["rock", "punk", "hiking", "coffee", "ai"], b = ["metal", "climbing", "tea", "dogs"];
  const x = M.compare(a, b), y = M.compare(b, a);
  assert.equal(x.score, y.score);
  assert.equal(x.shared, y.shared);
});

test("clues stay vague but true", () => {
  assert.equal(M.clueLine(["rock", "hiking"], ["metal", "climbing"]), "Your pair is into loud guitar music and mountains and trails, same as you.");
  assert.match(M.clueLine(["karaoke"], ["singing"]), /making music, which sits close to your pick of Karaoke/);
  assert.match(M.clueLine(["rock"], ["jazz"]), /something under Music/);
  assert.match(M.clueLine(["rock"], ["dogs"]), /share nothing. Your pair is into animals/);
  assert.match(M.clueLine(["rock"], []), /kept their interests/);
});

test("both guests get the same prompt", () => {
  const a = { id: "aaa", interests: ["rock", "coffee"] }, b = { id: "bbb", interests: ["metal", "dogs"] };
  assert.equal(M.promptFor(a, b), M.promptFor(b, a));
  assert.ok(PROMPTS.guitar.includes(M.promptFor(a, b)));
});

test("pair ids sort the same way on both phones", () => {
  assert.equal(M.pairId("b", "a"), "a_b");
  assert.equal(M.pairId("Zx", "ab"), "Zx_ab");
});

const guests = [
  { id: "me", interests: ["rock", "hiking", "coffee"] },
  { id: "g1", interests: ["metal", "climbing", "tea"] },
  { id: "g2", interests: ["jazz", "pottery"] },
  { id: "g3", interests: ["dogs"] },
];

test("pickTarget takes the closest unmet guest", () => {
  assert.equal(M.pickTarget(guests[0], guests, []).guest.id, "g1");
  const pairs = [{ a: "g1", b: "me" }];
  assert.equal(M.pickTarget(guests[0], guests, pairs).guest.id, "g2");
});

test("pickTarget honours skips, then recycles them", () => {
  const me = { ...guests[0], skipped: ["g1"] };
  assert.equal(M.pickTarget(me, guests, []).guest.id, "g2");
  const all = { ...guests[0], skipped: ["g1", "g2", "g3"] };
  const r = M.pickTarget(all, guests, [], { avoid: "g1" });
  assert.equal(r.recycled, true);
  assert.notEqual(r.guest.id, "g1");
  const last = M.pickTarget({ ...guests[0], skipped: ["g1"] }, guests.slice(0, 2), [], { avoid: "g1" });
  assert.equal(last.guest.id, "g1");
});

test("pickTarget returns null when everyone is met, and ignores guests who left", () => {
  const pairs = [{ a: "g1", b: "me" }, { a: "g2", b: "me" }, { a: "g3", b: "me" }, { a: "gone", b: "me" }];
  assert.equal(M.pickTarget(guests[0], guests, pairs), null);
  assert.equal(M.partnersOf("me", pairs, new Set(guests.map((g) => g.id))).size, 3);
});

test("a guest who has met many drops below an equal match who has met few", () => {
  const crowd = [
    { id: "me", interests: ["rock", "hiking"] },
    { id: "busy", interests: ["rock", "hiking"] },
    { id: "free", interests: ["rock", "hiking"] },
    ...[1, 2, 3, 4].map((n) => ({ id: "h" + n, interests: ["dogs"] })),
  ];
  const pairs = [1, 2, 3, 4].map((n) => ({ a: "busy", b: "h" + n }));
  assert.equal(M.pickTarget(crowd[0], crowd, pairs).guest.id, "free");
});

test("codes are four consonants and never collide", () => {
  const taken = new Set();
  for (let i = 0; i < 300; i++) {
    const c = M.makeCode(taken);
    assert.match(c, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    taken.add(c);
  }
  assert.equal(taken.size, 300);
  assert.equal(M.cleanCode(" kx-q m9z"), "KXQM");
});

test("rank climbs to an ace and stops", () => {
  assert.equal(M.rankFor(0), "2");
  assert.equal(M.rankFor(9), "J");
  assert.equal(M.rankFor(12), "A");
  assert.equal(M.rankFor(40), "A");
  assert.ok(["spade", "heart", "diamond", "club"].includes(M.suitFor("abc")));
});

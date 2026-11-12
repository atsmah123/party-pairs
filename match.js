// Matching, clues and the small rules of the game. No DOM, no network:
// everything here is a pure function so it can be tested with `node --test`.

import { CATEGORIES, LINKS, PROMPTS, FALLBACK_PROMPTS } from "./data.js";

export const TAGS = new Map();
export const GROUPS = new Map();
export const CATS = new Map();
for (const cat of CATEGORIES) {
  CATS.set(cat.id, cat);
  for (const g of cat.groups) {
    GROUPS.set(g.id, { id: g.id, clue: g.clue, cat: cat.id });
    for (const [id, label] of g.tags) TAGS.set(id, { id, label, group: g.id, cat: cat.id });
  }
}
const LINKED = new Set(LINKS.flatMap(([a, b]) => [a + "|" + b, b + "|" + a]));

const EXACT = 1, CLOSE = 0.7, LOOSE = 0.3;

/** How alike two tags are: 1 same, 0.7 same group or linked, 0.3 same category. */
export function sim(a, b) {
  if (a === b) return EXACT;
  const A = TAGS.get(a), B = TAGS.get(b);
  if (!A || !B) return 0;
  if (A.group === B.group || LINKED.has(a + "|" + b)) return CLOSE;
  if (A.cat === B.cat) return LOOSE;
  return 0;
}

function known(list) {
  return [...new Set((list || []).filter((t) => TAGS.has(t)))];
}

function best(tag, others) {
  let top = { tag, other: null, s: 0 };
  for (const o of others) {
    const s = sim(tag, o);
    if (s > top.s) top = { tag, other: o, s };
  }
  return top;
}

/**
 * Compare two interest lists.
 * score   ranking value, higher is a better match
 * shared  how many interests they share (same or close), counted from the
 *         side that has fewer, so rock + punk against metal counts once
 * points  what they share, strongest first: {kind, group, mine, theirs}
 */
export function compare(mine, theirs) {
  const M = known(mine), T = known(theirs);
  const bestM = M.map((m) => best(m, T));
  const bestT = T.map((t) => best(t, M));
  const sum = (xs) => xs.reduce((n, x) => n + x.s, 0);
  const score = M.length && T.length ? (sum(bestM) + sum(bestT)) / (2 * Math.sqrt(M.length * T.length)) : 0;
  const strong = (xs) => xs.filter((x) => x.s >= CLOSE).length;
  const shared = Math.min(strong(bestM), strong(bestT));

  const points = [];
  const seen = new Set();
  const add = (kind, group, m, t) => {
    if (seen.has(group)) return;
    seen.add(group);
    points.push({ kind, group, mine: m, theirs: t });
  };
  for (const x of bestM) if (x.s === EXACT) add("exact", TAGS.get(x.tag).group, x.tag, x.other);
  for (const x of bestM) {
    if (x.s !== CLOSE) continue;
    const a = TAGS.get(x.tag), b = TAGS.get(x.other);
    if (a.group === b.group) add("group", a.group, x.tag, x.other);
  }
  for (const x of bestM) {
    if (x.s !== CLOSE) continue;
    const a = TAGS.get(x.tag), b = TAGS.get(x.other);
    if (a.group !== b.group) add("link", b.group, x.tag, x.other);
  }
  const loose = bestM.find((x) => x.s === LOOSE);
  return {
    score, shared, points,
    exact: bestM.filter((x) => x.s === EXACT).map((x) => x.tag),
    close: bestM.filter((x) => x.s === CLOSE).map((x) => [x.tag, x.other]),
    looseCat: loose ? TAGS.get(loose.tag).cat : null,
  };
}

function joinAnd(xs) {
  if (xs.length <= 1) return xs[0] || "";
  return xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
}

/** The first line of a clue: what the hunter and their pair have in common. */
export function clueLine(mine, theirs) {
  const c = compare(mine, theirs);
  const same = c.points.filter((p) => p.kind !== "link").slice(0, 2).map((p) => GROUPS.get(p.group).clue);
  if (same.length) return `Your pair is into ${joinAnd(same)}, same as you.`;
  const link = c.points.find((p) => p.kind === "link");
  if (link) return `Your pair is into ${GROUPS.get(link.group).clue}, which sits close to your pick of ${TAGS.get(link.mine).label}.`;
  if (c.looseCat) return `You overlap a little. Your pair also picked something under ${CATS.get(c.looseCat).label}.`;
  const first = known(theirs)[0];
  if (first) return `On paper you two share nothing. Your pair is into ${GROUPS.get(TAGS.get(first).group).clue}.`;
  return "Your pair kept their interests to themselves.";
}

/** What two guests share, as labels, for the screen shown after they pair. */
export function sharedLabels(mine, theirs) {
  const c = compare(mine, theirs);
  const label = (t) => TAGS.get(t).label;
  return {
    exact: c.exact.map(label),
    // "Your hiking is close to their climbing" adds nothing if both picked climbing.
    close: c.close.filter(([, t]) => !c.exact.includes(t)).map(([m, t]) => [label(m), label(t)]),
    shared: c.shared,
  };
}

/** FNV-1a, so both phones pick the same prompt and suit for the same ids. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pairId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function promptFor(a, b) {
  const id = pairId(a.id, b.id);
  const first = a.id < b.id ? a : b, second = first === a ? b : a;
  const c = compare(first.interests, second.interests);
  const list = (c.points[0] && PROMPTS[c.points[0].group]) || FALLBACK_PROMPTS;
  return list[hash(id) % list.length];
}

/** Everyone a guest has paired with. Pairs with a guest who left are ignored. */
export function partnersOf(uid, pairs, guestIds) {
  const out = new Set();
  for (const p of pairs) {
    const other = p.a === uid ? p.b : p.b === uid ? p.a : null;
    if (other && (!guestIds || guestIds.has(other))) out.add(other);
  }
  return out;
}

/**
 * Choose who a guest hunts next: their closest match among guests they have
 * not paired with. Guests who have already met many people score a little
 * lower, and near-ties are broken differently for each hunter, so the room
 * does not all chase the same person.
 * Returns {guest, recycled} or null. `recycled` means every remaining guest
 * had been skipped, so the skipped list starts over.
 */
export function pickTarget(me, guests, pairs, opts = {}) {
  const ids = new Set(guests.map((g) => g.id));
  const met = partnersOf(me.id, pairs, ids);
  const pool = guests.filter((g) => g.id !== me.id && !met.has(g.id));
  if (!pool.length) return null;
  const skipped = new Set(me.skipped || []);
  let from = pool.filter((g) => !skipped.has(g.id));
  let recycled = false;
  if (!from.length) {
    recycled = true;
    from = pool.filter((g) => g.id !== opts.avoid);
    if (!from.length) from = pool;
  }
  let top = null;
  for (const g of from) {
    const jitter = (hash(me.id + "|" + g.id) % 1000) / 1000;
    const value = compare(me.interests, g.interests).score
      - 0.05 * partnersOf(g.id, pairs, ids).size
      + 0.12 * jitter;
    if (!top || value > top.value) top = { guest: g, value };
  }
  return { guest: top.guest, recycled };
}

// Consonants only, so a code never spells a word.
const CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";

export function makeCode(taken = new Set(), random = defaultRandom) {
  for (let tries = 0; tries < 200; tries++) {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not make a free code");
}

function defaultRandom() {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

export function cleanCode(text) {
  return (text || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

// A guest's card climbs one rank for each pair they make: 2 up to King, then Ace.
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export function rankFor(pairCount) {
  return RANKS[Math.min(Math.max(pairCount, 0), RANKS.length - 1)];
}

const SUITS = ["spade", "heart", "diamond", "club"];
export function suitFor(uid) {
  return SUITS[hash(uid) % 4];
}

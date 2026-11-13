// The end-of-night awards. Everything is worked out from what the party
// already recorded: who joined, who paired with whom and when, and each
// guest's own tally of wrong guesses, nudges and skips. Pure functions, so
// they can be tested with `node --test`.

import { compare, sharedLabels, TAGS } from "./match.js";

const joinAnd = (xs) => (xs.length <= 1 ? xs[0] || "" : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const clock = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
const ordinal = (n) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return n + "th";
  return n + (["th", "st", "nd", "rd"][n % 10] || "th");
};

/** The guests with the highest value, at least `min`. At most three share an award. */
function top(values, min = 1) {
  let best = -Infinity;
  for (const v of values.values()) if (v > best) best = v;
  if (best < min) return null;
  const ids = [...values].filter(([, v]) => v === best).map(([id]) => id);
  return ids.length <= 3 ? { ids, value: best } : null;
}

/** The largest group in which every guest met every other one. */
function largestCircle(ids, adj) {
  let best = [];
  const grow = (group, candidates, excluded) => {
    if (!candidates.length && !excluded.length) { if (group.length > best.length) best = group; return; }
    for (const v of [...candidates]) {
      const near = adj.get(v);
      grow([...group, v], candidates.filter((x) => near.has(x)), excluded.filter((x) => near.has(x)));
      candidates = candidates.filter((x) => x !== v);
      excluded = [...excluded, v];
    }
  };
  grow([], ids.filter((id) => adj.get(id).size), []);
  return best;
}

/** The two guests the most introductions apart, among those who are linked at all. */
function furthestApart(ids, adj) {
  let best = null;
  for (const start of ids) {
    const dist = new Map([[start, 0]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      for (const next of adj.get(queue[i])) {
        if (!dist.has(next)) { dist.set(next, dist.get(queue[i]) + 1); queue.push(next); }
      }
    }
    for (const [id, d] of dist) if (!best || d > best.steps) best = { a: start, b: id, steps: d };
  }
  return best;
}

/**
 * guests  [{id, name, emoji, interests}]
 * pairs   [{id, a, b, by, at}]
 * stats   {uid: {wrong, nudges, skips}}
 * meId    the guest looking at the awards
 */
export function buildAwards({ guests, pairs, stats = {}, meId }) {
  const byId = new Map(guests.map((g) => [g.id, g]));
  const name = (id) => byId.get(id).name;
  const ids = guests.map((g) => g.id);
  const live = pairs
    .filter((p) => byId.has(p.a) && byId.has(p.b))
    .map((p) => ({ ...p, score: compare(byId.get(p.a).interests, byId.get(p.b).interests).score }))
    .sort((x, y) => x.at - y.at);

  const zero = () => new Map(ids.map((id) => [id, 0]));
  const met = zero(), found = zero(), foundBy = zero(), alike = zero();
  const adj = new Map(ids.map((id) => [id, new Set()]));
  for (const p of live) {
    for (const id of [p.a, p.b]) { met.set(id, met.get(id) + 1); alike.set(id, alike.get(id) + p.score); }
    adj.get(p.a).add(p.b); adj.get(p.b).add(p.a);
    const finder = p.by === p.b ? p.b : p.a, other = finder === p.a ? p.b : p.a;
    found.set(finder, found.get(finder) + 1);
    foundBy.set(other, foundBy.get(other) + 1);
  }

  const awards = [];
  const give = (key, title, who, detail) => awards.push({ key, title, who, detail });

  // ---- people ----
  const connected = top(met, 2);
  if (connected) give("connected", "Most connected", connected.ids, `Met ${plural(connected.value, "guest", "guests")}.`);

  const detective = top(found, 2);
  if (detective) give("detective", "The detective", detective.ids, `Tracked down ${plural(detective.value, "guest", "guests")} from their clues.`);

  const wanted = top(foundBy, 2);
  if (wanted) give("wanted", "Most wanted", wanted.ids, `Found by ${plural(wanted.value, "guest", "guests")}.`);

  // ---- pairs ----
  if (live.length >= 3) {
    const closest = live.reduce((x, y) => (y.score > x.score ? y : x));
    const far = live.reduce((x, y) => (y.score < x.score ? y : x));
    const labels = sharedLabels(byId.get(closest.a).interests, byId.get(closest.b).interests);
    give("closest", "Closest match", [closest.a, closest.b],
      labels.exact.length ? `Both picked ${joinAnd(labels.exact.slice(0, 4))}.` : "The most alike pair in the room.");
    if (far.id !== closest.id) {
      give("unlikeliest", "Unlikeliest pair", [far.a, far.b],
        far.score === 0 ? "Nothing in common on paper, and they found each other anyway." : "The least alike pair to meet all night.");
    }
  }
  if (live.length) {
    const first = live[0], last = live[live.length - 1];
    give("first", "First off the mark", [first.a, first.b], `First pair of the night, at ${clock(first.at)}.`);
    if (live.length >= 4) give("last", "Last call", [last.a, last.b], `Latest pair of the night, at ${clock(last.at)}.`);
  }

  // ---- how people mixed ----
  // The bridge: met at least three guests who mostly had not met each other.
  let bridge = null;
  for (const id of ids) {
    const near = [...adj.get(id)];
    if (near.length < 3) continue;
    let links = 0;
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) if (adj.get(near[i]).has(near[j])) links++;
    const closed = links / ((near.length * (near.length - 1)) / 2);
    if (!bridge || closed < bridge.closed || (closed === bridge.closed && near.length > bridge.size)) bridge = { id, closed, size: near.length };
  }
  if (bridge && bridge.closed < 0.5) give("bridge", "The bridge", [bridge.id], `Met ${bridge.size} guests who mostly had not met each other.`);

  const circle = largestCircle(ids, adj);
  if (circle.length >= 3) give("circle", "Tightest circle", circle, `All ${circle.length} of them met every other one.`);

  const apart = furthestApart(ids, adj);
  if (apart && apart.steps >= 3) give("apart", "Furthest apart", [apart.a, apart.b], `${apart.steps} introductions away from each other.`);

  const average = new Map(ids.filter((id) => met.get(id) >= 3).map((id) => [id, alike.get(id) / met.get(id)]));
  if (average.size >= 2) {
    const sorted = [...average].sort((x, y) => x[1] - y[1]);
    give("opposites", "Opposites attract", [sorted[0][0]], "Kept pairing with the guests least like them.");
    give("feather", "Birds of a feather", [sorted[sorted.length - 1][0]], "Kept finding their own kind.");
  }

  // ---- interests ----
  const picks = new Map();
  for (const g of guests) for (const t of new Set(g.interests || [])) if (TAGS.has(t)) picks.set(t, [...(picks.get(t) || []), g.id]);
  const lone = [...picks].filter(([, who]) => who.length === 1);
  if (lone.length && guests.length >= 4) {
    // One guest, the one with the most picks nobody else made.
    const count = new Map();
    for (const [, [id]] of lone) count.set(id, (count.get(id) || 0) + 1);
    const [winner] = [...count].sort((x, y) => y[1] - x[1])[0];
    const theirs = lone.filter(([, [id]]) => id === winner).map(([t]) => TAGS.get(t).label);
    give("kind", "One of a kind", [winner], `The only guest who picked ${joinAnd(theirs.slice(0, 3))}.`);
  }
  const popular = [...picks].sort((x, y) => y[1].length - x[1].length)[0];
  if (popular && popular[1].length >= 2) give("obsession", "The room’s obsession", [], `${TAGS.get(popular[0]).label}, picked by ${popular[1].length} guests.`);

  // ---- how people played ----
  const stat = (key) => new Map(ids.map((id) => [id, Number(stats[id] && stats[id][key]) || 0]));
  const wrong = stat("wrong"), nudges = stat("nudges"), skips = stat("skips");
  const thirsty = top(wrong, 2);
  if (thirsty) give("thirsty", "Thirstiest", thirsty.ids, `${thirsty.value} wrong guesses, so ${thirsty.value} sips.`);
  const sharp = top(new Map(ids.filter((id) => nudges.get(id) === 0).map((id) => [id, found.get(id)])), 2);
  if (sharp) give("sharp", "Sharp eyes", sharp.ids, `Found ${plural(sharp.value, "guest", "guests")} without a single nudge.`);
  const picky = top(skips, 2);
  if (picky) give("picky", "Hard to please", picky.ids, `Skipped ${picky.value} clues.`);

  // ---- leaderboard: everyone with at least one pair, ties share a place ----
  const board = [];
  for (const id of [...ids].filter((x) => met.get(x) > 0).sort((x, y) => met.get(y) - met.get(x) || name(x).localeCompare(name(y)))) {
    const prev = board[board.length - 1];
    board.push({ id, count: met.get(id), place: prev && prev.count === met.get(id) ? prev.place : board.length + 1 });
  }

  // ---- the room in numbers ----
  const possible = (guests.length * (guests.length - 1)) / 2;
  const quarter = 15 * 60 * 1000;
  const buckets = new Map();
  for (const p of live) { const k = Math.floor(p.at / quarter) * quarter; buckets.set(k, (buckets.get(k) || 0) + 1); }
  const peak = [...buckets].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0];
  const numbers = [
    ["Guests", String(guests.length)],
    ["Pairs made", String(live.length)],
    ["Of every pair that could exist", possible ? Math.round((100 * live.length) / possible) + "%" : "0%"],
    ["Average guests met", guests.length ? ((2 * live.length) / guests.length).toFixed(1) : "0"],
  ];
  if (peak && live.length >= 4) numbers.push(["Busiest 15 minutes", `${clock(peak[0])}, with ${plural(peak[1], "pair", "pairs")}`]);
  const sips = [...wrong.values()].reduce((a, b) => a + b, 0);
  if (sips) numbers.push(["Sips taken for wrong guesses", String(sips)]);

  // ---- the viewer's own night ----
  let mine = null;
  if (meId && byId.has(meId)) {
    const own = live.filter((p) => p.a === meId || p.b === meId);
    const other = (p) => (p.a === meId ? p.b : p.a);
    const entry = board.find((b) => b.id === meId);
    const rows = [];
    if (entry) rows.push(["Your place", `${ordinal(entry.place)} of ${guests.length}`]);
    if (own.length) {
      rows.push(["You found", plural(found.get(meId), "guest", "guests")]);
      rows.push(["Found you", plural(foundBy.get(meId), "guest", "guests")]);
      rows.push(["Closest match", name(other(own.reduce((x, y) => (y.score > x.score ? y : x))))]);
      if (own.length >= 2) rows.push(["Unlikeliest match", name(other(own.reduce((x, y) => (y.score < x.score ? y : x))))]);
    }
    if (wrong.get(meId)) rows.push(["Sips for wrong guesses", String(wrong.get(meId))]);
    const won = awards.filter((a) => a.who.includes(meId)).map((a) => a.title);
    if (won.length) rows.push(["Your awards", joinAnd(won)]);
    mine = {
      lead: own.length ? `You met ${own.length} of ${plural(guests.length - 1, "other guest", "other guests")}.` : "You did not pair with anyone tonight.",
      rows,
    };
  }

  return { awards, board, numbers, mine, pairs: live.length, guests: guests.length };
}

// Stress test for the hosts. Open stress.html, tap Start.
//
// It signs in N guests without Google against the real Firebase project, all
// from this one page, and plays the game with them at once: every guest saves
// a card, listens to the party like a phone does, and pairs with other test
// guests over a few rounds. It then checks that every guest ended up seeing
// the same party, reports timings and database reads, and removes the test
// guests again. Test guests only ever pair with each other.
//
// ?n=40 sets how many guests (2 to 60), ?rounds=3 how many rounds (1 to 6).

import { connect, explain } from "./backend-firebase.js";
import { doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { CATEGORIES, EMOJI } from "./data.js";
import * as M from "./match.js";
import { PARTY, LIMITS } from "./config.js";

const params = new URLSearchParams(location.search);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const N = clamp(Math.floor(Number(params.get("n")) || 40), 2, 60);
const ROUNDS = clamp(Math.floor(Number(params.get("rounds")) || 3), 1, 6);
const FREE_READS = 50000;
const WAIT = 30000;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const now = () => performance.now();
const ms = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + " s" : Math.round(v) + " ms");
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const median = (xs) => (xs.length ? sorted(xs)[Math.floor(xs.length / 2)] : 0);
const slowest = (xs) => (xs.length ? Math.max(...xs) : 0);
const timing = (xs) => (xs.length ? `median ${ms(median(xs))}, slowest ${ms(slowest(xs))}` : "none");
const say = (text) => { $("now").textContent = text; };

$("intro").textContent = `Signs in ${N} guests without Google on the real party database, plays ${ROUNDS} rounds with all of them at once, then removes them. It takes about a minute. Keep this page open until it finishes.`;

// Running this during the party would spend quota the guests need.
const opens = Date.parse(PARTY.huntOpens);
const near = Math.abs(Date.now() - opens) < 12 * 3600 * 1000 || (Date.now() > opens && Date.now() < opens + 24 * 3600 * 1000);
if (near && !params.has("force")) {
  $("warn").hidden = false;
  $("warn").textContent = `The party is within 12 hours. This test uses part of the day’s free database quota, so it is switched off. Add &force=1 to the link if you are sure.`;
  $("start").disabled = true;
  $("start").hidden = true;
}

async function waitFor(check, limit = WAIT) {
  const start = now();
  while (now() - start < limit) {
    if (check()) return now() - start;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

function sample(i) {
  // A spread of 3 to 8 interests per guest, different for each but repeatable.
  const all = CATEGORIES.flatMap((c) => c.groups.flatMap((g) => g.tags.map((t) => t[0])));
  const count = 3 + (M.hash("count" + i) % 6);
  const picked = new Set();
  for (let k = 0; picked.size < count; k++) picked.add(all[M.hash(`tag${i}:${k}`) % all.length]);
  return [...picked];
}

async function run() {
  const bots = [];
  const problems = [];
  const report = { n: N, rounds: ROUNDS };
  const fail = (text) => { problems.push(text); console.error(text); };

  try {
    // 1. Sign in, eight at a time.
    say(`Signing in ${N} guests`);
    const signIn = [];
    for (let from = 0; from < N; from += 8) {
      await Promise.all(Array.from({ length: Math.min(8, N - from) }, (_, k) => from + k).map(async (i) => {
        const t = now();
        try {
          const api = await connect({ name: "stress-" + i, cache: false });
          const account = api.account() || (await api.signInGuest());
          signIn.push(now() - t);
          bots.push({ i, api, uid: account.uid, guests: [], pairs: [], rules: [], reads: 0 });
        } catch (e) {
          const limit = /too-many-requests/.test((e && e.code) || "");
          fail(`Guest ${i + 1} could not sign in: ${limit ? "Firebase allows 100 new sign-ups an hour from one network, and this network has used them. Wait an hour." : explain(e, "guest")}`);
        }
      }));
    }
    report.signedIn = bots.length;
    report.signIn = signIn;
    if (bots.length < 2) throw new Error("Not enough guests signed in to play.");
    const ids = new Set(bots.map((b) => b.uid));

    // 2. Every guest listens to the party, as a phone does.
    for (const b of bots) {
      b.stop = b.api.watch({
        onGuests(list, meta) { b.guests = list; b.reads += meta.changes || 0; },
        onPairs(list, meta) { b.pairs = list; b.reads += meta.changes || 0; },
        onRules(list, meta) { b.rules = list; b.reads += meta.changes || 0; },
        onError(message) { fail(`Guest ${b.i + 1} lost the party: ${message}`); },
      });
    }

    // 3. Everyone saves a card in the same instant.
    say(`Saving ${bots.length} cards at once`);
    const taken = new Set();
    const cards = [];
    const joinStart = now();
    await Promise.all(bots.map(async (b) => {
      const code = M.makeCode(taken);
      taken.add(code);
      b.card = { name: `Test ${b.i + 1}`, emoji: EMOJI[b.i % EMOJI.length], interests: sample(b.i), fact: `Test guest ${b.i + 1}, made by the stress test.`, code };
      const t = now();
      try { await b.api.saveGuest(b.card); cards.push(now() - t); b.joined = true; }
      catch (e) { fail(`Guest ${b.i + 1} could not save a card: ${explain(e)}`); }
    }));
    report.cards = cards;
    const sawAll = await waitFor(() => bots.every((b) => [...ids].every((id) => b.guests.some((g) => g.id === id))));
    report.sawCards = sawAll === null ? null : now() - joinStart;
    if (sawAll === null) fail(`After ${WAIT / 1000} seconds some guests still could not see every card.`);

    // 4. Rounds: every guest picks their closest unmet test guest and pairs, all at once.
    const pairWrites = [], spread = [];
    const made = new Map();
    let doubles = 0;
    for (let r = 1; r <= ROUNDS; r++) {
      say(`Round ${r} of ${ROUNDS}: everyone pairs at once`);
      const roundStart = now();
      const wanted = new Set();
      await Promise.all(bots.filter((b) => b.joined).map(async (b) => {
        const mine = b.guests.find((g) => g.id === b.uid);
        const pick = mine && M.pickTarget({ ...mine, skipped: [] }, b.guests.filter((g) => ids.has(g.id)), b.pairs);
        if (!pick) return;
        const other = pick.guest;
        const id = M.pairId(b.uid, other.id);
        const [a, c] = b.uid < other.id ? [b.uid, other.id] : [other.id, b.uid];
        const unlock = M.compare(mine.interests, other.interests).shared >= LIMITS.sharedForRule;
        wanted.add(id);
        const t = now();
        try {
          await b.api.createPair({ id, a, b: c, by: b.uid, unlock });
          pairWrites.push(now() - t);
          if (!made.has(id)) made.set(id, { by: b, unlock });
        } catch (e) {
          // Two guests picked each other in the same instant: one write wins.
          b.lost = (b.lost || new Map()).set(id, e);
        }
      }));
      const seen = await waitFor(() => bots.every((b) => [...wanted].every((id) => b.pairs.some((p) => p.id === id))));
      if (seen === null) fail(`Round ${r}: after ${WAIT / 1000} seconds some guests could not see every new pair.`);
      else spread.push(now() - roundStart);
      for (const b of bots) {
        for (const [id, e] of b.lost || []) {
          if (bots[0].pairs.some((p) => p.id === id)) doubles++;
          else fail(`Guest ${b.i + 1} could not save a pair: ${explain(e)}`);
        }
        b.lost = null;
      }
    }
    report.pairWrites = pairWrites;
    report.spread = spread;
    report.doubles = doubles;

    // 5. Pairs that earned a house rule write one.
    say("Writing house rules");
    const pairsNow = new Map(bots[0].pairs.map((p) => [p.id, p]));
    const earners = [...made].filter(([id, m]) => m.unlock && pairsNow.get(id) && pairsNow.get(id).by === m.by.uid);
    let rulesOk = 0;
    await Promise.all(earners.map(async ([id, m], k) => {
      try { await m.by.api.saveRule(id, { text: `Test rule ${k + 1}, made by the stress test.`, by: m.by.uid }); rulesOk++; m.rule = true; }
      catch (e) { fail(`A house rule could not be saved: ${explain(e)}`); }
    }));
    const rulesSeen = await waitFor(() => bots.every((b) => earners.every(([id, m]) => !m.rule || b.rules.some((x) => x.id === id))));
    if (rulesSeen === null) fail("Some guests could not see every house rule.");
    report.rules = rulesOk;

    // 6. Does every guest see the same party?
    const view = (b) => JSON.stringify([
      b.guests.filter((g) => ids.has(g.id)).map((g) => g.id + g.code).sort(),
      b.pairs.filter((p) => ids.has(p.a) && ids.has(p.b)).map((p) => p.id).sort(),
      b.rules.filter((x) => made.has(x.id)).map((x) => x.id).sort(),
    ]);
    const first = view(bots[0]);
    report.agree = bots.every((b) => view(b) === first);
    if (!report.agree) fail("Guests ended up seeing different parties.");
    report.pairs = bots[0].pairs.filter((p) => ids.has(p.a) && ids.has(p.b)).length;
    report.codes = new Set(bots[0].guests.filter((g) => ids.has(g.id)).map((g) => g.code)).size;
    report.reads = bots.reduce((sum, b) => sum + b.reads, 0);
  } catch (e) {
    fail(e && e.message ? e.message : String(e));
  }

  // 7. Tidy up, whatever happened.
  say("Removing the test guests");
  const left = { docs: 0, cards: 0, accounts: 0 };
  for (const b of bots) b.stop && b.stop();
  const owned = new Map();
  for (const b of bots) for (const p of b.pairs) if (p.by === b.uid && !owned.has(p.id)) owned.set(p.id, b);
  await Promise.all([...owned].map(async ([id, b]) => {
    for (const col of ["rules", "pairs"]) {
      if (col === "rules" && !b.rules.some((x) => x.id === id)) continue;
      try { await deleteDoc(doc(b.api.db, col, id)); } catch { left.docs++; }
    }
  }));
  await Promise.all(bots.map(async (b) => {
    try { await b.api.deleteGuest(); } catch { left.cards++; }
    try { await b.api.removeAccount(); } catch { left.accounts++; }
  }));
  report.left = left;
  report.problems = problems;
  show(report);
}

function show(r) {
  const ok = r.problems.length === 0;
  const row = (label, value) => `<li class="rows__row"><p class="label">${esc(label)}</p><p>${esc(value)}</p></li>`;
  const rows = [];
  if (r.signIn) rows.push(row("Guests signed in", `${r.signedIn} of ${r.n} (${timing(r.signIn)})`));
  if (r.cards) rows.push(row("Cards saved at once", `${r.cards.length} of ${r.signedIn} (${timing(r.cards)})`));
  if (r.sawCards !== undefined) rows.push(row("Every guest could see every card after", r.sawCards === null ? "never, within 30 seconds" : ms(r.sawCards)));
  if (r.pairWrites) rows.push(row(`Pairs made in ${r.rounds} rounds`, `${r.pairs} (${timing(r.pairWrites)})`));
  if (r.doubles !== undefined) rows.push(row("Two guests entering each other’s code in the same instant", `${r.doubles}, all handled`));
  if (r.spread && r.spread.length) rows.push(row("Every guest could see a round’s pairs after", `slowest round ${ms(slowest(r.spread))}`));
  if (r.rules !== undefined) rows.push(row("House rules written", String(r.rules)));
  if (r.codes !== undefined) rows.push(row("Codes", r.codes === r.signedIn ? "all different" : `${r.signedIn - r.codes} shared a code`));
  if (r.agree !== undefined) rows.push(row("Every guest ended up seeing the same party", r.agree ? "Yes" : "No"));
  if (r.reads !== undefined) rows.push(row("Database reads this run used", `${r.reads.toLocaleString("en-US")} of the ${FREE_READS.toLocaleString("en-US")} free each day`));
  const tidy = [];
  if (r.left) {
    tidy.push(r.left.cards || r.left.accounts ? `${r.left.cards} test cards and ${r.left.accounts} test sign-ins could not be removed.` : "All test cards and sign-ins were removed.");
    if (r.left.docs) tidy.push(`${r.left.docs} test pair and rule documents are left, because the database rules stop guests deleting those. Delete the pairs and rules collections in the Firebase console before the party.`);
    rows.push(row("Clean-up", tidy.join(" ")));
  }
  $("report").innerHTML = `<h2>${ok ? "Passed" : `Failed, with ${r.problems.length} ${r.problems.length === 1 ? "problem" : "problems"}`}</h2>
    ${ok ? "" : `<ol class="rows">${r.problems.slice(0, 12).map((p) => `<li class="rows__row"><p class="field__error">${esc(p)}</p></li>`).join("")}</ol>`}
    <ol class="rows" style="margin-top:16px">${rows.join("")}</ol>`;
  say(ok ? "Finished." : "Finished with problems. Send a screenshot of this page.");
  window.__stress = r;
  document.body.dataset.done = ok ? "pass" : "fail";
}

$("start").addEventListener("click", () => {
  $("start").disabled = true;
  $("start").hidden = true;
  run();
});

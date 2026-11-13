// Pairs: screens, state and actions.

import { PARTY, LIMITS, SIGN_IN } from "./config.js";
import { CATEGORIES, EMOJI } from "./data.js";
import * as M from "./match.js";
import { createWeb } from "./web.js";
import { buildAwards } from "./awards.js";

// ---------- small helpers ----------

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const joinAnd = (xs) => (xs.length <= 1 ? xs[0] || "" : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

function store(kind) {
  try { return window[kind]; } catch { return null; }
}
const readStore = (kind, key) => { try { return store(kind)?.getItem(key) ?? null; } catch { return null; } };
const writeStore = (kind, key, value) => { try { store(kind)?.setItem(key, value); } catch { /* private mode */ } };

const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");
if (params.has("preview")) writeStore("sessionStorage", "pairs-preview", "1");
// ?demo=1&locked=1 shows the demo with the hunt still locked.
const PREVIEW = (DEMO && !params.has("locked")) || params.has("preview") || (!DEMO && readStore("sessionStorage", "pairs-preview") === "1");

const TABS = ["hunt", "web", "rules", "me"];
// Opening the site once with ?host=1 turns on the host controls on this phone.
if (params.has("host")) writeStore("localStorage", "pairs-host", "1");
const HOST = DEMO || params.has("host") || readStore("localStorage", "pairs-host") === "1";

// Google refuses to sign people in inside the browsers built into other apps.
const UA = navigator.userAgent;
const IN_APP = /; wv\)|FBAN|FBAV|Instagram|Line\//.test(UA) || (/iPhone|iPad|iPod/.test(UA) && !/Safari\//.test(UA));

// ---------- state ----------

const S = {
  phase: "loading", // loading | error | welcome | join | app
  error: "",
  uid: null,
  account: null, // { uid, google, name }
  authMsg: "",
  authBusy: false,
  guests: [], pairs: [], rules: [],
  got: { guests: false, pairs: false },
  pendingMe: null,
  tab: [...TABS, "awards"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "hunt",
  party: {}, // { awards: true } once the hosts reveal the awards
  awardsPreview: false,
  announce: false,
  stats: {},
  statsAt: 0,
  join: blankJoin(),
  draft: { code: "", rules: {} },
  huntMsg: "",
  sheet: null, // { other, role }
  help: false,
  selected: null,
  leaving: false,
  revealed: false,
  toast: "",
};

let backend = null;
let web = null;
let explain = () => "Something went wrong. Reload the page to try again.";

function blankJoin() {
  return { step: 0, name: "", emoji: "", interests: [], fact: "", editing: false, err: {} };
}

const me = () => S.guests.find((g) => g.id === S.uid) || S.pendingMe;
const guestIds = () => new Set(S.guests.map((g) => g.id));
const livePairs = () => { const ids = guestIds(); return S.pairs.filter((p) => ids.has(p.a) && ids.has(p.b)); };
const metSet = (uid = S.uid) => M.partnersOf(uid, S.pairs, guestIds());
const guest = (id) => S.guests.find((g) => g.id === id);
const huntOpenForAll = () => Boolean(S.party.started) || Date.now() >= Date.parse(PARTY.huntOpens);
const huntOpen = () => PREVIEW || huntOpenForAll();
// Party rules: the first few pairs who picked the same interests each add one rule for the room.
const earnsRule = (a, b) => M.compare(a.interests, b.interests).exact.length >= LIMITS.identicalForRule;
function shownRules() {
  const live = new Set(livePairs().map((p) => p.id));   // a rule shows only while both its guests are still here
  return S.rules.filter((r) => live.has(r.id)).sort((a, b) => a.at - b.at).slice(0, LIMITS.maxRules);
}
const rulesFull = () => shownRules().length >= LIMITS.maxRules;
const awardsRevealed = () => Boolean(S.party.awards) || (PARTY.awardsAt ? Date.now() >= Date.parse(PARTY.awardsAt) : false);
const awardsOn = () => awardsRevealed() || S.awardsPreview;
const tabs = () => (awardsOn() ? [...TABS, "awards"] : TABS);
// Wrong guesses, nudges and skips are tallied for the awards. A failed tally never bothers the guest.
const tally = (key) => { try { Promise.resolve(backend.bumpStat && backend.bumpStat(key)).catch(() => {}); } catch { /* not counted */ } };

// Where a guest is in the hunt is kept on their phone, not in the database:
// nobody else needs it, and every database change is re-read by every phone.
let hunt = { target: null, hints: 0, skipped: [] };
const huntKey = () => "pairs-hunt:" + S.uid;
function loadHunt() {
  hunt = { target: null, hints: 0, skipped: [] };
  try {
    const saved = JSON.parse(readStore("localStorage", huntKey()) || "null");
    if (saved && typeof saved === "object") {
      hunt = { target: saved.target || null, hints: Number(saved.hints) || 0, skipped: Array.isArray(saved.skipped) ? saved.skipped : [] };
    }
  } catch { /* start fresh */ }
}
function setHunt(change) {
  hunt = { ...hunt, ...change };
  writeStore("localStorage", huntKey(), JSON.stringify(hunt));
}

function currentTarget() {
  const m = me();
  if (!m || !hunt.target) return null;
  const t = guest(hunt.target);
  return t && !metSet().has(t.id) ? t : null;
}

// ---------- pieces of markup ----------

const SUIT_PATHS = {
  heart: "M12 21s-7.5-4.6-9.3-9.6C1.4 7.6 3.9 4 7.4 4c1.9 0 3.6 1 4.6 2.6C13 5 14.7 4 16.6 4c3.5 0 6 3.6 4.7 7.4C19.5 16.4 12 21 12 21z",
  diamond: "M12 2l7.5 10L12 22 4.5 12z",
  spade: "M12 2S3.5 8.6 3.5 13.6c0 2.6 2 4.4 4.3 4.4 1.3 0 2.4-.5 3.2-1.4L10 22h4l-1-5.4c.8.9 1.9 1.4 3.2 1.4 2.3 0 4.3-1.8 4.3-4.4C20.5 8.6 12 2 12 2z",
  club: "M12 2.5a4.2 4.2 0 0 0-3.9 5.8 4.2 4.2 0 1 0 2.8 6.7L10 21.5h4l-.9-6.5a4.2 4.2 0 1 0 2.8-6.7A4.2 4.2 0 0 0 12 2.5z",
};
const suitSvg = (suit) => `<svg class="suit suit--${suit}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT_PATHS[suit]}"/></svg>`;
const suitName = { heart: "hearts", diamond: "diamonds", spade: "spades", club: "clubs" };

const ICONS = {
  hunt: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  web: '<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="9" r="2.5"/><circle cx="11" cy="18" r="2.5"/><path d="M8.4 7.6l7.2 1M7 9.3l3 6.4M16.6 11l-4 5"/>',
  rules: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
  me: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="10" r="2.5"/><path d="M8.5 16.5c.8-1.6 2-2.4 3.5-2.4s2.7.8 3.5 2.4"/>',
};
ICONS.awards = '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>';
ICONS.help = '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.3 1-1.3 1.9"/><path d="M12 16.9v.1"/>';
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const MARK = '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12h10"/><circle cx="5.5" cy="12" r="3.5"/><circle cx="18.5" cy="12" r="3.5"/></svg>';

const face = (g) => esc(String(g?.emoji || "").slice(0, 8));

function cardHtml(g, { small = false } = {}) {
  const suit = M.suitFor(g.id);
  const rank = M.rankFor(metSet(g.id).size);
  const corner = `<span class="pcard__corner"><b>${rank}</b>${suitSvg(suit)}</span>`;
  return `<div class="pcard pcard--face${small ? " pcard--small" : ""}" role="img" aria-label="${esc(g.name)}, the ${rank} of ${suitName[suit]}">
    ${corner}<span class="pcard__face">${face(g)}</span><span class="pcard__name">${esc(g.name)}</span>${small ? "" : corner.replace("pcard__corner", "pcard__corner pcard__corner--foot")}
  </div>`;
}

function sharedSentence(mine, theirs) {
  const s = M.sharedLabels(mine, theirs);
  const parts = [];
  if (s.exact.length) parts.push(`You both picked ${joinAnd(s.exact)}.`);
  for (const [m, t] of s.close.slice(0, s.exact.length ? 1 : 2)) parts.push(`Your ${m} sits close to their ${t}.`);
  return parts.join(" ") || "You share no interests on paper.";
}

function countdown() {
  const ms = Date.parse(PARTY.huntOpens) - Date.now();
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d) return `${plural(d, "day", "days")} and ${plural(h, "hour", "hours")}`;
  if (h) return `${plural(h, "hour", "hours")} and ${plural(m, "minute", "minutes")}`;
  return plural(m, "minute", "minutes");
}

// ---------- views ----------

function viewTop() {
  const m = S.phase === "app" ? me() : null;
  const right = m
    ? `<span class="top__right"><span class="top__code"><span class="label">Your code</span><b class="mono">${esc(m.code)}</b></span>
        <button class="top__help" data-act="help" aria-label="How to play">${icon("help")}</button></span>`
    : `<span class="label">${esc(PARTY.title)}</span>`;
  return `<div class="wrap top__in"><span class="brand">${MARK}Pairs</span>${right}</div>`;
}

function viewTabs() {
  if (S.phase !== "app") return "";
  const names = { hunt: "Hunt", web: "Web", rules: "Rules", me: "Me", awards: "Awards" };
  return `<div class="wrap tabs__in">${tabs().map((t) =>
    `<button class="tab" data-act="tab" data-tab="${t}"${S.tab === t ? ' aria-current="page"' : ""}>${icon(t)}<span>${names[t]}</span></button>`).join("")}</div>`;
}

function viewLoading() {
  return `<div class="wrap view view--centre"><p class="lead" role="status">Finding the party</p></div>`;
}

function viewError() {
  return `<div class="wrap view">
    <h1>The party won’t load</h1>
    <p class="lead">${esc(S.error)}</p>
    <button class="btn btn--primary" data-act="reload">Reload the page</button>
  </div>`;
}

const authNote = () => `<p class="field__error" role="status">${esc(S.authMsg)}</p>`;
const canGoogle = () => Boolean(backend && backend.canGoogle);

// The rules in four lines, each marked like the corner of a playing card.
const STEPS = [
  ["spade", "Make your card", "A face, a few interests, one secret fact."],
  ["heart", "Get a clue", "It points to the guest most like you and shows their secret fact."],
  ["club", "Find them and swap a code", "Ask around, then type their 4-letter code. A wrong guess costs a sip."],
  ["diamond", "Meet the room", `Every pair joins the guest web. The first ${LIMITS.maxRules} pairs with two picks in common add a party rule.`],
];
function howToPlay(heading = true) {
  return `${heading ? `<p class="label steps__head">How to play</p>` : ""}
    <ol class="steps">${STEPS.map(([suit, title, text], i) => `<li class="steps__row">
      <span class="steps__mark" aria-hidden="true"><b>${i + 1}</b>${suitSvg(suit)}</span>
      <div><p class="steps__title">${esc(title)}</p><p class="note">${esc(text)}</p></div></li>`).join("")}</ol>`;
}

function viewWelcome() {
  return `<div class="wrap view view--welcome">
    <p class="label">${esc(PARTY.huntOpensLabel)}</p>
    <h1>Pairs, the party game</h1>
    <p class="lead">Find the guests you have the most in common with.</p>
    ${howToPlay()}
    ${IN_APP ? `<p class="banner">Google sign-in is blocked inside app browsers like this one. Open this page in Safari or Chrome first.</p>` : ""}
    <div class="btn-col">
      <button class="btn btn--primary" data-act="google">Continue with Google</button>
      ${SIGN_IN.allowGuests ? `<button class="btn btn--secondary" data-act="guest">Join without Google</button>` : ""}
    </div>
    ${authNote()}
    <p class="note">${SIGN_IN.allowGuests
      ? "With Google, your card follows you to any phone or browser. Without it, your card stays in this browser only."
      : "Your card follows your Google account to any phone or browser."}</p>
  </div>`;
}

const err = (key) => `<p class="field__error" id="${key}-err">${esc(S.join.err[key] || "")}</p>`;

function viewJoin() {
  const j = S.join;
  const stepLabel = `<p class="label">Step ${j.step + 1} of 3</p>`;
  let body = "";
  if (j.step === 0) {
    body = `${stepLabel}
      <h1>${j.editing ? "Edit your card" : "Make your card"}</h1>
      <p class="lead">Pairs is the party game for ${esc(PARTY.title)}. Make a card, get clues, and find the guests you have the most in common with.</p>
      <div class="field">
        <label for="name">First name</label>
        <input id="name" data-draft="join.name" type="text" maxlength="${LIMITS.nameMax}" autocomplete="given-name" autocapitalize="words" enterkeyhint="next" aria-describedby="name-err"${j.err.name ? ' aria-invalid="true"' : ""}>
        ${err("name")}
      </div>
      <fieldset class="field">
        <legend>The face on your card</legend>
        <div class="faces">${EMOJI.map((e) => `<button type="button" class="face" data-act="emoji" data-emoji="${e}" aria-pressed="${j.emoji === e}">${e}</button>`).join("")}</div>
        ${err("emoji")}
      </fieldset>
      ${canGoogle() && !j.editing && !S.account?.google
        ? `<p class="note">Made a card in another browser? <button type="button" class="link link--inline" data-act="google">Sign in with Google</button></p>${authNote()}` : ""}`;
  } else if (j.step === 1) {
    body = `${stepLabel}
      <h1>Pick your interests</h1>
      <p class="lead">Choose ${LIMITS.minInterests} to ${LIMITS.maxInterests}. Close picks count as a match, so rock pairs with metal.</p>
      ${CATEGORIES.map((cat) => `<h2 class="label chips__head">${esc(cat.label)}</h2>
        <div class="chips">${cat.groups.flatMap((g) => g.tags).map(([id, label]) =>
          `<button type="button" class="chip" data-act="interest" data-tag="${id}" aria-pressed="${j.interests.includes(id)}">${esc(label)}</button>`).join("")}</div>`).join("")}`;
  } else {
    body = `${stepLabel}
      <h1>Add one secret fact</h1>
      <p class="lead">Something most guests don’t know about you. It becomes the clue people use to find you.</p>
      <div class="field">
        <label for="fact">Your secret fact</label>
        <textarea id="fact" data-draft="join.fact" rows="3" maxlength="${LIMITS.factMax}" aria-describedby="fact-hint fact-err"${j.err.fact ? ' aria-invalid="true"' : ""}></textarea>
        <p class="field__hint" id="fact-hint">An example: “I was an extra in a film and got cut.” <span id="fact-count">${j.fact.length} of ${LIMITS.factMax}</span></p>
        ${err("fact")}
      </div>`;
  }
  const back = j.step > 0 || j.editing
    ? `<button class="btn btn--secondary" data-act="join-back">${j.step === 0 ? "Cancel" : "Go back"}</button>` : "";
  const nextLabel = j.step < 2 ? "Continue" : j.editing ? "Save my card" : "Join the party";
  const status = j.step === 1
    ? `<p class="actions__status" role="status">${j.err.interests ? esc(j.err.interests) : `${j.interests.length} of ${LIMITS.maxInterests} picked`}</p>` : "";
  return `<form class="wrap view view--join" data-form="join" novalidate>${demoNote()}${body}
    <div class="actions"><div class="wrap">${status}<div class="btn-row">${back}<button class="btn btn--primary" type="submit">${nextLabel}</button></div></div></div>
  </form>`;
}

const demoNote = () => (DEMO ? `<p class="banner">Demo mode. These guests are made up and nothing is saved to the party.</p>` : "");

function viewHunt() {
  const m = me();
  const others = S.guests.filter((g) => g.id !== S.uid);
  const met = metSet();
  const cardBack = `<div class="cardback" aria-hidden="true">${suitSvg("spade")}</div>`;

  if (awardsRevealed()) {
    return `<p class="label">The hunt</p>
      <h1>The game is over</h1>
      <p class="lead">The hosts have called time. You met ${met.size} of ${plural(others.length, "guest", "guests")}.</p>
      ${m ? cardHtml(m) : ""}
      <button class="btn btn--primary" data-act="tab" data-tab="awards">See the awards</button>`;
  }

  if (!huntOpen()) {
    return `<p class="label">The hunt</p>
      <h1>Clues open ${esc(PARTY.huntOpensLabel)}</h1>
      <p class="lead">${countdown()} to go. ${plural(S.guests.length, "guest has", "guests have")} joined so far. Your first clue is dealt from everyone who is in by then.</p>
      ${cardBack}
      <button class="btn btn--secondary" data-act="tab" data-tab="web">See who has joined</button>
      ${howToPlay()}`;
  }
  const preview = PREVIEW && !DEMO && Date.now() < Date.parse(PARTY.huntOpens)
    ? `<p class="banner">Preview. The hunt is unlocked on this phone only until ${esc(PARTY.huntOpensLabel)}.</p>` : "";

  const target = currentTarget();
  if (!target) {
    const left = others.filter((g) => !met.has(g.id)).length;
    if (!others.length) {
      return `${preview}<p class="label">The hunt</p>
        <h1>You’re the first guest in</h1>
        <p class="lead">Clues start when more guests join. Send the link around.</p>${cardBack}`;
    }
    if (!left) {
      return `${preview}<p class="label">The hunt</p>
        <h1>You have met every guest</h1>
        <p class="lead">All ${others.length} of them. New guests show up here when they join.</p>
        ${cardHtml(m)}
        <button class="btn btn--secondary" data-act="tab" data-tab="web">See the guest web</button>`;
    }
    return `${preview}<p class="label">Clue ${met.size + 1}</p>
      <h1>${met.size ? "Your next clue is ready" : "Your first clue is ready"}</h1>
      <p class="lead">Each clue points to the guest whose interests sit closest to yours. Find them, ask for their code and type it in.</p>
      ${cardBack}
      <button class="btn btn--primary" data-act="deal">Deal my clue</button>
      <p class="note">You have met ${met.size} of ${plural(others.length, "guest", "guests")}.</p>`;
  }

  const hints = Math.min(hunt.hints, 2);
  const nudges = [
    hints >= 1 ? `<p class="pcard__row"><span class="label">The face on their card</span><span class="pcard__big">${face(target)}</span></p>` : "",
    hints >= 2 ? `<p class="pcard__row"><span class="label">Their name starts with</span><span class="pcard__big">${esc(target.name.trim().charAt(0).toUpperCase())}</span></p>` : "",
  ].join("");
  return `${preview}<p class="label">Clue ${met.size + 1}</p>
    <h1>Find this guest</h1>
    <article class="pcard pcard--clue">
      <p class="pcard__lead">${esc(M.clueLine(m.interests, target.interests))}</p>
      <p class="pcard__row"><span class="label">Their secret fact</span><span class="pcard__quote">“${esc(target.fact)}”</span></p>
      ${nudges}
    </article>
    <form class="codeform" data-form="code" novalidate>
      <div class="field">
        <label for="code">Their code</label>
        <input id="code" class="mono code" data-draft="code" type="text" inputmode="text" maxlength="4" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-describedby="code-err">
        <p class="field__error" id="code-err" role="status">${esc(S.huntMsg)}</p>
      </div>
      <button class="btn btn--primary" type="submit">Check their code</button>
    </form>
    <div class="btn-row btn-row--split">
      ${hints < 2 ? `<button class="btn btn--secondary" data-act="nudge">Get a nudge</button>` : ""}
      <button class="btn btn--secondary" data-act="skip">Skip this guest</button>
    </div>
    <p class="note">Think you’ve found them? Ask for the code at the top of their screen. A wrong guess costs you a sip.</p>
    ${DEMO ? `<p class="note">${S.revealed ? `Demo only: the code is <b class="mono">${esc(target.code)}</b>, and it belongs to ${esc(target.name)}.` : `<button class="link" data-act="reveal">Show their code (demo only)</button>`}</p>` : ""}`;
}

function viewWebHead() {
  const n = S.guests.length, p = livePairs().length;
  return `<p class="label">The party so far</p>
    <h1>The guest web</h1>
    <p class="lead">${plural(n, "guest", "guests")}, ${plural(p, "pair", "pairs")}. Red lines are yours.</p>`;
}

function viewWebPanel() {
  const g = S.selected && guest(S.selected);
  if (!g) return `<p class="note">Tap a guest to see who they are.</p>`;
  const m = me();
  const count = metSet(g.id).size;
  const suit = M.suitFor(g.id);
  const head = `<div class="who"><span class="who__face">${face(g)}</span>
    <div><p class="who__name">${esc(g.name)}</p>
    <p class="note">${M.rankFor(count)} of ${suitName[suit]}, has met ${plural(count, "guest", "guests")}</p></div></div>`;
  if (g.id === S.uid) return `${head}<p>This is you.</p>`;
  if (metSet().has(g.id)) return `${head}<p>${esc(sharedSentence(m.interests, g.interests))}</p><p class="quote">“${esc(g.fact)}”</p>`;
  return `${head}<p>Pair with them to see their card.</p>`;
}

function myOpenRules() {
  const written = new Set(S.rules.map((r) => r.id));
  if (rulesFull()) return [];
  return livePairs().filter((p) => p.unlock && (p.a === S.uid || p.b === S.uid) && !written.has(p.id));
}

function viewRules() {
  // The guest who wrote the rule is named first.
  const pairName = (id, by) => {
    const p = S.pairs.find((x) => x.id === id);
    const order = p ? (p.b === by ? [p.b, p.a] : [p.a, p.b]) : [];
    const names = order.map(guest).filter(Boolean).map((g) => g.name);
    return names.length ? joinAnd(names) : "Two guests who left";
  };
  const open = myOpenRules().map((p) => {
    const other = guest(p.a === S.uid ? p.b : p.a);
    return `<form class="ruleform" data-form="rule" data-pair="${esc(p.id)}" novalidate>
      <div class="field">
        <label for="rule-${esc(p.id)}">Your party rule with ${esc(other.name)}</label>
        <textarea id="rule-${esc(p.id)}" data-draft="rule:${esc(p.id)}" rows="2" maxlength="${LIMITS.ruleMax}" aria-describedby="rule-err-${esc(p.id)}"></textarea>
        <p class="field__hint">A rule for everyone here, like “whoever says ‘work’ takes a sip”.</p>
        <p class="field__error" id="rule-err-${esc(p.id)}" role="status">${S.ruleErr === p.id ? "Write the rule first." : ""}</p>
      </div>
      <button class="btn btn--primary" type="submit">Add our rule</button>
    </form>`;
  }).join("");
  const rules = shownRules();
  const list = rules.length
    ? `<ol class="rows">${rules.map((r, i) => `<li class="rows__row rule"><span class="board__place">${i + 1}</span>
        <div><p class="rows__text">${esc(r.text)}</p><p class="note">${esc(pairName(r.id, r.by))}</p></div></li>`).join("")}</ol>`
    : `<p class="note">No party rules yet.</p>`;
  return `<p class="label">For the whole room</p>
    <h1>Party rules</h1>
    <p class="lead">The first ${LIMITS.maxRules} pairs who picked two of the same interests each add one rule for everyone. ${rules.length >= LIMITS.maxRules ? `All ${LIMITS.maxRules} are written.` : `${rules.length} of ${LIMITS.maxRules} written.`}</p>
    ${open}${list}
    <button class="link" data-act="help">See how to play Pairs</button>`;
}

function viewMe() {
  const m = me();
  const met = [...metSet()].map(guest).filter(Boolean);
  const metList = met.length
    ? `<ol class="rows">${met.map((g) => `<li class="rows__row rows__row--who">
        <span class="who__face">${face(g)}</span>
        <div><p class="who__name">${esc(g.name)}</p><p>${esc(sharedSentence(m.interests, g.interests))}</p><p class="quote">“${esc(g.fact)}”</p></div></li>`).join("")}</ol>`
    : `<p class="note">Nobody yet. Your card climbs one rank for each guest you pair with.</p>`;
  const leave = S.leaving
    ? `<p>This deletes your card and your pairs. You can join again with a new one.</p>
       <div class="btn-row btn-row--split"><button class="btn btn--secondary" data-act="leave-yes">Delete my card</button><button class="btn btn--secondary" data-act="leave-no">Keep my card</button></div>`
    : `<button class="link" data-act="leave">Leave the party</button>
       ${S.account?.google ? `<button class="link" data-act="signout">Sign out of Google</button>` : ""}`;
  return `<p class="label">Your card</p>
    <h1>${esc(m.name)}</h1>
    ${cardHtml(m)}
    <p class="lead">Your code is <b class="mono">${esc(m.code)}</b>. Give it to a guest who says they’ve found you.</p>
    <div class="chips chips--static">${m.interests.filter((t) => M.TAGS.has(t)).map((t) => `<span class="chip chip--static">${esc(M.TAGS.get(t).label)}</span>`).join("")}</div>
    <p class="quote">“${esc(m.fact)}”</p>
    <button class="btn btn--secondary" data-act="edit">Edit my card</button>
    ${canGoogle() && !S.account?.google ? `<button class="btn btn--secondary" data-act="google">Save my card to Google</button>
      <p class="note">Your card is tied to this browser. Saving it to Google lets you open it on any phone or browser.</p>${authNote()}` : ""}
    <h2>Guests you have met</h2>
    ${metList}
    ${HOST ? `<h2>Host controls</h2>
      <p class="note">Only phones opened with the host link see this. ${awardsRevealed() ? "The game is over and every guest can see the awards."
        : huntOpenForAll() ? "The hunt is open for every guest." : `The hunt opens by itself ${esc(PARTY.huntOpensLabel)}.`}</p>
      <div class="btn-col btn-col--tight">
        ${awardsRevealed() ? "" : S.party.started && Date.now() < Date.parse(PARTY.huntOpens)
          ? `<button class="btn btn--secondary" data-act="hunt-stop">Close the hunt again</button>`
          : huntOpenForAll() ? "" : `<button class="btn btn--secondary" data-act="hunt-start">Start the hunt now</button>`}
        <button class="btn btn--secondary" data-act="awards-toggle">${S.party.awards ? "Hide the awards and reopen the game" : "End the game and reveal the awards"}</button>
        ${awardsRevealed() ? "" : `<button class="btn btn--secondary" data-act="awards-preview">Preview the awards on this phone</button>`}
      </div>` : ""}
    <div class="leave">${leave}</div>`;
}

function viewHelp() {
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
    <div class="wrap sheet__in">
      <p class="label">${esc(PARTY.title)}</p>
      <h1 id="sheet-h" tabindex="-1">How to play Pairs</h1>
      ${howToPlay(false)}
      <p class="label steps__head">Good to know</p>
      <ol class="steps">
        <li class="steps__row"><p>Stuck on a clue? Get a nudge: first the face on their card, then the first letter of their name. Or skip to another guest.</p></li>
        <li class="steps__row"><p>Your code is at the top of the screen. Give it to a guest who says they’ve found you.</p></li>
        <li class="steps__row"><p>Your card starts as a 2 and climbs one rank for every pair you make, up to an ace.</p></li>
        <li class="steps__row"><p>When the hosts call time, the app hands out awards for the night.</p></li>
      </ol>
      <div class="btn-col"><button class="btn btn--primary" data-act="help-close">Go back to the game</button></div>
    </div>
  </div>`;
}

function viewAnnounce() {
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
    <div class="wrap sheet__in">
      <div class="cardback" aria-hidden="true">${suitSvg("diamond")}</div>
      <p class="label">${esc(PARTY.title)}</p>
      <h1 id="sheet-h" tabindex="-1">The awards are in</h1>
      <p class="lead">See who met the most guests, which pair nobody saw coming, and how your own night went.</p>
      <div class="btn-col"><button class="btn btn--primary" data-act="awards-open">See the awards</button></div>
    </div>
  </div>`;
}

function viewAwards() {
  const a = buildAwards({ guests: S.guests, pairs: S.pairs, stats: S.stats, meId: S.uid });
  const faces = (ids) => (ids.length ? `<span class="faces-row">${ids.slice(0, 6).map((id) => `<span class="who__face">${face(guest(id))}</span>`).join("")}</span>` : "");
  const names = (ids) => joinAnd(ids.map((id) => guest(id).name));
  const mine = a.mine ? `<article class="pcard pcard--clue">
      <p class="label">Your night</p>
      <p class="pcard__lead">${esc(a.mine.lead)}</p>
      ${a.mine.rows.map(([k, v]) => `<p class="pcard__row"><span class="label">${esc(k)}</span><span>${esc(v)}</span></p>`).join("")}
    </article>` : "";
  const awards = a.awards.length
    ? `<ol class="rows">${a.awards.map((w) => `<li class="rows__row">
        <p class="label">${esc(w.title)}</p>
        ${w.who.length ? `<div class="who">${faces(w.who)}<p class="who__name">${esc(names(w.who))}</p></div>` : ""}
        <p${w.who.length ? ' class="note"' : ""}>${esc(w.detail)}</p></li>`).join("")}</ol>`
    : `<p class="note">No pairs yet, so no awards yet.</p>`;
  const shown = a.board.slice(0, 10);
  const own = a.board.find((b) => b.id === S.uid);
  if (own && !shown.includes(own)) shown.push(own);
  const board = shown.length ? `<h2>Leaderboard</h2>
    <ol class="rows">${shown.map((b) => `<li class="rows__row board${b.id === S.uid ? " board--me" : ""}">
      <span class="board__place">${b.place}</span><span class="who__face">${face(guest(b.id))}</span>
      <p class="who__name">${esc(guest(b.id).name)}${b.id === S.uid ? " (you)" : ""}</p>
      <span class="board__count">${plural(b.count, "guest", "guests")}</span></li>`).join("")}</ol>` : "";
  return `${awardsRevealed() ? "" : `<p class="banner">Preview. Guests can’t see this until you reveal the awards from the Me tab.</p>`}
    <p class="label">${esc(PARTY.title)}</p>
    <h1>The awards</h1>
    <p class="lead">${plural(a.pairs, "pair", "pairs")} between ${plural(a.guests, "guest", "guests")}. Here is how the night went.</p>
    ${mine}
    <h2>Awards</h2>
    ${awards}
    ${board}
    <h2>The room in numbers</h2>
    <ol class="rows">${a.numbers.map(([k, v]) => `<li class="rows__row"><p class="label">${esc(k)}</p><p>${esc(v)}</p></li>`).join("")}</ol>`;
}

function loadStats() {
  if (!backend.readStats || Date.now() - S.statsAt < 60000) return;
  S.statsAt = Date.now();
  Promise.resolve(backend.readStats()).then((stats) => { S.stats = stats || {}; render(); }).catch(() => {});
}

function viewSheet() {
  if (S.phase === "app" && !S.sheet && S.announce && awardsRevealed()) return viewAnnounce();
  if (S.phase === "app" && !S.sheet && S.help) return viewHelp();
  if (!S.sheet || S.phase !== "app") return "";
  const m = me(), g = guest(S.sheet.other);
  if (!m || !g) return "";
  const cmp = M.compare(m.interests, g.interests);
  const id = M.pairId(m.id, g.id);
  const canRule = earnsRule(m, g) && !rulesFull() && !S.rules.some((r) => r.id === id);
  const same = M.sharedLabels(m.interests, g.interests).exact;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
    <div class="wrap sheet__in">
      <div class="duo" aria-hidden="true">
        ${cardHtml(m, { small: true })}
        <span class="duo__line"></span>
        ${cardHtml(g, { small: true })}
      </div>
      <p class="label">Pair ${metSet().size + (metSet().has(g.id) ? 0 : 1)}</p>
      <h1 id="sheet-h" tabindex="-1">${S.sheet.role === "finder" ? `You found ${esc(g.name)}` : `${esc(g.name)} found you`}</h1>
      <p class="lead">${esc(sharedSentence(m.interests, g.interests))}</p>
      <div class="sheet__block"><p class="label">Start with this</p><p class="prompt">${esc(M.promptFor(m, g))}</p></div>
      ${S.sheet.role === "finder" ? "" : `<div class="sheet__block"><p class="label">Their secret fact</p><p class="quote">“${esc(g.fact)}”</p></div>`}
      ${canRule ? `<p class="note">You both picked ${esc(joinAnd(same.slice(0, 3)))}, so the two of you add a party rule for the whole room.</p>` : ""}
      <div class="btn-col">
        ${canRule ? `<button class="btn btn--primary" data-act="sheet-rule">Write our party rule</button><button class="btn btn--secondary" data-act="sheet-close">Go back to the hunt</button>`
          : `<button class="btn btn--primary" data-act="sheet-close">Go back to the hunt</button>`}
      </div>
    </div>
  </div>`;
}

// ---------- rendering ----------

const last = new WeakMap();
function patch(node, html) {
  if (!node || last.get(node) === html) return false;
  last.set(node, html);
  node.innerHTML = html;
  return true;
}

function getDraft(key) {
  if (key === "join.name") return S.join.name;
  if (key === "join.fact") return S.join.fact;
  if (key === "code") return S.draft.code;
  if (key.startsWith("rule:")) return S.draft.rules[key.slice(5)] || "";
  return "";
}
function setDraft(key, value) {
  if (key === "join.name") S.join.name = value;
  else if (key === "join.fact") S.join.fact = value;
  else if (key === "code") S.draft.code = value;
  else if (key.startsWith("rule:")) S.draft.rules[key.slice(5)] = value;
}

function render() {
  const main = $("#main");
  const active = document.activeElement;
  const keep = active && active.id && main.contains(active)
    ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;

  document.body.dataset.phase = S.phase;
  if (S.tab === "awards" && !awardsOn()) S.tab = "hunt";
  const announcing = S.announce && awardsRevealed();
  document.body.dataset.sheet = S.sheet || S.help || announcing ? "open" : "";
  patch($("#top"), viewTop());
  patch($("#tabs"), viewTabs());

  let changed = false;
  if (S.phase === "loading") changed = patch(main, viewLoading());
  else if (S.phase === "error") changed = patch(main, viewError());
  else if (S.phase === "welcome") changed = patch(main, viewWelcome());
  else if (S.phase === "join") changed = patch(main, viewJoin());
  else if (!me()) changed = patch(main, viewLoading());
  else if (S.tab === "web") {
    changed = patch(main, `<div class="wrap view view--web">${demoNote()}<div id="web-head"></div><div id="web-canvas"></div><div id="web-panel" aria-live="polite"></div></div>`);
    if (changed) { web = createWeb($("#web-canvas"), selectGuest); }
    patch($("#web-head"), viewWebHead());
    patch($("#web-panel"), viewWebPanel());
    web.update({ guests: S.guests, pairs: S.pairs, meId: S.uid, selected: S.selected });
  } else {
    if (S.tab === "awards") loadStats();
    const body = S.tab === "hunt" ? viewHunt() : S.tab === "rules" ? viewRules() : S.tab === "awards" ? viewAwards() : viewMe();
    changed = patch(main, `<div class="wrap view view--${S.tab}">${demoNote()}${body}</div>`);
  }
  if ((S.tab !== "web" || S.phase !== "app") && web) { web.destroy(); web = null; }

  if (changed) {
    for (const input of main.querySelectorAll("[data-draft]")) input.value = getDraft(input.dataset.draft);
    if (keep) {
      const again = document.getElementById(keep.id);
      if (again) {
        again.focus({ preventScroll: true });
        try { again.setSelectionRange(keep.start, keep.end); } catch { /* not a text field */ }
      }
    }
  }
  patch($("#sheet"), viewSheet());
  enter();
}

// The two entrances: a new clue card settles in, and a new pair draws its line.
let shownTarget = null, shownSheet = null;
function enter() {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rise = [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }];
  const ease = "cubic-bezier(.22, 1, .36, 1)";

  const target = S.phase === "app" && S.tab === "hunt" && huntOpen() ? currentTarget()?.id || null : shownTarget;
  if (target !== shownTarget) {
    shownTarget = target;
    const card = $(".pcard--clue");
    if (card && !still) card.animate(rise, { duration: 420, easing: ease });
  }
  const sheet = S.phase !== "app" ? null : S.sheet ? S.sheet.other : S.announce && awardsRevealed() ? "awards" : S.help ? "help" : null;
  if (sheet !== shownSheet) {
    shownSheet = sheet;
    if (!sheet) return;
    $("#sheet-h")?.focus({ preventScroll: true });
    $(".sheet")?.scrollTo(0, 0);
    if (still) return;
    $(".sheet__in")?.animate(rise, { duration: 360, easing: ease });
    $(".duo__line")?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, delay: 200, easing: ease, fill: "backwards" });
  }
}

function go(tab) {
  if (!tabs().includes(tab)) return;
  S.tab = tab;
  S.leaving = false;
  history.replaceState(null, "", "#" + tab);
  render();
  window.scrollTo(0, 0);
}

function selectGuest(id) {
  S.selected = id === S.selected ? null : id;
  render();
}

function fail(error) {
  S.toast = typeof error === "string" ? error : "That didn’t save. Check your connection and try again.";
  const node = $("#toast");
  node.textContent = S.toast;
  node.hidden = false;
  clearTimeout(fail.timer);
  fail.timer = setTimeout(() => { node.hidden = true; }, 6000);
}
const send = (promise) => Promise.resolve(promise).catch((e) => { console.error(e); fail(); });

// ---------- seen pairs (so "X found you" shows once) ----------

const seenKey = () => "pairs-seen:" + S.uid;
function seen() {
  try { return new Set(JSON.parse(readStore("localStorage", seenKey()) || "[]")); } catch { return new Set(); }
}
function markSeen(ids) {
  const all = seen();
  for (const id of ids) all.add(id);
  writeStore("localStorage", seenKey(), JSON.stringify([...all]));
}

// ---------- reacting to data ----------

let firstLook = true, healing = false;
function reconcile() {
  const m = me();
  if (!m || S.phase !== "app") return;

  // A pair someone else made with this guest: show it once. If several
  // arrive while a sheet is open they wait their turn; after a reload only
  // the newest is shown.
  if (S.got.pairs) {
    const done = seen();
    let fresh = livePairs().filter((p) => (p.a === S.uid || p.b === S.uid) && !done.has(p.id)).sort((x, y) => x.at - y.at);
    if (firstLook && fresh.length > 1) {
      markSeen(fresh.slice(0, -1).map((p) => p.id));
      fresh = fresh.slice(-1);
    }
    firstLook = false;
    if (fresh.length && !S.sheet) {
      const next = fresh[0];
      markSeen([next.id]);
      S.sheet = { other: next.a === S.uid ? next.b : next.a, role: next.by === S.uid ? "finder" : "found" };
    }
  }
  // Two guests who joined in the same instant can draw the same code. The
  // one with the later id quietly takes a new one.
  const real = S.guests.find((g) => g.id === S.uid);
  if (real && !healing && S.guests.some((g) => g.id < S.uid && g.code === real.code)) {
    healing = true;
    send(backend.updateGuest({ code: M.makeCode(new Set(S.guests.map((g) => g.code))) })).finally(() => { healing = false; });
  }
  if (S.selected && !guest(S.selected)) S.selected = null;
}

function onGuests(list, meta) {
  S.guests = list;
  S.got.guests = true;
  const has = list.some((g) => g.id === S.uid);
  if (has) {
    S.pendingMe = null;
    if (S.phase === "loading" || (S.phase === "join" && !S.join.editing)) S.phase = "app";
  } else if (S.phase === "loading" && !meta.fromCache) {
    S.phase = "join";
    if (!S.join.name && S.account?.name) S.join.name = S.account.name.slice(0, LIMITS.nameMax);
  } else if (S.phase === "app" && !S.pendingMe && !meta.fromCache) {
    S.phase = "join";
    S.join = blankJoin();
    S.sheet = null;
  }
  reconcile();
  render();
}

// ---------- actions ----------

const actions = {
  reload: () => location.reload(),
  async google() {
    if (S.authBusy) return;
    S.authBusy = true; S.authMsg = "";
    render();
    try {
      const had = S.uid;
      const result = await backend.signInGoogle();
      if (result && result.clash) {
        // That Google account already owns a card under another sign-in.
        if (S.guests.some((g) => g.id === S.uid)) {
          S.authMsg = "That Google account already has a card. To use it, leave this card first, then sign in with Google.";
        } else {
          await result.switchTo();
          return location.reload();
        }
      } else if (result) {
        if (!had) begin(result);
        else if (result.uid !== had) return location.reload();
        else S.account = result;
      }
    } catch (e) {
      console.error(e);
      S.authMsg = explain(e, "google");
    }
    S.authBusy = false;
    render();
  },
  async guest() {
    if (S.authBusy) return;
    S.authBusy = true; S.authMsg = "";
    try {
      begin(await backend.signInGuest());
    } catch (e) {
      console.error(e);
      S.authMsg = explain(e, "guest");
    }
    S.authBusy = false;
    render();
  },
  async signout() {
    await send(backend.signOut());
    location.reload();
  },
  tab: (el) => go(el.dataset.tab),
  emoji: (el) => { S.join.emoji = el.dataset.emoji; delete S.join.err.emoji; render(); },
  interest(el) {
    const j = S.join, tag = el.dataset.tag;
    delete j.err.interests;
    if (j.interests.includes(tag)) j.interests = j.interests.filter((t) => t !== tag);
    else if (j.interests.length < LIMITS.maxInterests) j.interests = [...j.interests, tag];
    else j.err.interests = `${LIMITS.maxInterests} is the limit. Drop one to add another.`;
    render();
  },
  "join-back"() {
    const j = S.join;
    j.err = {};
    if (j.step > 0) j.step--;
    else if (j.editing) { S.join = blankJoin(); S.phase = "app"; }
    render();
    window.scrollTo(0, 0);
  },
  edit() {
    const m = me();
    S.join = { step: 0, name: m.name, emoji: m.emoji, interests: m.interests.filter((t) => M.TAGS.has(t)), fact: m.fact, editing: true, err: {} };
    S.phase = "join";
    render();
    window.scrollTo(0, 0);
  },
  deal() {
    const pick = M.pickTarget({ ...me(), skipped: hunt.skipped }, S.guests, S.pairs);
    if (!pick) return;
    S.huntMsg = ""; S.draft.code = ""; S.revealed = false;
    setHunt({ target: pick.guest.id, hints: 0, skipped: pick.recycled ? [] : hunt.skipped });
    render();
  },
  nudge() {
    tally("nudges");
    setHunt({ hints: Math.min(2, hunt.hints + 1) });
    render();
  },
  skip() {
    tally("skips");
    const m = me();
    const skipped = [...new Set([...hunt.skipped, hunt.target])];
    const pick = M.pickTarget({ ...m, skipped }, S.guests, S.pairs, { avoid: hunt.target });
    S.draft.code = ""; S.revealed = false;
    S.huntMsg = pick && pick.guest.id === hunt.target ? "They are the only guest left to find." : "";
    setHunt({ target: pick ? pick.guest.id : null, hints: 0, skipped: pick && pick.recycled ? [] : skipped });
    render();
  },
  reveal: () => { S.revealed = true; render(); },
  leave: () => { S.leaving = true; render(); },
  "leave-no": () => { S.leaving = false; render(); },
  "leave-yes"() {
    S.leaving = false;
    S.pendingMe = null;
    setHunt({ target: null, hints: 0, skipped: [] });
    S.sheet = null;
    S.join = blankJoin();
    S.phase = "join";
    send(backend.deleteGuest());
    render();
    window.scrollTo(0, 0);
  },
  "sheet-close": () => { S.sheet = null; S.help = false; reconcile(); go("hunt"); },
  help: () => { S.help = true; render(); },
  "help-close": () => { S.help = false; render(); },
  "awards-open"() {
    S.announce = false;
    writeStore("localStorage", "pairs-awards-seen:" + S.uid, "1");
    go("awards");
  },
  "awards-preview"() {
    S.awardsPreview = true;
    go("awards");
  },
  "awards-toggle"() {
    const on = !S.party.awards;
    // The host who reveals the awards does not need to be told about it.
    if (on) writeStore("localStorage", "pairs-awards-seen:" + S.uid, "1");
    Promise.resolve(backend.setParty({ awards: on })).catch((e) => { console.error(e); fail(explain(e)); });
  },
  "hunt-start"() {
    Promise.resolve(backend.setParty({ started: true })).catch((e) => { console.error(e); fail(explain(e)); });
  },
  "hunt-stop"() {
    Promise.resolve(backend.setParty({ started: false })).catch((e) => { console.error(e); fail(explain(e)); });
  },
  "sheet-rule"() {
    const id = M.pairId(S.uid, S.sheet.other);
    S.sheet = null;
    go("rules");
    document.getElementById("rule-" + id)?.focus();
  },
};

const forms = {
  join() {
    const j = S.join;
    j.err = {};
    if (j.step === 0) {
      j.name = j.name.trim().slice(0, LIMITS.nameMax);
      if (!j.name) j.err.name = "Write your first name.";
      if (!j.emoji) j.err.emoji = "Pick a face for your card.";
      if (!j.err.name && !j.err.emoji) j.step = 1;
    } else if (j.step === 1) {
      if (j.interests.length < LIMITS.minInterests) j.err.interests = `Pick at least ${LIMITS.minInterests} interests.`;
      else j.step = 2;
    } else {
      j.fact = j.fact.trim().slice(0, LIMITS.factMax);
      if (j.fact.length < 3) j.err.fact = "Write one fact about yourself.";
      else return saveCard();
    }
    render();
    const bad = Object.keys(j.err)[0];
    if (bad) document.getElementById(bad)?.focus();
    else window.scrollTo(0, 0);
  },
  code() {
    const m = me(), target = currentTarget();
    if (awardsRevealed()) return;
    const code = M.cleanCode(S.draft.code);
    const say = (text) => { S.huntMsg = text; render(); };
    if (!target) return;
    if (code.length !== 4) return say("Type the 4 letters of their code.");
    if (code === m.code) return say("That’s your own code. Ask your pair for theirs.");
    const g = S.guests.find((x) => x.code === code);
    if (!g) return say("No guest has that code. Check the letters.");
    if (metSet().has(g.id)) return say(`You have already paired with ${g.name}.`);
    if (g.id !== target.id) { tally("wrong"); return say("Not your pair. Take a sip and keep asking."); }

    const id = M.pairId(S.uid, g.id);
    const [a, b] = S.uid < g.id ? [S.uid, g.id] : [g.id, S.uid];
    const unlock = earnsRule(m, g);
    markSeen([id]);
    S.draft.code = ""; S.huntMsg = ""; S.revealed = false;
    S.sheet = { other: g.id, role: "finder" };
    setHunt({ target: null, hints: 0 });
    // If both guests type each other's code in the same second, the database
    // keeps the first and refuses the second. That is fine as long as the pair exists.
    Promise.resolve(backend.createPair({ id, a, b, by: S.uid, unlock })).catch((e) => {
      console.error(e);
      setTimeout(() => { if (!S.pairs.some((p) => p.id === id)) fail(); }, 2500);
    });
    render();
  },
  rule(form) {
    const id = form.dataset.pair;
    const text = (S.draft.rules[id] || "").trim().slice(0, LIMITS.ruleMax);
    if (!text) { S.ruleErr = id; render(); return; }
    S.ruleErr = null;
    delete S.draft.rules[id];
    send(backend.saveRule(id, { text, by: S.uid }));
  },
};

function saveCard() {
  const j = S.join;
  const data = { name: j.name, emoji: j.emoji, interests: j.interests, fact: j.fact };
  if (j.editing) {
    send(backend.updateGuest(data));
  } else {
    const code = M.makeCode(new Set(S.guests.map((g) => g.code)));
    const full = { ...data, code };
    S.pendingMe = { ...full, id: S.uid };
    send(backend.saveGuest(full));
  }
  const wasEditing = j.editing;
  S.join = blankJoin();
  S.phase = "app";
  go(wasEditing ? "me" : "hunt");
}

// ---------- events ----------

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const act = actions[el.dataset.act];
  if (act) { e.preventDefault(); act(el); }
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  forms[form.dataset.form]?.(form);
});

document.addEventListener("input", (e) => {
  const el = e.target;
  const key = el.dataset && el.dataset.draft;
  if (!key) return;
  if (key === "code") {
    const clean = M.cleanCode(el.value);
    if (clean !== el.value) el.value = clean;
  }
  setDraft(key, el.value);
  if (key === "join.name" && S.join.err.name) {
    delete S.join.err.name;
    el.removeAttribute("aria-invalid");
    const note = $("#name-err");
    if (note) note.textContent = "";
  }
  if (key === "join.fact") {
    const count = $("#fact-count");
    if (count) count.textContent = `${el.value.length} of ${LIMITS.factMax}`;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.sheet) actions["sheet-close"]();
  else if (e.key === "Escape" && S.help) actions["help-close"]();
  // Enter in a rule box adds the rule; it is one line of text.
  if (e.key === "Enter" && !e.shiftKey && e.target.matches?.("textarea[data-draft^='rule:']")) {
    e.preventDefault();
    e.target.form?.requestSubmit();
  }
});

window.addEventListener("hashchange", () => {
  const tab = location.hash.slice(1);
  if (tabs().includes(tab) && tab !== S.tab) { S.tab = tab; render(); }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
setInterval(() => { if (S.phase === "app" && S.tab === "hunt" && !document.hidden) render(); }, 30000);

// ---------- start ----------

async function start() {
  render();
  const offline = "Can’t reach the party server. Check your connection and reload.";
  const stop = (message) => { S.phase = "error"; S.error = message; render(); };
  let mod;
  try {
    mod = await import(DEMO ? "./backend-demo.js" : "./backend-firebase.js");
  } catch (e) {
    console.error(e);
    return stop(offline);
  }
  try {
    backend = await mod.connect();
  } catch (e) {
    console.error(e);
    return stop(mod.explain ? mod.explain(e) : offline);
  }
  if (mod.explain) explain = mod.explain;
  if (DEMO) window.__pairsDemo = backend;

  const account = backend.account();
  if (account) begin(account);
  else { S.phase = "welcome"; render(); }
}

/** A guest is signed in: start listening to the party. */
function begin(account) {
  const offline = "Can’t reach the party server. Check your connection and reload.";
  S.account = account;
  S.uid = account.uid;
  loadHunt();
  S.phase = "loading";
  S.authMsg = "";
  render();

  // The hosts' switch for the awards. Everyone gets told once when it flips on.
  if (backend.watchParty) {
    backend.watchParty((state) => {
      S.party = state || {};
      const key = "pairs-awards-seen:" + S.uid;
      if (!S.party.awards) writeStore("localStorage", key, "");
      else if (readStore("localStorage", key) !== "1" && S.tab !== "awards") S.announce = true;
      render();
    });
  }

  backend.watch({
    onGuests,
    onPairs(list) { S.pairs = list; S.got.pairs = true; reconcile(); render(); },
    onRules(list) { S.rules = list; render(); },
    onError(message) {
      if (S.phase === "loading") { S.phase = "error"; S.error = message; render(); } else fail(message);
    },
  });

  // Offline with only cached data: stop waiting after a few seconds.
  setTimeout(() => {
    if (S.phase !== "loading") return;
    if (S.got.guests) S.phase = "join";
    else { S.phase = "error"; S.error = offline; }
    render();
  }, 9000);
}

start();

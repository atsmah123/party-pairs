// Demo backend, used when the link ends in ?demo=1. It runs the whole game
// on one phone with made-up guests, so a host can try it alone. Nothing here
// touches Firebase.

import { pairId, compare } from "./match.js";

const KEY = "pairs-demo-v1";
const ME = "you";

const BOTS = [
  ["Rohan", "\u{1F98A}", ["metal", "climbing", "coffee", "coding", "scifi"], "I can solve a Rubik’s cube behind my back.", "BKTM"],
  ["Hallie", "\u{1F419}", ["indie", "pottery", "tea", "fiction", "thrifting", "cats"], "I have a twin nobody here has met.", "CRVN"],
  ["Wes", "\u{1F996}", ["gridiron", "grilling", "beer", "fantasy", "poker"], "I once ate fourteen tacos on a dare.", "DLPX"],
  ["Ishaan", "\u{1F3B8}", ["rock", "instrument", "cricket", "bollywood", "spicy", "chess"], "I played bass in a wedding band for a year.", "FGHW"],
  ["Corinne", "\u{1FAA9}", ["techno", "dancing", "cocktails", "fashion", "travel"], "I’ve been to nine countries with one backpack.", "GJNS"],
  ["Dev", "\u{1F680}", ["ai", "space", "pcgames", "anime", "coffee", "running"], "I failed my driving test four times.", "HMQT"],
  ["Bex", "\u{1F344}", ["hiking", "camping", "plants", "baking", "photography"], "I keep a sourdough starter older than my degree.", "JPRZ"],
  ["Tunde", "\u{1F3A7}", ["hiphop", "rnb", "basketball", "sneakers", "djing", "movies"], "I DJed my own high school prom.", "KSVB"],
  ["Mireille", "\u{1F989}", ["classical", "museums", "wine", "history", "nonfiction"], "I can read music faster than I read French.", "LTWC"],
  ["Joaquin", "\u{1F6F9}", ["punk", "football", "streetfood", "roadtrips", "karaoke", "memes"], "I broke my wrist skating to an exam.", "MVXD"],
  ["Sana", "\u{1F98B}", ["kpop", "drawing", "boardgames", "tea", "yoga", "dramas"], "I know every word of one very long musical.", "NWZF"],
  ["Gus", "\u{1F920}", ["folk", "diy", "dogs", "trivia", "cook", "fantasy"], "I built the table in my kitchen.", "PXBG"],
].map(([name, emoji, interests, fact, code], i) => ({
  id: "bot" + (i + 1), name, emoji, interests, fact, code, target: i === 2 || i === 9 ? ME : null, hints: 0, skipped: [], at: 1000 + i,
}));

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && Array.isArray(saved.pairs)) return saved;
  } catch { /* no saved demo */ }
  return { me: null, pairs: [], rules: [] };
}

export async function connect() {
  const state = load();
  const subs = { guests: null, pairs: null, rules: null };
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  };
  const emit = () => {
    save();
    subs.guests && subs.guests([...BOTS, ...(state.me ? [state.me] : [])], { fromCache: false });
    subs.pairs && subs.pairs([...state.pairs], { fromCache: false });
    subs.rules && subs.rules([...state.rules], { fromCache: false });
  };
  const later = (fn) => Promise.resolve().then(fn).then(emit);

  const addPair = (x, y, by) => {
    const id = pairId(x.id, y.id);
    if (state.pairs.some((p) => p.id === id)) return null;
    const [a, b] = id.split("_");
    const pair = { id, a, b, by, unlock: compare(x.interests, y.interests).shared >= 2, at: Date.now() };
    state.pairs.push(pair);
    return pair;
  };

  // A few bots have already met when the demo opens, and more pair up while
  // it runs, so the guest web has something to show.
  if (!state.pairs.length) {
    [[0, 5], [1, 10], [3, 9], [4, 7], [6, 11], [2, 11]].forEach(([i, j]) => addPair(BOTS[i], BOTS[j], BOTS[i].id));
    state.rules.push({ id: pairId("bot7", "bot12"), text: "Draw a seven and you speak in questions until the next seven.", by: "bot7", at: Date.now() - 60000 });
  }
  const mingle = setInterval(() => {
    if (state.pairs.filter((p) => p.a !== ME && p.b !== ME).length >= 16) return clearInterval(mingle);
    const i = Math.floor(Math.random() * BOTS.length), j = Math.floor(Math.random() * BOTS.length);
    if (i !== j && addPair(BOTS[i], BOTS[j], BOTS[i].id)) emit();
  }, 9000);

  const api = {
    demo: true,
    canGoogle: false,
    account: () => ({ uid: ME, google: false, name: "" }),
    watch({ onGuests, onPairs, onRules }) {
      subs.guests = onGuests; subs.pairs = onPairs; subs.rules = onRules;
      Promise.resolve().then(emit);
    },
    saveGuest(data) {
      return later(() => { state.me = { ...data, id: ME, at: Date.now() }; });
    },
    updateGuest(patch) {
      return later(() => { if (state.me) Object.assign(state.me, patch); });
    },
    deleteGuest() {
      return later(() => {
        state.me = null;
        state.pairs = state.pairs.filter((p) => p.a !== ME && p.b !== ME);
      });
    },
    createPair(pair) {
      return later(() => {
        if (!state.pairs.some((p) => p.id === pair.id)) state.pairs.push({ ...pair, at: Date.now() });
      });
    },
    saveRule(id, rule) {
      return later(() => {
        state.rules = state.rules.filter((r) => r.id !== id);
        state.rules.push({ ...rule, id, at: Date.now() });
      });
    },
    /** Demo only: one of the made-up guests "finds" the player. */
    botFindsYou() {
      if (!state.me) return;
      const bot = BOTS.find((b) => b.target === ME && !state.pairs.some((p) => p.id === pairId(b.id, ME)));
      if (bot && addPair(bot, state.me, bot.id)) emit();
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch { /* nothing saved */ }
    },
  };
  setTimeout(() => api.botFindsYou(), 60000);
  return api;
}

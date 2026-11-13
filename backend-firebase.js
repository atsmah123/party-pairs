// The live backend: Firebase anonymous sign-in and Cloud Firestore.
// Three collections: guests/{uid}, pairs/{uidA_uidB}, rules/{pairId}.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, linkWithPopup, signInWithCredential, signOut, deleteUser,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, increment, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, SIGN_IN } from "./config.js";

/** Turn a Firebase error into a sentence a host can act on. */
export function explain(err, doing = "") {
  const code = (err && err.code) || "";
  const text = String((err && err.message) || err || "");
  if (code === "auth/unauthorized-domain") {
    return `Firebase doesn’t know this site yet. Add ${location.hostname} under Authentication, Settings, Authorized domains.`;
  }
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the Google window. Allow pop-ups for this page, or open it in Safari or Chrome.";
  }
  if (/auth\/(web-storage-unsupported|operation-not-supported-in-this-environment)/.test(code)) {
    return "This browser can’t do Google sign-in. Open the page in Safari or Chrome.";
  }
  if (/auth\/(configuration-not-found|operation-not-allowed|admin-restricted-operation)/.test(code)) {
    const what = doing === "google" ? "Google sign-in" : "Anonymous sign-in";
    return `${what} is switched off for this Firebase project. Turn it on under Authentication, Sign-in method.`;
  }
  if (code === "permission-denied" || /insufficient permissions/i.test(text)) {
    return "The database refused the request. Check the Firestore rules in the Firebase console.";
  }
  if (code === "not-found" || /database .* does not exist/i.test(text)) {
    return "This Firebase project has no Firestore database yet. Create one in the Firebase console.";
  }
  if (code === "resource-exhausted") {
    return "The free database quota for today is used up. It resets at midnight Pacific time.";
  }
  if (/network|unavailable|offline|failed to fetch/i.test(code + " " + text)) {
    return "Can’t reach the party server. Check your connection and reload.";
  }
  return "Something went wrong talking to the party server. Reload the page to try again.";
}

const millis = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : Date.now());

/**
 * Connect one guest. The app calls this once with no options. The stress test
 * (stress.html) calls it many times in one page: `name` gives each simulated
 * guest a separate sign-in, and `cache: false` skips the on-phone cache.
 */
export async function connect({ name, cache = true } = {}) {
  const app = name ? initializeApp(firebaseConfig, name) : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await auth.authStateReady();
  if (!SIGN_IN.google && !auth.currentUser) await signInAnonymously(auth);
  const uid = () => auth.currentUser.uid;
  const account = () => {
    const u = auth.currentUser;
    if (!u) return null;
    const full = u.displayName || (u.providerData[0] && u.providerData[0].displayName) || "";
    return { uid: u.uid, google: !u.isAnonymous, name: full.trim().split(/\s+/)[0] || "" };
  };

  // A cache on the phone means a reload only downloads what changed.
  let db;
  try {
    db = cache
      ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
      : getFirestore(app);
  } catch {
    db = getFirestore(app);
  }

  const watchAll = (name, cb, onError) =>
    onSnapshot(
      collection(db, name),
      { includeMetadataChanges: true },
      (snap) => cb(
        snap.docs.map((d) => ({ ...d.data(), id: d.id, at: millis(d.data().at) })),
        // `changes` is how many documents this update delivered, which is
        // what Firestore bills as reads.
        { fromCache: snap.metadata.fromCache, changes: snap.docChanges().length },
      ),
      (err) => onError(explain(err)),
    );

  return {
    demo: false,
    canGoogle: SIGN_IN.google,
    account,
    async signInGuest() {
      await signInAnonymously(auth);
      return account();
    },
    /**
     * Sign in with Google. A guest who joined without Google keeps their card:
     * their sign-in is upgraded in place. Resolves to the account, to null if
     * the guest closed the Google window, or to {clash, switchTo} when that
     * Google account already belongs to a different card.
     */
    async signInGoogle() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const current = auth.currentUser;
      try {
        if (current && current.isAnonymous) await linkWithPopup(current, provider);
        else await signInWithPopup(auth, provider);
      } catch (e) {
        if (/auth\/(popup-closed-by-user|cancelled-popup-request|user-cancelled)/.test(e.code || "")) return null;
        if (e.code === "auth/credential-already-in-use") {
          const credential = GoogleAuthProvider.credentialFromError(e);
          return { clash: true, switchTo: () => signInWithCredential(auth, credential) };
        }
        throw e;
      }
      return account();
    },
    signOut() {
      return signOut(auth);
    },
    watch({ onGuests, onPairs, onRules, onError }) {
      const stops = [watchAll("guests", onGuests, onError), watchAll("pairs", onPairs, onError), watchAll("rules", onRules, onError)];
      return () => stops.forEach((stop) => stop());
    },
    /** Add one to this guest's own tally ("wrong", "nudges" or "skips"). Nobody listens to these; they are read once, for the awards. */
    bumpStat(key) {
      return setDoc(doc(db, "stats", uid()), { [key]: increment(1) }, { merge: true });
    },
    async readStats() {
      const snap = await getDocs(collection(db, "stats"));
      const out = {};
      snap.forEach((d) => { out[d.id] = d.data(); });
      return out;
    },
    /** One small document says whether the hosts have revealed the awards. */
    watchParty(cb) {
      return onSnapshot(doc(db, "party", "state"), (snap) => cb(snap.exists() ? snap.data() : {}), () => {});
    },
    setAwards(on) {
      return setDoc(doc(db, "party", "state"), { awards: on, at: serverTimestamp() });
    },
    /** Stress test only: delete this sign-in altogether. */
    removeAccount() {
      return deleteUser(auth.currentUser);
    },
    db,
    saveGuest(data) {
      return setDoc(doc(db, "guests", uid()), { ...data, at: serverTimestamp() });
    },
    updateGuest(patch) {
      return updateDoc(doc(db, "guests", uid()), patch);
    },
    deleteGuest() {
      return deleteDoc(doc(db, "guests", uid()));
    },
    createPair({ id, a, b, by, unlock }) {
      return setDoc(doc(db, "pairs", id), { a, b, by, unlock, at: serverTimestamp() });
    },
    saveRule(pairId, { text, by }) {
      return setDoc(doc(db, "rules", pairId), { text, by, at: serverTimestamp() });
    },
  };
}

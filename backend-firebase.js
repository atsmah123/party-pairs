// The live backend: Firebase anonymous sign-in and Cloud Firestore.
// Three collections: guests/{uid}, pairs/{uidA_uidB}, rules/{pairId}.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

/** Turn a Firebase error into a sentence a host can act on. */
export function explain(err) {
  const code = (err && err.code) || "";
  const text = String((err && err.message) || err || "");
  if (/auth\/(configuration-not-found|operation-not-allowed|admin-restricted-operation)/.test(code)) {
    return "Anonymous sign-in is switched off for this Firebase project. Turn it on under Authentication, Sign-in method.";
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

export async function connect() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  const uid = auth.currentUser.uid;

  // A cache on the phone means a reload only downloads what changed.
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = getFirestore(app);
  }

  const watchAll = (name, cb, onError) =>
    onSnapshot(
      collection(db, name),
      { includeMetadataChanges: true },
      (snap) => cb(
        snap.docs.map((d) => ({ ...d.data(), id: d.id, at: millis(d.data().at) })),
        { fromCache: snap.metadata.fromCache },
      ),
      (err) => onError(explain(err)),
    );

  return {
    uid,
    demo: false,
    watch({ onGuests, onPairs, onRules, onError }) {
      watchAll("guests", onGuests, onError);
      watchAll("pairs", onPairs, onError);
      watchAll("rules", onRules, onError);
    },
    saveGuest(data) {
      return setDoc(doc(db, "guests", uid), { ...data, at: serverTimestamp() });
    },
    updateGuest(patch) {
      return updateDoc(doc(db, "guests", uid), patch);
    },
    deleteGuest() {
      return deleteDoc(doc(db, "guests", uid));
    },
    createPair({ id, a, b, by, unlock }) {
      return setDoc(doc(db, "pairs", id), { a, b, by, unlock, at: serverTimestamp() });
    },
    saveRule(pairId, { text, by }) {
      return setDoc(doc(db, "rules", pairId), { text, by, at: serverTimestamp() });
    },
  };
}

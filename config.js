// Party settings. Change these to reuse the app for another night.

// Firebase web config. This is not a secret: it only identifies the project.
// Access is controlled by the rules in firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyAXywABAaEXc3AthO25demChxJaim5KmRk",
  authDomain: "project-pairs-e3634.firebaseapp.com",
  projectId: "project-pairs-e3634",
  storageBucket: "project-pairs-e3634.firebasestorage.app",
  messagingSenderId: "703114518121",
  appId: "1:703114518121:web:0ae54b42ed992b7fc50cf8",
};

// How guests sign in.
// google: true      a "Continue with Google" button, so a card follows the
//                   guest to any phone or browser signed in to that account.
// allowGuests: true also offers "Join without Google". Those cards live in one
//                   browser only. Set it to false to make Google the only way in.
export const SIGN_IN = { google: true, allowGuests: true };

export const PARTY = {
  title: "Atharva and Tabitha’s 24th",
  // Clues stay locked until this moment, so early sign-ups all start together.
  // Add ?preview=1 to the link to try the hunt before then.
  huntOpens: "2026-11-14T21:00:00-05:00",
  huntOpensLabel: "Saturday 14 Nov at 9:00pm",
  cardGame: "Kings",
  // The awards appear when a host taps "Reveal the awards" (open the site once
  // with ?host=1 to get that button). To reveal them at a set time as well,
  // put a time here, for example "2026-11-15T00:30:00-05:00".
  awardsAt: null,
};

export const LIMITS = {
  minInterests: 3,
  maxInterests: 8,
  nameMax: 24,
  factMax: 140,
  ruleMax: 140,
  sharedForRule: 2,
};

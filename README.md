# Pairs

A party game for Atharva and Tabitha's 24th. Each guest makes a card, gets clues about the guest whose interests sit closest to theirs, finds that person in the room and swaps a 4-letter code. Every confirmed pair draws a line on a shared web of guests.

It is a static site (GitHub Pages) with Firebase for sign-in and shared data. There is no build step.

## Links

| Link | What it does |
| --- | --- |
| `https://atsmah123.github.io/party-pairs/` | The party. Send this one to guests. |
| `.../party-pairs/?preview=1` | Unlocks the hunt on your phone before the party starts, so you can test with a friend. |
| `.../party-pairs/?demo=1` | Runs the whole game on one phone with twelve made-up guests. Touches nothing in Firebase. |
| `.../party-pairs/stress.html` | Stress test for the hosts. See below. |

## How the game works

1. **Card.** A guest picks a name, a face, 3 to 8 interests and one secret fact. They get a 4-letter code.
2. **Clue.** From 9:00pm on Saturday 14 Nov, "Deal my clue" picks their closest match among guests they have not met. The clue says what the two have in common (kept vague: "loud guitar music", not "Metal") and shows the other guest's secret fact. Two nudges are available: the face on the other guest's card, then the first letter of their name.
3. **Pair.** When they think they have found the guest, they ask for the code at the top of that guest's screen and type it in. A right code pairs them on both phones and gives them something to talk about. A wrong one costs a sip.
4. **House rule.** A pair that shares two or more interests adds one house rule for Kings. Rules sit in a list everyone can read out.
5. **Rank.** A guest's card starts as a 2 and climbs one rank per pair, up to an ace.

Matching uses a tree of interests in `data.js`: the same tag scores 1, tags in the same group score 0.7 (rock and metal), tags in the same category score 0.3.

## One-time Firebase setup

In the [Firebase console](https://console.firebase.google.com) for the project in `config.js`:

1. **Authentication > Sign-in method:** turn on **Google** (pick a support email) and **Anonymous**.
2. **Authentication > Settings > Authorized domains:** add `atsmah123.github.io`. Google sign-in fails without it.
3. **Firestore Database:** create the database.
4. **Firestore Database > Rules:** paste the contents of `firestore.rules` and publish.

The free Spark plan allows 50,000 database reads a day and stops the database, without charging, if a day goes over. Every phone re-reads each card, pair and rule that changes, so reads grow with guests times pairs. A rough estimate for 40 guests is 15,000 to 35,000 reads on the night. The stress test below reports the real figure for one run.

Firebase also allows 100 new sign-ups an hour from one network. Guests who join before the party from home are not affected. If a whole room joins without Google on the same Wi-Fi, the limit is 100 in an hour.

## Stress test

Open `stress.html` on the live site and tap **Start the test**. It signs in 40 guests without Google on the real Firebase project from that one page, saves 40 cards in the same instant, plays 3 rounds in which every guest pairs at once, writes house rules, and checks that all 40 ended up seeing the same party. It reports how long each step took and how many database reads the run used, then removes the test guests, pairs and rules.

- `?n=40` sets the number of guests (2 to 60) and `&rounds=3` the rounds (1 to 6).
- Test guests only pair with each other. Real guests who are signed up will see them appear in the guest web for about a minute.
- One run uses roughly a fifth of a day's free reads and 40 of the hour's 100 sign-ups, so do not run it more than twice in an hour.
- It refuses to run within 12 hours of the party.
- If the database still has an older copy of `firestore.rules`, the test cannot remove its pairs and rules, and says so. Paste the current rules and delete the `pairs` and `rules` collections in the console.

## Sign-in

Guests see two buttons: **Continue with Google** and **Join without Google**.

- With Google, the card belongs to the Google account, so the guest gets the same card in any browser or phone they sign in on.
- Without Google, the card belongs to that one browser. The guest can attach it to Google later from the Me tab ("Save my card to Google").

To make Google the only way in, set `allowGuests: false` in `config.js`. To go back to no sign-in screen at all, set `google: false`.

Google sign-in does not work inside the browsers built into other apps (the app shows a note when it detects one). The Firebase console lists the Google email of each guest who signs in that way; the app itself stores no emails.

## Hosting

Repository **Settings > Pages > Deploy from a branch > `main` / root**. The site is live a minute later.

## Changing things

- Party name, start time and the card game: `config.js`.
- Interests, clue wording and conversation prompts: `data.js`.
- To clear the party and start over, delete the `guests`, `pairs` and `rules` collections in the Firebase console.
- To remove one guest or one house rule, delete that document in the console.

## Files

| File | Holds |
| --- | --- |
| `index.html`, `app.css` | The page and its styles |
| `app.js` | Screens, state and actions |
| `match.js` | Matching, clues, codes and ranks (pure functions) |
| `web.js` | The guest web |
| `data.js` | Interests, prompts and faces |
| `backend-firebase.js` | Firebase sign-in and Firestore |
| `backend-demo.js` | The one-phone demo |
| `firestore.rules` | Database rules |
| `stress.html`, `stress.js` | The stress test |

Run the logic tests with `npm test` (Node 20 or newer).

## Known limits

- A guest who joins without Google is tied to that browser. Opening the link in a second browser makes a second card, unless they saved the first one to Google.
- Codes and cards are readable by any signed-in guest who goes looking in the browser's developer tools. That is fine for a party and not for anything that matters.
- Which clue a guest is on, their nudges and their skips are kept on their phone, not in the database. A guest who switches phone mid-hunt is dealt a clue again.

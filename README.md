# Pairs

A party game for Atharva and Tabitha's 24th. Each guest makes a card, gets clues about the guest whose interests sit closest to theirs, finds that person in the room and swaps a 4-letter code. Every confirmed pair draws a line on a shared web of guests.

It is a static site (GitHub Pages) with Firebase for sign-in and shared data. There is no build step.

## Links

| Link | What it does |
| --- | --- |
| `https://atsmah123.github.io/party-pairs/` | The party. Send this one to guests. |
| `.../party-pairs/?preview=1` | Unlocks the hunt on your phone before the party starts, so you can test with a friend. |
| `.../party-pairs/?demo=1` | Runs the whole game on one phone with twelve made-up guests. Touches nothing in Firebase. |

## How the game works

1. **Card.** A guest picks a name, a face, 3 to 8 interests and one secret fact. They get a 4-letter code.
2. **Clue.** From 9:00pm on Saturday 14 Nov, "Deal my clue" picks their closest match among guests they have not met. The clue says what the two have in common (kept vague: "loud guitar music", not "Metal") and shows the other guest's secret fact. Two nudges are available: the face on the other guest's card, then the first letter of their name.
3. **Pair.** When they think they have found the guest, they ask for the code at the top of that guest's screen and type it in. A right code pairs them on both phones and gives them something to talk about. A wrong one costs a sip.
4. **House rule.** A pair that shares two or more interests adds one house rule for Kings. Rules sit in a list everyone can read out.
5. **Rank.** A guest's card starts as a 2 and climbs one rank per pair, up to an ace.

Matching uses a tree of interests in `data.js`: the same tag scores 1, tags in the same group score 0.7 (rock and metal), tags in the same category score 0.3.

## One-time Firebase setup

In the [Firebase console](https://console.firebase.google.com) for the project in `config.js`:

1. **Authentication > Sign-in method:** turn on **Anonymous**.
2. **Firestore Database:** create the database.
3. **Firestore Database > Rules:** paste the contents of `firestore.rules` and publish.

The free Spark plan is enough. A 30-guest night should stay well under its daily limit of 50,000 reads.

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

Run the logic tests with `npm test` (Node 20 or newer).

## Known limits

- A guest is tied to the browser they joined in. Opening the link in a second browser makes a second card, so tell guests to stay in one.
- Codes and cards are readable by any signed-in guest who goes looking in the browser's developer tools. That is fine for a party and not for anything that matters.

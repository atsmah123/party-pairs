// The interest tree. Category > group > tag.
// Same tag scores 1, same group 0.7 (rock and metal), same category 0.3.
// `clue` finishes the sentence "Your pair is into ...".

export const CATEGORIES = [
  {
    id: "music", label: "Music", groups: [
      { id: "guitar", clue: "loud guitar music", tags: [["rock", "Rock"], ["metal", "Metal"], ["punk", "Punk"], ["indie", "Indie"]] },
      { id: "beats", clue: "hip-hop or electronic music", tags: [["hiphop", "Hip-hop"], ["rnb", "R&B"], ["edm", "EDM"], ["techno", "House & techno"]] },
      { id: "pop", clue: "pop music", tags: [["pop", "Pop"], ["kpop", "K-pop"], ["bollywood", "Bollywood"], ["latin", "Latin"]] },
      { id: "roots", clue: "jazz, classical or folk", tags: [["jazz", "Jazz"], ["classical", "Classical"], ["folk", "Folk & country"]] },
      { id: "making", clue: "making music", tags: [["instrument", "Playing an instrument"], ["singing", "Singing"], ["djing", "DJing & producing"]] },
    ],
  },
  {
    id: "sport", label: "Sport", groups: [
      { id: "ball", clue: "ball sports", tags: [["football", "Football (soccer)"], ["basketball", "Basketball"], ["cricket", "Cricket"], ["racket", "Tennis & racket sports"], ["gridiron", "American football"]] },
      { id: "endurance", clue: "endurance sports", tags: [["running", "Running"], ["cycling", "Cycling"], ["swimming", "Swimming"]] },
      { id: "gym", clue: "training", tags: [["lifting", "Lifting"], ["yoga", "Yoga & pilates"], ["martial", "Martial arts"]] },
      { id: "outdoors", clue: "mountains and trails", tags: [["hiking", "Hiking"], ["climbing", "Climbing"], ["skiing", "Skiing & snowboarding"], ["camping", "Camping"]] },
      { id: "fans", clue: "following sport closely", tags: [["f1", "Formula 1"], ["fantasy", "Fantasy leagues"]] },
    ],
  },
  {
    id: "games", label: "Games", groups: [
      { id: "video", clue: "video games", tags: [["pcgames", "PC & console games"], ["mobilegames", "Mobile games"]] },
      { id: "tabletop", clue: "tabletop games", tags: [["boardgames", "Board games"], ["cardgames", "Card games"], ["chess", "Chess"], ["ttrpg", "Tabletop RPGs"], ["poker", "Poker"]] },
      { id: "puzzles", clue: "puzzles and trivia", tags: [["crosswords", "Crosswords & word games"], ["trivia", "Trivia"]] },
    ],
  },
  {
    id: "screen", label: "Film, TV and books", groups: [
      { id: "film", clue: "films", tags: [["movies", "Movies"], ["horror", "Horror"], ["docs", "Documentaries"]] },
      { id: "tv", clue: "TV series", tags: [["anime", "Anime"], ["reality", "Reality TV"], ["sitcoms", "Sitcoms"], ["dramas", "Drama series"]] },
      { id: "reading", clue: "books", tags: [["fiction", "Fiction"], ["scifi", "Sci-fi & fantasy"], ["nonfiction", "Non-fiction"], ["manga", "Manga & comics"]] },
      { id: "online", clue: "podcasts and internet rabbit holes", tags: [["podcasts", "Podcasts"], ["youtube", "YouTube deep dives"], ["memes", "Memes"]] },
    ],
  },
  {
    id: "food", label: "Food and drink", groups: [
      { id: "cooking", clue: "cooking", tags: [["cook", "Cooking"], ["baking", "Baking"], ["grilling", "Grilling"]] },
      { id: "drinks", clue: "coffee, tea or cocktails", tags: [["coffee", "Coffee"], ["tea", "Tea & boba"], ["cocktails", "Cocktails"], ["beer", "Craft beer"], ["wine", "Wine"]] },
      { id: "eating", clue: "eating out", tags: [["restaurants", "New restaurants"], ["spicy", "Spicy food"], ["streetfood", "Street food"]] },
    ],
  },
  {
    id: "making", label: "Making things", groups: [
      { id: "visual", clue: "visual art", tags: [["photography", "Photography"], ["drawing", "Drawing & painting"], ["design", "Graphic design"]] },
      { id: "craft", clue: "crafts", tags: [["knitting", "Knitting & crochet"], ["pottery", "Pottery"], ["diy", "Woodwork & DIY"]] },
      { id: "words", clue: "writing", tags: [["writing", "Writing"], ["journaling", "Journaling"]] },
      { id: "build", clue: "building things with code or hardware", tags: [["coding", "Coding side projects"], ["robotics", "Robotics & electronics"], ["printing", "3D printing"]] },
    ],
  },
  {
    id: "out", label: "Going out", groups: [
      { id: "travel", clue: "travel", tags: [["travel", "Travel"], ["roadtrips", "Road trips"], ["backpacking", "Backpacking"]] },
      { id: "nightlife", clue: "nights out", tags: [["dancing", "Dancing"], ["concerts", "Concerts"], ["karaoke", "Karaoke"], ["bars", "Bar hopping"]] },
      { id: "culture", clue: "theatre, museums or comedy", tags: [["museums", "Museums"], ["theatre", "Theatre & musicals"], ["comedy", "Stand-up comedy"]] },
    ],
  },
  {
    id: "mind", label: "Curiosity", groups: [
      { id: "science", clue: "science and tech", tags: [["ai", "AI"], ["space", "Space"], ["startups", "Startups"]] },
      { id: "ideas", clue: "history, philosophy or psychology", tags: [["history", "History"], ["philosophy", "Philosophy"], ["psychology", "Psychology"]] },
      { id: "nature", clue: "plants and the night sky", tags: [["plants", "Plants & gardening"], ["stargazing", "Stargazing"]] },
      { id: "pets", clue: "animals", tags: [["dogs", "Dogs"], ["cats", "Cats"]] },
      { id: "style", clue: "clothes", tags: [["thrifting", "Thrifting"], ["fashion", "Fashion"], ["sneakers", "Sneakers"]] },
    ],
  },
];

// Tags in different groups that still count as close (0.7).
export const LINKS = [
  ["karaoke", "singing"], ["anime", "manga"], ["fantasy", "football"], ["fantasy", "gridiron"],
  ["coding", "ai"], ["robotics", "ai"], ["cocktails", "bars"], ["concerts", "instrument"],
  ["scifi", "space"], ["ttrpg", "scifi"], ["dancing", "edm"], ["dancing", "techno"],
  ["dancing", "bollywood"], ["dancing", "latin"], ["djing", "techno"], ["djing", "edm"],
  ["stargazing", "space"], ["camping", "roadtrips"], ["backpacking", "hiking"],
  ["baking", "coffee"], ["streetfood", "travel"], ["photography", "travel"],
];

// What a new pair is told to talk about, by the group they share.
export const PROMPTS = {
  guitar: ["Name the best gig you’ve been to. The other one tops it or drinks.", "Pick one album each for the ride home from this party."],
  beats: ["Each name the song that gets you on the floor in three seconds.", "Who should take over the speaker tonight, and what’s the first track."],
  pop: ["Confess the pop song you know every word to.", "Build a three-song karaoke set between you."],
  roots: ["Name one record the other has to hear this week.", "Which artist did each of you grow up hearing at home."],
  making: ["What was the first song each of you learned to play or sing.", "If you two started a band tonight, what’s it called."],
  ball: ["Whose team has caused more suffering. Make your case.", "Agree on the greatest player either of you has seen live."],
  endurance: ["Compare your worst race or your longest day out.", "Plan a slow Sunday route and pick the coffee stop."],
  gym: ["Trade one exercise each of you swears by.", "What’s the most stubborn goal either of you is chasing."],
  outdoors: ["Describe the best view each of you has earned on foot.", "Pick a spring trip: where to, and who carries the snacks."],
  fans: ["Who wins it all this season. The loser of the argument drinks.", "Defend your worst prediction of the year."],
  video: ["Name the game that ate the most hours of your life.", "Pick one game to play together and decide who carries."],
  tabletop: ["Which game ends friendships in your house.", "Teach each other one house rule you play with."],
  puzzles: ["Trade your most useless piece of trivia.", "What’s your opening word or first move, and why."],
  film: ["Name a film you’d both rewatch tonight.", "Which scene has each of you quoted the most."],
  tv: ["Which show do you push on everyone you meet.", "Agree on the best finale, or the worst."],
  reading: ["What’s the last book that kept you up.", "Swap one recommendation each and say why in a sentence."],
  online: ["Share the last rabbit hole you fell into.", "Which podcast or channel would you force on the other."],
  cooking: ["What’s the dish you make when you want to show off.", "Plan a two-course dinner where each of you cooks one."],
  drinks: ["Describe your exact order, then defend it.", "Agree on the best cafe or bar in town."],
  eating: ["Where was the meal you still think about.", "Pick one place the other has to try this month."],
  visual: ["Show each other the last photo or piece you’re proud of.", "Whose work do you both keep going back to."],
  craft: ["What’s the last thing each of you made by hand.", "Pick a project you’d both try in one afternoon."],
  words: ["What is each of you writing, or avoiding writing.", "Share a line you wish you’d written."],
  build: ["Pitch each other your current side project in one breath.", "What would you two build in a weekend."],
  travel: ["Where did each of you last get properly lost.", "Agree on one place to go if flights were free tomorrow."],
  nightlife: ["Which song gets both of you up without a fight.", "Plan the next night out: where it starts and where it ends."],
  culture: ["What’s the last show or exhibit that stayed with you.", "Pick something on this month to see together."],
  science: ["What’s the one idea in your field people get wrong.", "Make a bet about something five years out."],
  ideas: ["Which thinker or period would each of you have dinner with.", "Trade the best thing you’ve read on how people work."],
  nature: ["What’s alive in your home, and how is it doing.", "Where’s the best night sky either of you has seen."],
  pets: ["Show each other the pet photos. All of them.", "Dog or cat, and name the one that convinced you."],
  style: ["What’s the best thing either of you found second-hand.", "Rate each other’s outfit tonight, kindly."],
};

export const FALLBACK_PROMPTS = [
  "On paper you two share nothing. Find one thing you both can’t stand.",
  "Each guess the other’s most-played song. Closest guess wins.",
  "You have two minutes to find the oddest thing you have in common.",
];

export const EMOJI = [
  "\u{1F98A}", "\u{1F419}", "\u{1F989}", "\u{1F438}", "\u{1F43C}", "\u{1F981}", "\u{1F42F}", "\u{1F428}",
  "\u{1F435}", "\u{1F984}", "\u{1F41D}", "\u{1F98B}", "\u{1F422}", "\u{1F42C}", "\u{1F996}", "\u{1F9A9}",
  "\u{1F335}", "\u{1F344}", "\u{1F336}️", "\u{1F355}", "\u{1F369}", "\u{1F951}", "\u{1F349}", "\u{1F3B8}",
  "\u{1F3A7}", "\u{1F3B2}", "\u{1F6F9}", "\u{1F680}", "\u{1FAA9}", "\u{1F47E}", "\u{1F920}", "\u{1F60E}",
];

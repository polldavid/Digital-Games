/**
 * Question bank for "Do You Really Know Your Friends?"
 *
 * Each question is phrased from the spotlight player's point of view
 * (first person), because the spotlight player answers it about themselves.
 * The "{name}" token is swapped for the spotlight player's name when the
 * question is shown to the *guessers*.
 *
 * Categories are only used to keep variety while drawing; they are not shown.
 */
const QUESTION_BANK = [
  // --- Favourites & preferences ---
  { c: 'faves', me: "What's my go-to comfort food?", them: "What's {name}'s go-to comfort food?" },
  { c: 'faves', me: "What's my dream holiday destination?", them: "What's {name}'s dream holiday destination?" },
  { c: 'faves', me: "What's my favorite way to waste an afternoon?", them: "What's {name}'s favorite way to waste an afternoon?" },
  { c: 'faves', me: "What's my most-used app?", them: "What's {name}'s most-used app?" },
  { c: 'faves', me: "What's my favorite season and why?", them: "What's {name}'s favorite season and why?" },
  { c: 'faves', me: "What's my drink order at a café?", them: "What's {name}'s drink order at a café?" },
  { c: 'faves', me: "What's the last song I had on repeat?", them: "What's the last song {name} had on repeat?" },
  { c: 'faves', me: "What movie can I watch over and over?", them: "What movie can {name} watch over and over?" },
  { c: 'faves', me: "What's my favorite emoji?", them: "What's {name}'s favorite emoji?" },
  { c: 'faves', me: "What's my ideal pizza topping?", them: "What's {name}'s ideal pizza topping?" },

  // --- Habits & quirks ---
  { c: 'habits', me: "What's a weird habit I have?", them: "What's a weird habit {name} has?" },
  { c: 'habits', me: "What time do I actually go to sleep?", them: "What time does {name} actually go to sleep?" },
  { c: 'habits', me: "What's the first thing I do when I wake up?", them: "What's the first thing {name} does when they wake up?" },
  { c: 'habits', me: "What chore do I put off the longest?", them: "What chore does {name} put off the longest?" },
  { c: 'habits', me: "What's my most-used phrase or catchphrase?", them: "What's {name}'s most-used phrase or catchphrase?" },
  { c: 'habits', me: "What's my guilty pleasure?", them: "What's {name}'s guilty pleasure?" },
  { c: 'habits', me: "What always makes me lose track of time?", them: "What always makes {name} lose track of time?" },
  { c: 'habits', me: "What snack do I reach for at midnight?", them: "What snack does {name} reach for at midnight?" },

  // --- Personality & self ---
  { c: 'self', me: "What word would my friends use to describe me?", them: "What word would you use to describe {name}?" },
  { c: 'self', me: "What's something I'm secretly proud of?", them: "What's something {name} is secretly proud of?" },
  { c: 'self', me: "What's my biggest irrational fear?", them: "What's {name}'s biggest irrational fear?" },
  { c: 'self', me: "What's my most controversial opinion?", them: "What's {name}'s most controversial opinion?" },
  { c: 'self', me: "What's a small thing that instantly annoys me?", them: "What's a small thing that instantly annoys {name}?" },
  { c: 'self', me: "What's the fastest way to make me laugh?", them: "What's the fastest way to make {name} laugh?" },
  { c: 'self', me: "Am I more of a planner or a wing-it person?", them: "Is {name} more of a planner or a wing-it person?" },
  { c: 'self', me: "What talent do I wish I had?", them: "What talent does {name} wish they had?" },

  // --- Hypotheticals & dreams ---
  { c: 'dreams', me: "If I won the lottery, what's the first thing I'd buy?", them: "If {name} won the lottery, what's the first thing they'd buy?" },
  { c: 'dreams', me: "What job would I be terrible at?", them: "What job would {name} be terrible at?" },
  { c: 'dreams', me: "If I could have any superpower, what would it be?", them: "If {name} could have any superpower, what would it be?" },
  { c: 'dreams', me: "What animal would I be?", them: "What animal would {name} be?" },
  { c: 'dreams', me: "Which celebrity would I want to swap lives with for a day?", them: "Which celebrity would {name} swap lives with for a day?" },
  { c: 'dreams', me: "What would my autobiography be titled?", them: "What would {name}'s autobiography be titled?" },
  { c: 'dreams', me: "If I opened a shop, what would it sell?", them: "If {name} opened a shop, what would it sell?" },
  { c: 'dreams', me: "What's on my ultimate bucket list?", them: "What's on {name}'s ultimate bucket list?" },

  // --- Friends & memories ---
  { c: 'social', me: "Who in this group would I call in an emergency?", them: "Who in this group would {name} call in an emergency?" },
  { c: 'social', me: "What's my idea of a perfect night out?", them: "What's {name}'s idea of a perfect night out?" },
  { c: 'social', me: "What's the most embarrassing thing I've done in front of friends?", them: "What's the most embarrassing thing {name} has done in front of friends?" },
  { c: 'social', me: "Who here is most likely to be late — including me?", them: "Who here would {name} say is most likely to be late?" },
  { c: 'social', me: "What's my go-to karaoke song?", them: "What's {name}'s go-to karaoke song?" },
  { c: 'social', me: "How do I take my coffee when I'm hungover?", them: "How does {name} take their coffee when hungover?" },
  { c: 'social', me: "What's a trip I'll never forget?", them: "What's a trip {name} will never forget?" },
  { c: 'social', me: "What's the nicest thing a friend has done for me?", them: "What's the nicest thing a friend has done for {name}?" },
];

/**
 * A pool of light-hearted dares used when the "dares" option is enabled.
 * Applied to a player who gets a guess wrong (chosen at random, at most one
 * per reveal to keep pace snappy).
 *
 * These are all quick, one-and-done bits — no phones, no props, nothing that
 * carries on into later turns. Do the thing, get a laugh, move on.
 */
const DARE_BANK = [
  "Do your best evil villain laugh.",
  "Air-guitar a 5-second solo like it's the encore.",
  "Give yourself a slow, dramatic round of applause.",
  "Attempt the worm. The attempt is all that matters.",
  "Strike a runway pose and freeze for 3 seconds.",
  "Beatbox for 5 seconds — or perish trying.",
  "Do a slow-motion celebration like you just scored the winning goal.",
  "Do a dramatic gasp like you just heard life-changing gossip.",
  "High-five everyone in the room like you just won a trophy.",
  "Do your best “hey guys, welcome back to my channel” intro.",
  "Invent a fake middle name and insist it's real for 10 seconds.",
  "Announce a breaking-news headline about the player in the spotlight.",
  "Make up a brand-new secret talent for each person in the room.",
  "Give yourself a superhero name and describe your one power.",
  "Come up with a band name using the last thing you ate and your socks.",
  "Do a magician's “ta-daa!” reveal of… your own face.",
  "Make the ugliest face you can and hold it for 3 seconds.",
  "Do your best fake sneeze — the room votes if it was convincing.",
  "Do a wordless impression of the last person who guessed. Vibes only.",
];

// Expose to game.js (plain-script global).
window.QUESTION_BANK = QUESTION_BANK;
window.DARE_BANK = DARE_BANK;

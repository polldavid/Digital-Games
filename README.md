# Do You Really Know Your Friends? 🎉

A digital, **pass-and-play** version of the party game *“Do You Really Know Your Friends?”*
One phone, one friend in the spotlight, and everyone else guessing how they'll answer.
Find out who *really* knows the crew best.

No sign-up, no backend, no build step — it's a single self-contained web app in
plain HTML, CSS, and JavaScript.

![Best with 3–8 friends · Pass-and-play · No sign-up](https://img.shields.io/badge/players-3--8-6c4df6) ![No build step](https://img.shields.io/badge/build-none-43d9a3)

---

## How to play

1. **Add your friends** (3–8 players). Everyone shares this one device.
2. **Spotlight a player.** Each round one friend is in the spotlight and secretly
   answers a question *about themselves* (e.g. *“What's my go-to comfort food?”*).
3. **Everyone guesses.** One at a time, the others guess what the spotlight player
   secretly wrote.
4. **Reveal & score.** The spotlight player reveals their true answer and marks each
   guess right or wrong. **Every correct guess scores a point.**
5. **Rotate.** The spotlight passes to the next friend. Most points at the end wins.

A **“pass the phone”** screen guards every secret step, so answers and guesses stay
hidden until the big reveal.

### Scoring

- **+1 point** to each player who correctly guesses the spotlight player's answer.
- **+1 bonus point** to the spotlight player on a *clean sweep* — when the whole group
  reads them correctly (delightfully predictable!).
- The game runs a set number of turns per player (1–5, default 2). Highest total wins;
  ties are shared.

### Optional: Dares 🌶️

Flip on **Dares** in setup and a random friend who guessed wrong each round gets a
light-hearted dare to perform.

---

## Running it

It's just static files — open `index.html` in any modern browser:

```bash
# easiest: double-click index.html, or
open index.html            # macOS
xdg-open index.html        # Linux
```

Or serve it locally (useful on phones over your network):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Works great on a phone — the layout is mobile-first and designed to be passed
around the table.

---

## Project structure

```
.
├── index.html        # All screens (markup); toggled by the game engine
├── css/
│   └── styles.css    # Mobile-first styling, animations, theming
└── js/
    ├── questions.js  # The question bank + dare bank (easy to extend)
    └── game.js       # Game state machine: setup → rounds → reveal → scores
```

### Adding your own questions

Open `js/questions.js` and add entries to `QUESTION_BANK`. Each question is written
twice — once for the spotlight player (`me`, first person) and once for the guessers
(`them`, using the `{name}` token that gets swapped for the spotlight player's name):

```js
{ c: 'faves', me: "What's my go-to comfort food?", them: "What's {name}'s go-to comfort food?" },
```

---

## Notes

- **No dependencies.** Pure vanilla JS, no frameworks, no bundler.
- **Accessible-minded:** honors `prefers-reduced-motion`, uses real buttons/switches
  with ARIA states, and keeps color contrast high.
- **State is in-memory** by design — it's a party game for one room, not a saved app.

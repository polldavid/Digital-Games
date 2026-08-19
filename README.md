# Digital Games 🎲

A little arcade of **pass-and-play** party games — one phone, a room full of
friends, no sign-up and no downloads. The site is a hub: each game lives in its
own folder and shows up as a card on the landing page.

No backend, no build step — everything is plain HTML, CSS, and vanilla JavaScript.

**Live hub:** https://polldavid.github.io/Digital-Games/

---

## Games

| Game | Folder | Players | Status |
| --- | --- | --- | --- |
| [Do You Really Know Your Friends?](friends/) | `friends/` | 3–8 | ✅ Playable |
| _More on the way…_ | — | — | 🛠️ Coming soon |

### Do You Really Know Your Friends?

One friend is in the spotlight and secretly answers a question about themselves
(e.g. *“What's my go-to comfort food?”*). Everyone else guesses what they wrote;
every correct guess scores a point. Optional one-and-done **dares** for wrong
guesses. Find out who *really* knows the crew best.
See [`friends/`](friends/) for the full how-to-play and scoring.

---

## Project structure

```
.
├── index.html              # The hub / landing page (lists all games)
├── friends/                # Game: Do You Really Know Your Friends?
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── questions.js    # Question bank + dare bank
│       └── game.js         # Game state machine
├── README.md
└── .gitignore
```

## Adding a new game

1. Create a new folder at the root (e.g. `trivia/`) with its own `index.html`
   and assets. Keep all links **relative** so it works in a subfolder.
2. Add a card for it in the root `index.html` — copy the existing
   `<a class="game" href="./trivia/">…</a>` block and update the emoji, title,
   description, and player count. Flip a placeholder card to a real link.
3. Commit and push — GitHub Pages redeploys automatically, and the new game
   appears on the hub at `/<your-folder>/`.

## Running locally

It's just static files. Serve the repo root and open the hub:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000  (hub)
#            http://localhost:8000/friends/  (the game)
```

Or open `index.html` directly in a browser.

## Notes

- **No dependencies.** Pure vanilla JS, no frameworks, no bundler.
- **Accessible-minded:** honors `prefers-reduced-motion`, uses real buttons and
  ARIA states, and keeps color contrast high.
- **Mobile-first**, designed to be passed around the table.

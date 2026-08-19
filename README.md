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
| [Get ChurchED](getchurched/) | `getchurched/` | 2+ teams | ✅ Playable |
| _More on the way…_ | — | — | 🛠️ Coming soon |

### Do You Really Know Your Friends?

One friend is in the spotlight and secretly answers a question about themselves
(e.g. *“What's my go-to comfort food?”*). Everyone else guesses what they wrote;
every correct guess scores a point. Optional one-and-done **dares** for wrong
guesses. Find out who *really* knows the crew best.
See [`friends/`](friends/) for the full how-to-play and scoring.

### Get ChurchED

A digital take on the Christian party game — three games in one: **Sing**,
**Act**, and **Explain**. Teams face a 30-second timer: sing a Christian song
containing the word, act out a Bible scene as charades, or describe a person /
place / concept without saying it. Every word your team gets is a point; most
points after all rounds wins. Pick a single mode or **Mixed**.
See [`getchurched/`](getchurched/) to play.

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

## Light & dark mode

Every page supports light and dark themes. On first visit it follows the
device's system setting; a **toggle in the top-right corner** (🌙 / ☀️) lets
players switch, and the choice is remembered across games and visits. The
theming is shared: `theme.css` (the toggle button) and `theme.js` (the
controller) live at the repo root, and each page defines its own light palette
via a `:root[data-theme="light"]` block. A tiny inline script in each page's
`<head>` applies the saved theme before first paint, so there's no flash.

## Notes

- **No dependencies.** Pure vanilla JS, no frameworks, no bundler.
- **Accessible-minded:** honors `prefers-reduced-motion`, uses real buttons and
  ARIA states, and keeps color contrast high.
- **Mobile-first**, designed to be passed around the table.

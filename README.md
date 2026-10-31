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
| [Flip 7 Scorer](flip7/) | `flip7/` | 2–12 | ✅ Playable |
| [In-Between](inbetween/) | `inbetween/` | 2–8, online or one device | ✅ Playable |
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

### Flip 7 Scorer

A scoring platform for the card game **Flip 7** — the companion to a physical
deck rather than a game of its own. Tap the cards each player flipped and it
does the maths: number cards summed, `×2` doubling them, `+2…+10` added after,
a **Flip 7** bonus for seven different numbers, and a bust wiping the round to
zero. It keeps a running leaderboard to 200, an editable round-by-round
history, and end-of-game stats — and it survives a refresh, so a knocked phone
doesn't lose the game. It even warns you when a round claims more copies of a
card than the 94-card deck actually holds.
See [`flip7/`](flip7/) to score a game.

### Alaga (formerly Baby Log)

The newborn tracker that started here is now its own app, **Alaga**, published
at **https://alaga.pages.dev** (not on this site). Its source is still in
[`baby/`](baby/) — see [`baby/README.md`](baby/README.md) and
[`baby/deploy/`](baby/deploy/) for how it's built and published. The old
`/baby/` address shows a "moved" page (`moved/`) that lets old installs save
their log as a backup file to import into Alaga.

### In-Between

The classic card game also known as **Acey-Deucey**. Everyone antes into a
pot; on your turn two cards are dealt face up, and you bet anything up to the
pot that the next card lands **strictly between** them. In between, you take
your bet from the pot; outside, it goes in; **hit the post** (match either
card) and you pay double. A first-card Ace can be called low or high,
consecutive cards pass the turn, and a pair becomes a higher-or-lower bet
(three of a kind costs triple). Clean out the pot and everyone antes again;
run out of chips and you're out.

Two ways to play:

- **Online** — everyone on their own phone or laptop (great for a remote
  happy hour over a video call). The host starts a room and shares the link;
  people join with their name, even mid-game. The **server deals**, so nobody
  can peek at the deck. The host sets the house rules, adds computer players,
  can skip anyone who wanders off, and a **turn timer** keeps things moving.
  Needs the Vercel deployment below.
- **One device** — pass-and-play, works anywhere including GitHub Pages.

Either way: computer players that bet from the live odds, an optional odds
meter counted from the cards left in the deck, tunable house rules (post
penalty, pairs, first-lap pot cap, ante every lap), and it survives a refresh.
See [`inbetween/`](inbetween/) to play.

---

## Project structure

```
.
├── index.html              # The hub / landing page (lists all games)
├── theme.css / theme.js    # Shared light/dark toggle
├── friends/                # Game: Do You Really Know Your Friends?
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── questions.js    # Question bank + dare bank
│       └── game.js         # Game state machine
├── getchurched/            # Game: Get ChurchED
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── words.js        # Word banks per mode
│       └── game.js         # Timer + turn engine
├── flip7/                  # Tool: Flip 7 Scorer
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── rules.js        # Deck definition + scoring maths (pure functions)
│       └── app.js          # Board, scoring sheet, history, persistence
├── inbetween/              # Game: In-Between (Acey-Deucey)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── rules.js        # Deck, hand judging, odds, computer betting (pure)
│       ├── engine.js       # Game state machine (shared by browser + server)
│       └── app.js          # UI: same-device driver + online room client
├── api/                    # Vercel serverless functions (online play)
│   ├── room.js             # /api/room — rooms, seats, moves; server deals
│   └── _lib/store.js       # Upstash Redis over REST (in-memory locally)
├── scripts/dev.js          # Local server: static site + /api, no setup
├── baby/                   # Source of Alaga (published at alaga.pages.dev, not here)
├── moved/                  # "Alaga has moved" page served at the old /baby/ address
├── _config.yml             # keeps baby/ out of GitHub Pages
│   ├── index.html
│   ├── manifest.webmanifest / sw.js   # install + offline
│   ├── css/styles.css
│   └── js/
│       ├── guide.js        # Age-based norms & answers (pure, tested)
│       ├── store.js        # State, persistence, reminder engine
│       ├── sound.js        # White-noise generator (Web Audio)
│       └── ui.js · forms.js · views.js · help.js · app.js   # UI
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

```bash
node scripts/dev.js
# → http://localhost:3000            (hub)
#   http://localhost:3000/inbetween/  (open several windows to try online rooms)
```

`scripts/dev.js` serves the site and the `/api/room` function with in-memory
storage, so online rooms work locally with no accounts or keys. (Plain
`python3 -m http.server` works too, but only for the one-device games.)

## Deploying to Vercel (online In-Between)

The site is static apart from one serverless function, `api/room.js`. Vercel
functions can't hold live connections, so room state lives in **Upstash
Redis** and each browser checks in about once a second (an unchanged check is
a single tiny read).

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Framework
   preset: **Other**. Leave the build command and output directory empty.
2. **Add the database:** in the project, open **Storage → Create Database →
   Upstash for Redis** (free plan is plenty). Pick a region near your Vercel
   functions (e.g. US East) and connect it to the project. This injects
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` names
   work too).
3. **Redeploy** so the function sees the new variables.
4. Open `https://<your-project>.vercel.app/inbetween/` and tap **Play online**.
   If the database isn't connected, the page says so instead of failing.

Rooms expire 12 hours after the last move. Rough load: ~10 players for an
hour is about 30k function calls and Redis commands, comfortably inside the
free tiers. To check: `GET /api/room?ping=1` returns
`{"ok":true,"storage":true}` when everything is wired up.

## Light & dark mode

Every page supports light and dark themes. On first visit it follows the
device's system setting; a **toggle in the top-right corner** (🌙 / ☀️) lets
players switch, and the choice is remembered across games and visits. The
theming is shared: `theme.css` (the toggle button) and `theme.js` (the
controller) live at the repo root, and each page defines its own light palette
via a `:root[data-theme="light"]` block. A tiny inline script in each page's
`<head>` applies the saved theme before first paint, so there's no flash.

## Notes

- **No dependencies.** Pure vanilla JS, no frameworks, no bundler — the
  serverless function talks to Redis with plain `fetch`.
- **Accessible-minded:** honors `prefers-reduced-motion`, uses real buttons and
  ARIA states, and keeps color contrast high.
- **Mobile-first**, designed to be passed around the table.

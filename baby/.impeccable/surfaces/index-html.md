---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["js/views.js","js/app.js","css/styles.css"]
---

# Surface brief — Baby Log app shell (all tabs; Today first)

Scope: the whole app UI (Today, History/Trends, Health, Answers, Settings, sheets). Mode: Operate.
Audience & job: a tired parent, one thumb, often at 3 a.m. in a dark room; log in seconds, see what's next, answer "is this normal / enough?".
Constraints: plain HTML/CSS/ES5, no build, offline (fonts self-hosted), WCAG AA both themes, 44px targets, text scales with --u.
Chosen: Isotype (rolled, assigned), night palette taken from the Night sky chart challenger by the user's request.
Memorable moment: the last 24 hours drawn as rows of identical pictograms — filled = done, faint = the expected range.

## Direction contract

THESIS: One drawn symbol means one thing; quantities are read by counting, never decoded from bars, emoji or gauges. Refuses the category default of pastel cards with illustrated emoji and the neon-dark dashboard the app had.

OWN-WORLD: Day — flat light ground #F3F3F0, ink #1B1B19, hairline rules #D8D8D2, deep-indigo "now" field #2F3260; data hues only: feed red #C8402A, wet blue #2A5BA8, dirty ochre #9B6A1E, sleep indigo, ok green #3F7F44. Night (sky-chart) — blue-black #070A12, chalk #ECE8DE, amber #E7A54C, night-vision red #E0523F for the one thing under the eye; no blue light. Jost (Futura lineage), weights 400–600, tabular figures. Solid silhouette pictograms on a 24-unit grid, 4–6px corners, no glass, blur, gradients or glows, no uppercase eyebrows.

STORY: Open → see what matters now and what's next in one field → log with one tap on a pictogram → glance at the counted rows to know the day is on track → dig into History, Health, Answers in the same language.

FIRST VIEWPORT: Top bar: baby monogram + name + age left, bell right. Full-width colour field: the running timer (asleep 1:37 + Woke up) or "Next feed 3:10 · in 29 min · start on the right" + Feed now. One hairline row with the secondary state (next feed / awake & nap window). Quick-log grid 4×2 of pictogram tiles. "Last 24 hours" as Isotype count rows (feeds, wet, dirty, sleep hours). Bottom tab bar of pictograms with labels.

FORM: Isotype picture statistics (Neurath/Arntz), #5 on the ordered list of seven; seed key ea03d094; night palette fused from challenger notation-diagram-systems-star-atlas at the user's request. Raises kept: colour only carries data (lexicon), hairlines not cards (design annual), tabular figures (datamatics), done marked in place (catalog).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions
- Automatic night mode after 10 pm (currently manual light/dark toggle).
- Baby avatar: emoji replaced by a coloured monogram.

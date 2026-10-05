---
name: Baby Log
description: An Isotype picture-statistics log for a tired parent; night is a sky chart, day is printed paper.
colors:
  night-ground: "#070A12"
  night-surface: "#10141F"
  night-surface-2: "#181D2B"
  night-rule: "#1E2433"
  night-rule-strong: "#2C3346"
  night-ink: "#ECE8DE"
  night-ink-2: "#B8B3A7"
  night-ink-3: "#8F8B82"
  night-field: "#170F12"
  night-field-rule: "#3A2024"
  night-amber: "#E7A54C"
  night-vision-red: "#E0523F"
  night-wet: "#C9BBA0"
  night-dirty: "#B07D4D"
  night-ok: "#A9BC8A"
  night-warn: "#F0C066"
  night-ok-bg: "#121A12"
  night-warn-bg: "#1C170C"
  night-bad-bg: "#1F0E0F"
  day-ground: "#F3F3F0"
  day-surface: "#E7E7E2"
  day-surface-2: "#DADAD3"
  day-rule: "#D8D8D2"
  day-rule-strong: "#BDBDB6"
  day-ink: "#1B1B19"
  day-ink-2: "#45453F"
  day-ink-3: "#65655E"
  day-field: "#2F3260"
  day-field-k: "#D3D5EE"
  day-field-rule: "#474A7A"
  day-now: "#C8402A"
  day-focus: "#2A5BA8"
  day-feed: "#C33F29"
  day-wet: "#2A5BA8"
  day-dirty: "#87581C"
  day-sleep: "#2F3260"
  day-ok: "#2F6A35"
  day-warn: "#955800"
  day-urgent: "#B42318"
  day-ok-bg: "#E3ECE1"
  day-warn-bg: "#F1E8D6"
  day-bad-bg: "#F5E1DD"
typography:
  display:
    fontFamily: "Jost, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "min(calc(60 * var(--u)), 14vw)"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  clock:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "calc(44 * var(--u))"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "calc(30 * var(--u))"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  figure:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "calc(26 * var(--u))"
    fontWeight: 600
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  title:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "calc(20 * var(--u))"
    fontWeight: 600
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "calc(16 * var(--u))"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "calc(14 * var(--u))"
    fontWeight: 500
    lineHeight: 1.15
  tab-label:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "calc(12.5 * min(var(--u), 1.3px))"
    fontWeight: 500
rounded:
  sm: "4px"
  md: "6px"
spacing:
  hair: "3px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  stack: "14px"
  gutter: "16px"
  gutter-wide: "24px"
  column: "32px"
components:
  button-primary:
    backgroundColor: "{colors.night-amber}"
    textColor: "{colors.night-ground}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  button-primary-day:
    backgroundColor: "{colors.day-ink}"
    textColor: "{colors.day-ground}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  quick-log-tile:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.night-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 4px"
    height: "72px"
  quick-log-tile-on-day:
    backgroundColor: "{colors.day-ink}"
    textColor: "{colors.day-ground}"
    rounded: "{rounded.sm}"
  chip:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "44px"
  input:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "48px"
  now-field-night:
    backgroundColor: "{colors.night-field}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.md}"
    padding: "16px 18px 18px"
  now-field-day:
    backgroundColor: "{colors.day-field}"
    textColor: "{colors.day-ground}"
    rounded: "{rounded.md}"
    padding: "16px 18px 18px"
  tab:
    textColor: "{colors.night-ink-3}"
    typography: "{typography.tab-label}"
    height: "54px"
---

# Design System: Baby Log

## Overview

**Creative North Star: "The Picture Statistic"**

Baby Log is drawn in the Isotype tradition of Otto Neurath and Gerd Arntz: one solid silhouette pictogram means one thing, and a quantity is read by counting identical symbols, never by decoding a gauge or an emoji. The parent it serves is often holding a baby in a dark room at 3 a.m., so the system has two complete worlds behind one token set. **Night** (the default, `:root`) is a sky chart: blue-black ground, chalk text, amber marks and a night-vision red reserved for the one thing under the eye; it emits no blue light and never lights up a bright block. **Day** (`:root[data-theme="light"]`) is printed paper: flat grey ground, near-black ink, a deep-indigo "now" field, and one colour per kind of thing.

Density is calm and editorial rather than dashboard-like. Sections are parts of one sheet separated by 1px rules, not floating cards. The signature is the "Last 24 hours" count: rows of identical pictograms, filled for what happened and outlined for the rest of the usual range, symbols never resized. Everything is set in Jost (Futura lineage) with tabular figures so times and counts line up like a timetable.

Confirmed rejections from the direction: pastel cards with illustrated emoji, and the neon-dark dashboard the app used to have. No glass, blur, gradients or glows.

**Key Characteristics:**
- Pictograms carry meaning; colour carries only the kind of data.
- Hairline rules divide; surfaces are flat and solid.
- Tabular figures everywhere; large numbers set tight (-0.01 to -0.025em).
- Small corners (4px controls, 6px fields and panels).
- Done is marked in place (filled symbol, struck-through row), not moved elsewhere.
- Night is the default and stays dim: the running thing is outlined in red, never filled bright.

## Colors

Two palettes, one set of role tokens: a chalk-on-sky-chart night and an ink-on-paper day, with colour spent only on the kind of thing being recorded.

### Primary
- **Chart Amber** (night-amber): the night's primary action (Feed now, Woke up, primary buttons, selection, checkbox and range accent), and also the feed hue. At night amber is both "act" and "feeding", which is the most frequent action.
- **Printer's Ink** (day-ink): the day's primary action is plain ink on paper; day buttons do not borrow a data hue.
- **Night-Vision Red** (night-vision-red / day-now): the one thing under the eye: the active quick-log tile's ring, a due-now label, the bell badge, the text caret, the top reason. Urgent status shares it at night.

### Secondary
- **Indigo Field** (day-field): the day's "now" field, a full-width block of deep indigo with paper-coloured text; the same indigo is the day sleep hue.
- **Ember Black** (night-field): the night's "now" field, a red-black barely lifted off the ground so the screen stays dark; its rule is night-field-rule.

### Tertiary: the data hues
One colour per kind of thing, applied through the pictogram tone map (bottle, breast, bowl, pump = feed; drop = wet; diaper, poo = dirty; moon, sun = sleep; tummy, ruler, star = ok; medicine, temperature, injection = ink).
- **Feed**: Kiln Red by day (day-feed), Chart Amber by night.
- **Wet**: Print Blue by day (day-wet), Parchment by night (night-wet); blue is not used at night.
- **Dirty**: Ochre by day (day-dirty), Burnt Sienna by night (night-dirty).
- **Sleep**: Indigo by day (day-sleep), chalk by night (same value as night-ink).
- **Ok / Warn / Urgent**: Field Green, Mustard, Signal Red (day-ok, day-warn, day-urgent; night-ok, night-warn, night-vision-red), each with a matching tinted background (ok-bg, warn-bg, bad-bg) used only for status pills, notes and the urgent banner.

### Neutral
- **Sky Chart Black / Paper Grey** (night-ground / day-ground): page, top bar, tab bar, sheets and dialogs. Everything structural sits on the ground.
- **Surface / Surface 2** (night-surface, night-surface-2 / day-surface, day-surface-2): the solid fill of pressable things (buttons, quick-log tiles, chips, inputs) and their pressed state.
- **Rule / Rule Strong** (night-rule, night-rule-strong / day-rule, day-rule-strong): 1px dividers; strong rules open a section, light rules separate rows.
- **Chalk / Ink, three steps** (night-ink, -2, -3 / day-ink, -2, -3): primary text, secondary text, and faint text for keys, ranges and inactive tabs.

### Named Rules
**The Colour Is Data Rule.** A hue appears only to say what kind of thing a symbol is (feed, wet, dirty, sleep) or its status (ok, warn, urgent). Chrome, headings, tabs and section dividers are ink and rule only.

**The No Blue Light Rule.** At night nothing is blue: wet turns parchment, focus turns amber, and there are no white or bright fills. A running or selected control is marked with a 1.5px night-vision-red inset ring on the ember field, never filled.

**The One Red Thing Rule.** Night-vision red marks the single item that needs the eye now. If two things are red, one of them is wrong.

## Typography

**Display Font:** Jost (self-hosted variable woff2, 400–600, OFL) with system-ui, -apple-system, Segoe UI, Roboto fallback
**Body Font:** Jost, same stack
**Label/Mono Font:** none in the system; a monospace stack appears only for raw scanned text.

**Character:** A geometric Futura-lineage sans in three weights, the type of the Isotype charts themselves. It is set tight in large numbers and plain in sentence case everywhere else.

### Hierarchy
- **Display** (600, 60u capped at 14vw, 0.95, -0.025em): the next-feed time in the now-field.
- **Clock** (600, 44u, 1, -0.02em): the running timer in the now-field and the stepper value in sheets.
- **Headline** (600, 30u, 1.1, -0.015em): view titles; the welcome title scales 40–56u.
- **Figure** (600, 26u, -0.01em): counted totals beside the symbol rows; tile values use 21u, stats 24u.
- **Title** (600, 20u): section titles ("Last 24 hours", "Coming up", "Today") in sentence case with a trailing underlined link; sheet titles 22u.
- **Body** (400, 16u, 1.45): running text; row titles at 500.
- **Label** (500, 14u, 1.15): quick-log tile labels, keys, field labels (14.5u), row subtitles in ink-2.
- **Tab label** (500, 12.5u capped at 1.3px per u): tab and rail labels.

Here "u" is `var(--u)`: one design pixel of type, 1px at default text size, growing with the platform text setting up to 2px (root 16px on web, 17px Dynamic Type on iOS).

### Named Rules
**The Counted Size Rule.** Every font-size is written as `calc(N * var(--u))`, never a bare px or rem. Chrome that must not outgrow its box (tab labels, badges, pictogram tiles) caps the multiplier with `min(var(--u), Npx)`. Inputs never drop below 16px.

**The Timetable Rule.** Figures are tabular across the whole body (`font-variant-numeric: tabular-nums`). Times, durations and counts align in columns.

**The Sentence Case Rule.** There is no uppercase, letter-spaced label anywhere. Hierarchy comes from size and weight (400 / 500 / 600) only.

## Layout

Mobile-first, one column at most 560px wide with a 16px gutter. A view is a vertical stack with a 14px gap. Sections open with a rule-strong hairline and are set off by their titles, not boxes. Content is organised into `data-region` panes (`pane--lead`, `pane--groups` holding `group`s) that `regions()`/`patch()` re-render in place.

- **Phone (<768px):** the top bar is sticky (monogram, name, age, then the bell and theme switch), and the tab bar is fixed at the bottom (64px, pictogram over label, active tab marked by a 3px ink bar on its top edge). The now-field runs edge to edge, bleeding through the gutter with square corners. The quick-log grid is four across with 6px gaps (three across for the extended set), dropping to fewer columns as text grows.
- **Tablet (≥768px):** the content widens to 1120px with a 24px gutter and two panes 32px apart. On Today the counted day sits in the right pane, sticky at 76px, while the left pane stacks the now-field, the log buttons, what is coming and today's entries. Health and Settings flow into two CSS columns, Answers questions into two grid columns, and the Timeline is capped at 760px. Sheets become centred dialogs, 600px wide.
- **Rail (≥1000px, or a phone in landscape ≤520px tall):** the tab bar becomes an 88px left rail (72px with labels hidden on landscape phones), with the active marker on the left edge.
- Counted pictograms keep a fixed size per breakpoint (17×21 phone, 19×23 tablet, 22×26 at ≥1200) with a gap after every fifth symbol, so a row can be counted in fives.
- Touch targets are at least 44px everywhere; rows are 52–56px.

## Elevation & Depth

Flat. Depth is never shown with shadows. The only layering is the scrim behind sheets and dialogs (night rgba(3,5,10,0.72), day rgba(27,27,25,0.45)) and the fact that pressable things sit on a solid surface step above the ground. Pressing a button goes one step further (surface-2) with a 0.97–0.98 scale.

### Named Rules
**The Hairline Not Card Rule.** A section is a run of the page set off by a 1px rule: rule-strong on top, rule between rows. Never wrap content in a shadowed or bordered floating box. The class names `card` and `tile` in the build mean "ruled section" and "ruled cell".

**The Flat Ink Rule.** No box-shadow for elevation, no blur, no backdrop-filter, no gradient, no glow. Inset rings are allowed only as state markers: the night red ring, and the 1px urgent ring on an invalid input.

## Shapes

Small, square-shouldered corners: 4px on controls (buttons, tiles, chips, inputs, toasts, status pills) and 6px on the larger blocks (now-field, segmented control, notes, confirm dialog, centred sheet). Circles are reserved for the baby's monogram disc, calendar dots and the switch thumb. Pictograms are solid silhouettes on a 24-unit grid (`viewBox 0 0 24 24`, `fill: currentColor`). Their outlined twin (1.6px stroke, round joins, 0.7 opacity) is the "expected but not yet" form. Inputs carry a 2px bottom rule like a form line on paper.

## Components

### Buttons
Flat rectangles that read as printed labels.
- **Shape:** 4px corners, minimum 44px tall (54px large), 10px 16px padding, Jost 500 at 15.5u.
- **Primary:** amber on sky-black at night, ink on paper by day. On the now-field the primary button is amber at night and paper-on-indigo by day; the secondary on-field button is transparent with a field-rule border.
- **Default / Ghost:** a surface fill; ghost is transparent with a rule-strong border. Danger uses the bad-bg tint with urgent text and a 40% urgent border.
- **Link:** ink, 1px underline offset 0.2em, used as the trailing action on section titles and state rows.
- **Pressed / Focus:** pressing steps to surface-2 and scale(0.98) (primary darkens to brightness 0.9). Focus shows a 3px focus-coloured outline offset 2px (amber at night, blue by day). Disabled is 0.45 opacity.

### Chips
- **Style:** a surface fill, 4px corners, 44px tall, 8px 14px padding, 500 weight, 18px pictogram.
- **State:** selected is an ink fill with ground text by day. At night selected is the ember field with a red inset ring and a red pictogram (the same treatment for segmented choices, sound tiles and the selected calendar day).

### Cards / Containers
- **Corner Style:** none; a "card" is a ruled section.
- **Background:** the ground.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px rule-strong on top only.
- **Internal Padding:** 10px top, 0 sides.

### Inputs / Fields
- **Style:** surface fill, 4px corners, at least 48px tall, 10px 12px padding, a 2px rule-strong bottom line, 16px minimum text. Labels sit above in 14.5u 500 ink-2, with hints below in ink-3.
- **Focus:** a 3px focus outline and the bottom line turns ink. The caret is night-vision red.
- **Error:** the bottom line and a 1px inset ring turn urgent, with a 600-weight urgent message below.

### Navigation
Five pictogram tabs (Today, History, Health, Answers, Settings), each a pictogram over a 12.5u label. Inactive tabs are ink-3 and the active tab is ink with a 3px ink bar on its outer edge (the top on the bottom bar, the left on the rail). The bar is the ground colour with a rule-strong hairline, never translucent.

### The Now-Field (signature)
A full-width solid colour block answering "what is happening, or what comes next": indigo by day, ember-black by night. It holds the running timer (pictogram, label, "since", and a 44u clock) or the next feed (key line, 60u time, "in 29 min · start on the right") plus one action. When a feed is due the key line turns night-vision red. It has 6px corners on tablet and wider, and is edge to edge on phones.

### Quick-Log Tile (signature)
A 4×2 grid of 72px surface tiles with a 30u pictogram over a 14u label and 6px gaps. One tap logs. The running activity is ink-filled by day and red-ringed on the ember field by night.

### Counted Row (signature)
Under "Last 24 hours", one ruled row per measure. On the left are a label, the 26u total, and an "of 6–12" range. On the right is a row of identical pictograms in the measure's hue: filled for each one logged, outlined for the rest of the usual range, a 7px gap after every fifth, and a "+N" figure past the cap. The row is exposed to screen readers as a single image labelled with its numbers. A one-line verdict with a check pictogram closes the block. Warnings colour the total, not the symbols.

### Rows
Timeline, reminder and settings rows: a 26px toned pictogram, a 500-weight title, an ink-2 subtitle, and a right-aligned bold time over a relative time. They are separated by rule hairlines, 52px minimum. A row that is done stays where it is at 0.5 opacity with its title struck through. Day groups open with a 600-weight date over a rule-strong line.

## Do's and Don'ts

### Do:
- **Do** express every quantity a parent should judge as a counted row of identical 24-unit pictograms, filled for done and outlined for the expected remainder, at a constant size.
- **Do** take every colour from the role tokens; switch themes only by swapping `:root` and `:root[data-theme="light"]` values.
- **Do** give each kind of thing its pictogram through the tone map so the same symbol always carries the same hue.
- **Do** separate sections with 1px rules (rule-strong to open, rule between rows) and keep the ground showing.
- **Do** write font sizes as `calc(N * var(--u))` and keep 44px targets; lay out with data-region panes, two panes at ≥768px and the rail at ≥1000px or on a landscape phone.
- **Do** mark the running or selected thing at night with the 1.5px night-vision-red inset ring on the ember field.

### Don't:
- **Don't** use emoji, illustrated mascots or pastel cards (the category default the direction rejected).
- **Don't** bring back the neon-dark dashboard look: no glass, blur, gradients, glows or drop shadows.
- **Don't** put blue or a bright filled block on the night screen.
- **Don't** spend a data hue on chrome, headings or decoration.
- **Don't** use uppercase letter-spaced eyebrows or kicker labels above titles.
- **Don't** scale a pictogram to show an amount; add or outline symbols instead.
- **Don't** round controls past 6px or float sections in boxes.

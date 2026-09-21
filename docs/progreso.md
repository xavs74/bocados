# Progreso — proposal

A screen that shows how the last weeks went, an optional weight log, and a
suggestion to correct the calorie goal from what actually happened.

Today Bocados only shows one day at a time. The calendar shows dots per day, but
nothing answers "am I on track?" or "is my goal right for me?". Calculated goals
come from a formula (Mifflin-St Jeor or Harris-Benedict) whose estimate is
commonly 10–15 % off for an individual. Two or three weeks of the person's own
data answer it better than any formula.

Nothing here changes how food is logged.

## 1. The screen

A new tab, **Progreso**, with a period switch at the top: **4 semanas** (default)
and **12 semanas**.

### Card 1 — Cómo va

- **Media diaria** of the period, against the goal: "2.180 kcal de media · objetivo 2.200".
- **Días en objetivo**: days within ±10 % of the goal, the same margin the
  calendar and Plan already use (`DAY_TOLERANCE` in `src/lib/calendar.ts`).
  Shown as "9 de 14 días en objetivo".
- **Días apuntados**: 12 de 14. This is the honesty line: an average over half
  the days means little, and this says so plainly.
- A small bar per week of the period: average kcal, coloured by the same
  good/high/low status as the week strip.

Only days with something logged count towards the average. A day with under
500 kcal is treated as not logged rather than as a very low day, since it is
almost always an abandoned day. That threshold needs a name and a test.

### Card 2 — Peso (optional)

- A line chart of weigh-ins over the period, with a **trend line** (the 7-day
  moving average). Raw weight jumps by a kilo with water and salt; the trend is
  what matters and the chart should make that obvious.
- Under it: **change over the period**, e.g. "−0,8 kg en 4 semanas (−0,2 kg por semana)".
- A button **Añadir peso** opening a small sheet: today's date (editable) and
  kilos. One weight per day, re-entering replaces it.
- If there is no weight at all, the card is an invitation, not an empty chart:
  "Apunta tu peso de vez en cuando y Bocados podrá ajustar tu objetivo".

Weight is the most emotive thing in the app, so: no target weight, no BMI
verdicts, no streaks, no red numbers. It is a measurement, shown next to the
food, and it can be left switched off (see §4).

### Card 3 — Ajustar el objetivo

Appears only when there is enough data (§2). It explains itself in plain
Spanish and never changes anything on its own:

> **Tu objetivo parece alto.** En 3 semanas has comido 2.180 kcal de media y has
> perdido 0,2 kg. Con eso, tu gasto real ronda las 2.300 kcal, no las 2.550 que
> calculamos. Para perder unos 0,5 kg por semana, tu objetivo sería **1.800 kcal**.
>
> [Usar 1.800 kcal] [Ahora no]

Accepting writes the new goal exactly as Objetivos does, keeping the macro split
and the protein-per-kilo rule. "Ahora no" hides the suggestion for 14 days.

### Card 4 — Macros

Average grams per macro over the period against their targets, as three bars.
Secondary: it answers "am I always short on protein?".

## 2. The maths behind the suggestion

Energy in minus energy out, measured on the person instead of estimated:

1. **Intake**: mean kcal of logged days in the window (default 21 days).
2. **Weight trend**: fit a straight line (least squares) through the weigh-ins
   of the window, and take its slope in kg per day. A line through all points
   beats "first minus last", which two noisy days can turn upside down.
3. **Real maintenance** = mean intake − (slope × 7700 / 1), where 7700 kcal ≈ 1 kg
   of body mass. Rounded to 10 kcal.
4. **Suggested goal** = real maintenance + the person's chosen adjustment
   (−500, −250, 0, +250, +500 — already in the profile as `adjustment`).

### Guardrails

The suggestion appears only when all of these hold:

- at least **14 days** in the window and **10 logged days**;
- at least **4 weigh-ins**, spread over at least 14 days;
- the suggestion differs from the current goal by **more than 100 kcal**
  (below that it is noise);
- the new goal stays within **±20 %** of the current one, and never below the
  person's BMR, and never below 1.200 kcal for women or 1.500 for men. A
  suggestion outside those bounds is clamped, and the card says it was clamped.

Additional rules:

- Only one suggestion every 14 days, whether accepted or dismissed.
- With a goal set by hand (`mode: 'manual'`) the same maths works: the estimate
  of maintenance does not depend on the formula. The card then offers the goal
  plus the adjustment the person picks in the card itself.
- The latest weight also updates `goals.profile.weightKg`, so protein per kilo
  stays right. That is a silent update, and worth a line in the card explaining
  it happened.

All of this belongs in `src/lib/progress.ts` as pure functions over arrays
(`weeklyStats`, `weightTrend`, `maintenanceEstimate`, `suggestGoal`), tested the
way `energy.ts` and `protein.ts` are. No dates, no Dexie, no React in there.

## 3. Navigation

Four tabs is the limit on a phone, and **Alimentos** is maintenance, not daily
use. Proposed:

| Now | After |
|---|---|
| Diario · Plan · Alimentos · Objetivos | Diario · Plan · **Progreso** · Objetivos |

Alimentos moves inside **Objetivos**, as a row "Alimentos y recetas" that opens
the current screen unchanged. `#/foods` keeps working, so nothing breaks for
someone who bookmarked it, and the laptop sidebar can keep showing it as a
fifth entry, since there is room there.

Swiping between tabs keeps working: the order in `TABS` becomes
`today, plan, progress, goals`.

## 4. Data

A new table in `src/db.ts`, version 7:

```ts
weights: 'date'   // one row per day: { date: '2026-09-21', kg: 78.4, createdAt }
```

`date` as the primary key gives "one weigh-in per day, last one wins" for free.
Rows are tiny, so a year of daily weights is a few kilobytes.

Also:

- A setting `progressWeight: false` hides the weight card and the suggestion
  entirely, for anyone who would rather not see a weight. Everything else on the
  screen still works.
- A setting `goalSuggestionSnoozedUntil` holds the date the suggestion is muted
  until.
- The backup in `src/lib/backup.ts` must include `weights`, and its import must
  restore them. That file is the one place where forgetting a table loses data
  silently.

## 5. Order of work

1. **`progress.ts` with tests** — statistics, trend, maintenance, suggestion, all
   pure. Half the work, and the half that has to be right.
2. **The Progreso tab** — cards 1 and 4, the period switch, the tab swap, and
   Alimentos moved into Objetivos. Useful on its own, with no weight involved.
3. **Weight** — the table, the sheet, the chart with its trend line, the backup.
4. **The suggestion card** — guardrails, accepting, snoozing.

Steps 1–2 are one branch, 3 one branch, 4 one branch. Each is testable on the
phone by itself.

## 6. Risks and open questions

- **The chart.** A hand-drawn SVG line chart, like the existing ring, keeps the
  app free of chart libraries (~50 KB) and matches the branding. It has to work
  with 3 points and with 90.
- **Health, not a medical device.** The suggestion is about calories, never
  about health. It should never appear if someone is eating very little; a floor
  is in the guardrails, but the wording matters too.
- **A month before it is useful.** The screen is thin until there is data. The
  empty states should say what is missing and how long it takes, not look broken.
- **Weighing conditions.** Weighing at different times of day adds noise the
  trend line can absorb, but a line in the sheet ("mejor por la mañana, en
  ayunas") is cheap and helps.
- **Hitting goals is not progress.** Days-on-target is easy to game by not
  logging. "Días apuntados" next to it is the honest counterweight.

Open questions for you:

1. Weight **kg only**, or pounds too? Kg only is my default.
2. Should Progreso also show the **plan** (what is planned but not eaten), or
   only what was actually eaten? My default: only what was eaten.
3. Alimentos inside **Objetivos** (my default), or as a fifth "Más" tab?
4. Should Bocados ever **remind** anyone to weigh themselves? My default: no
   notifications at all, ever.

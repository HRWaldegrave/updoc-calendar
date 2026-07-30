# Updoc — Leave Date Selector

An interactive prototype of the **"Select Your Leave Dates"** step from Updoc's
"Request a Medical Certificate" flow. Built with **React + TypeScript + Tailwind CSS (v4)**,
bundled with **Vite**.

The whole screen is one self-contained component — [`LeaveDateSelector`](src/LeaveDateSelector.tsx) —
with all state and logic internal. [`App.tsx`](src/App.tsx) is a thin demo page.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL (default http://localhost:5173).

```bash
npm run build   # type-check + production build to dist/
npm run preview # serve the production build
```

## Share it (hosted, no server needed)

```bash
npm run build:artifact   # -> dist-artifact/leave-date-selector.html
```

This inlines the production build into a single self-contained HTML fragment and
embeds the Poppins webfont as `@font-face` data URIs (external requests are
blocked in the Claude Artifact sandbox). Publishing that file as a Claude
Artifact gives a private, shareable URL that anyone can open and fully interact
with on any device — the app is 100% client-side, so no server is required. The
shared version uses the live local clock (Artifact URLs don't carry the
`?mockDate=` param). Regenerating and republishing the same file keeps the URL.

## Mock-date override (dev/QA)

"Today" is normally read from the **real local clock** and ticks live (the
subtitle refreshes every 15s). Because the original 8 reference states are all
pinned to Sunday 2 Aug 2026 9:30pm, the component accepts a dev-only override so
QA can reproduce any scenario on demand:

- **Component prop:** `<LeaveDateSelector mockNow="2026-08-02T21:30" />`
  (also accepts a `Date`).
- **Demo query param:** `?mockDate=2026-08-02T21:30`

The demo page **defaults to the real, live local clock**. The mock override is
kept for dev/QA so any scenario can be reproduced regardless of today's date.

Handy reproductions:

| URL | Reproduces |
|---|---|
| `/` or `/?mockDate=live` | Live **local** clock, ticking (default) |
| `/?mockDate=2026-08-02T21:30` | The original 8 reference frames (today = Sun Aug 2, 9:30pm) |
| `/?mockDate=2026-08-05T14:05` | Wednesday "today" — verifies 4-row invariant, `2:05pm` format |
| `/?mockDate=2026-08-08T00:05` | Saturday "today" — verifies 4-row invariant, `12:05am` format |

## Component API

```ts
interface LeaveDateSelectorProps {
  mockNow?: string | Date;                        // dev override for "now"
  currentStep?: number;                           // default 3
  totalSteps?: number;                            // default 7
  onContinue?: (selectedDates: Date[]) => void;   // fired only when valid
  onBack?: () => void;
}
```

`onContinue` receives the selected dates sorted ascending. The demo logs them to
the console and shows a confirmation toast.

## Time & timezone

"Today" (and the live subtitle) is read from the **browser's local timezone** and
ticks every 15s. All calendar math runs on plain `{year, month, day}` "civil
dates" anchored at **noon UTC** (see [`dateUtils.ts`](src/dateUtils.ts)) —
anchoring at noon rather than midnight means whole-day add/subtract can never be
flipped by a DST transition.

## Grid algorithm (exact)

```
rangeStart  = today - 7 days
rangeEnd    = today + 7 days           // inclusive 15-day selectable window
w           = isoWeekday(rangeStart)   // Mon=0 .. Sun=6 (same weekday as today)
firstMonday = rangeStart - w           // then -7 more if w == 0 (rangeStart is a Monday)
lastSunday  = rangeEnd + (6 - w)       // then +7 more if w == 6 (rangeEnd is a Sunday)
cells       = firstMonday .. lastSunday // 21 or 28 cells (3 or 4 rows), Mon-first
```

The grid is built so that **exactly two rows contain non-selectable dates — the
top row and the bottom row** — each with 1–7 of them, with every middle row fully
selectable. Left column is always Monday.

Why 3 or 4 rows (and not 4–5): showing all 15 selectable days with `t`/`b`
non-selectable in the top/bottom rows and `m` fully-selectable middle rows gives
`(7−t) + 7m + (7−b) = 15` ⟹ `7m − 1 = t + b`. With `t,b ∈ [1,7]`, only `m=1`
(3 rows) or `m=2` (4 rows) is possible. Since `rangeStart`/`rangeEnd` share
today's weekday: **Tue–Sat → 3 rows**; **Mon/Sun → 4 rows** (a boundary lands on a
week edge, so a full buffer week is prepended/appended to keep that row showing a
non-selectable date). Verified Mon/Tue/Sun.

**Per-cell state:** `disabled` (outside window) · `capped` (in-window but the
5-date cap is reached) · `available` · `today` (subtle `#FAF8FC` fill + `#EAE3F2`
stroke) · `selected` (overrides `today` visually). `disabled` and `capped` share
the greyed + 1px-blur look; `disabled` still carries a click handler so tapping it
surfaces the "more than a week away" warning, while `capped` cells are fully inert.

**Layout:** the calendar block (month label + card) is vertically centered in the
space between the subtitle and the footer (verified within a few px of dead
centre); messages render directly beneath the card.

## Validation model

Single **contiguous** date-range picker. Two independent message slots:

- **Slot A — blocking error (orange):** a gap in the selection, or (transient)
  an out-of-window tap. Gap takes priority. Blocks Continue.
  - The out-of-window warning is **transient**: it auto-dismisses after **5s**
    (re-armed on each disabled tap) and clears immediately on any in-window tap.
- **Slot B — advisory (blue), non-blocking, can stack:** `count ≥ 4` →
  "More than 3 dates may require additional approval."; `count == 5` → also
  "No more than 5 dates can be selected."; **any Sat/Sun selected** → also
  "Are you sure you need leave for the weekend?" (clears once no weekend date
  remains). Suppressed whenever Slot A is showing.

**5-date cap.** When 5 dates are selected, every non-selected in-window date
becomes inert and greyed (identical to out-of-window dates) — you can't add a
6th. Selected dates stay tappable so you can always deselect back under the cap.

**Disabled look.** Greyed dates (out-of-window + capped) and the disabled
Continue button carry a `filter: blur(1px)`.

Continue is enabled only for **1–5 consecutive, in-window** dates.

> **Concurrency note:** every branch decision in the tap handler is made inside a
> single `setSelected(prev => …)` functional updater, reading `prev` rather than
> the render-time `selected` closure. This keeps **rapid taps** correct — a stale
> closure would otherwise take the wrong branch and corrupt the selection when a
> user taps faster than React re-renders. (This was found and fixed during
> testing by firing four taps within a single tick.)

## Accessibility

- Date cells are real `<button>`s — focusable, activatable with Enter/Space.
- Selected cells expose `aria-pressed`; today exposes `aria-current="date"`;
  out-of-window cells expose `aria-disabled`; each has a full-date `aria-label`.
- The message area is `aria-live="polite"` so validation changes are announced —
  important for an unwell user who may be relying on assistive tech.

## Assumptions & open questions (TODO — confirm against source Figma)

These were **inferred** from the screenshots + brief, not directly evidenced.
Each is a deliberate, isolated decision that's easy to revisit:

1. **Title/subtitle alignment.** The 8 screenshots clearly **center** the title
   and subtitle; the build prompt's prose said "left-aligned". Screenshots are
   designated ground truth, so this build **centers** them. → Confirm intended
   alignment.
2. **Is today selectable?** No frame shows today selected. Assumed **yes** —
   today is selectable like any in-window date, and the `selected` style takes
   precedence over the `today` marker.
3. **Interior deselect.** Tapping a selected date **toggles it off**; removing an
   interior date keeps both remaining runs and surfaces the gap error (this is
   how the `[Aug 3, Aug 5]` gap state is reachable).
4. **Design tokens** (colors, type, spacing, radii) are best-effort
   approximations — the source Figma file wasn't share-accessible via MCP. Swap
   the values in [`src/index.css`](src/index.css) (`@theme` block) once the real
   variables are available. Structure, states, and logic are the priority and
   are exact.

## Project layout

```
index.html
src/
  main.tsx              // React entry
  App.tsx               // demo page: mock-date resolution + confirmation toast
  LeaveDateSelector.tsx // the component (all logic/state internal)
  dateUtils.ts          // timezone-safe civil-date helpers
  index.css             // Tailwind v4 import + brand @theme tokens
```

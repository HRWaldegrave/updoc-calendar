import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  compareDays,
  diffDays,
  formatTime,
  isSameDay,
  isoWeekday,
  localNow,
  monthLabel,
  monthName,
  parseMockDate,
  weekdayName,
  type CivilDate,
  type CivilDateTime,
} from './dateUtils';

/* ------------------------------------------------------------------ *
 * Constants (spec-driven)
 * ------------------------------------------------------------------ */

const WINDOW_DAYS = 7; // selectable window is today ± 7 days (15-day inclusive span)
const MAX_SELECTED = 5; // hard cap on consecutive selected days
const ADVISORY_THRESHOLD = 4; // 4+ days -> "may require additional approval"
const WEEKDAY_HEADERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

const MSG = {
  OUT_OF_RANGE: 'You cannot select dates that are more than a week away.',
  GAP: 'You can only select consecutive dates (no gaps).',
  APPROVAL: 'More than 3 dates may require additional approval.',
  CAP: 'No more than 5 dates can be selected.',
  WEEKEND: 'Are you sure you need leave for the weekend?',
} as const;

export interface LeaveDateSelectorProps {
  /**
   * Dev-only override for "now", so QA can reproduce every scenario regardless
   * of the real date. Accepts a "YYYY-MM-DDTHH:mm" string or a Date. When
   * omitted, the real local clock is used and ticks live.
   */
  mockNow?: string | Date;
  /** 1-based index of the active step. Default 3. */
  currentStep?: number;
  /** Total number of steps in the flow. Default 7. */
  totalSteps?: number;
  /** Called with the selected dates (sorted, ascending) when Continue is pressed. */
  onContinue?: (selectedDates: Date[]) => void;
  /** Called when Back is pressed. */
  onBack?: () => void;
}

/* ------------------------------------------------------------------ *
 * "now" hook — static when mocked, live (per-15s) otherwise
 * ------------------------------------------------------------------ */

function useCivilNow(mockNow?: string | Date): CivilDateTime {
  const mock = useMemo<CivilDateTime | null>(() => {
    if (mockNow == null) return null;
    if (mockNow instanceof Date) {
      return {
        year: mockNow.getFullYear(),
        month: mockNow.getMonth(),
        day: mockNow.getDate(),
        hour: mockNow.getHours(),
        minute: mockNow.getMinutes(),
      };
    }
    return parseMockDate(mockNow);
  }, [mockNow]);

  const [now, setNow] = useState<CivilDateTime>(() => mock ?? localNow());

  useEffect(() => {
    if (mock) {
      setNow(mock);
      return;
    }
    setNow(localNow());
    // Re-render well within a minute so the live clock/subtitle stays fresh.
    const id = window.setInterval(() => setNow(localNow()), 15_000);
    return () => window.clearInterval(id);
  }, [mock]);

  return now;
}

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

function hasGapIn(list: CivilDate[]): boolean {
  if (list.length <= 1) return false;
  const sorted = [...list].sort(compareDays);
  for (let i = 1; i < sorted.length; i++) {
    if (diffDays(sorted[i], sorted[i - 1]) !== 1) return true;
  }
  return false;
}

// 'disabled' = outside the ±7 window (tappable → shows the out-of-range warning).
// 'capped'   = in-window but inert because the 5-date cap is reached.
type CellState = 'disabled' | 'capped' | 'available' | 'today' | 'selected';

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export function LeaveDateSelector({
  mockNow,
  currentStep = 3,
  totalSteps = 7,
  onContinue,
  onBack,
}: LeaveDateSelectorProps) {
  const now = useCivilNow(mockNow);
  const today: CivilDate = { year: now.year, month: now.month, day: now.day };

  // Grid + window are derived purely from "today" (recompute only when the day changes).
  //
  // The grid is built so that EXACTLY two rows contain non-selectable dates — the
  // top row and the bottom row — each with 1-7 of them, and every middle row is
  // fully selectable. Since rangeStart/rangeEnd share today's weekday, this yields
  // 3 rows (Tue-Sat) or 4 rows (Mon/Sun, where a boundary lands on a week edge and
  // a full buffer week is added so that boundary row still shows a non-selectable).
  const { cells, rangeStart, rangeEnd } = useMemo(() => {
    const rStart = addDays(today, -WINDOW_DAYS);
    const rEnd = addDays(today, WINDOW_DAYS);
    const w = isoWeekday(rStart); // Mon=0 .. Sun=6 (same weekday as today)

    // Monday of rangeStart's week. If rangeStart IS a Monday, that week would be
    // fully selectable, so prepend a full non-selectable buffer week as the top row.
    let firstMonday = addDays(rStart, -w);
    if (w === 0) firstMonday = addDays(firstMonday, -7);

    // Sunday of rangeEnd's week. If rangeEnd IS a Sunday, that week would be fully
    // selectable, so append a full non-selectable buffer week as the bottom row.
    let lastSunday = addDays(rEnd, 6 - w);
    if (w === 6) lastSunday = addDays(lastSunday, 7);

    const total = diffDays(lastSunday, firstMonday) + 1; // 21 or 28 (3 or 4 rows)
    const grid = Array.from({ length: total }, (_, i) => addDays(firstMonday, i));
    return { cells: grid, rangeStart: rStart, rangeEnd: rEnd };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.year, today.month, today.day]);

  const [selected, setSelected] = useState<CivilDate[]>([]);
  // Transient warning after tapping an out-of-window cell. Stored as the
  // timestamp of the last trigger (or null) so each tap re-arms the auto-dismiss.
  const [outOfRangeAt, setOutOfRangeAt] = useState<number | null>(null);
  const outOfRange = outOfRangeAt !== null;

  // If the real date rolls over (or the mock changes), start fresh — a stale
  // selection could otherwise sit outside the new window.
  useEffect(() => {
    setSelected([]);
    setOutOfRangeAt(null);
  }, [today.year, today.month, today.day]);

  // Auto-dismiss the out-of-range warning after 5s. The effect re-runs on every
  // new trigger (the timestamp changes), so the timer is re-armed each tap.
  useEffect(() => {
    if (outOfRangeAt === null) return;
    const id = window.setTimeout(() => setOutOfRangeAt(null), 5000);
    return () => window.clearTimeout(id);
  }, [outOfRangeAt]);

  const inWindow = (d: CivilDate) =>
    compareDays(d, rangeStart) >= 0 && compareDays(d, rangeEnd) <= 0;

  const isSelected = (d: CivilDate) => selected.some((s) => isSameDay(s, d));

  /* --------------------------- tap handler --------------------------- */
  function handleTap(d: CivilDate) {
    // 1. Out of window: never selects; shows the transient blocking warning
    //    (and re-arms its 5s auto-dismiss timer).
    if (!inWindow(d)) {
      setOutOfRangeAt(Date.now());
      return;
    }

    // Any in-window tap dismisses the transient out-of-range warning.
    setOutOfRangeAt(null);

    // All branch decisions read `prev` (the latest committed state), never the
    // render-time `selected` closure. This keeps rapid taps correct even when a
    // user taps faster than React re-renders (a stale closure would otherwise
    // take the wrong branch and corrupt the selection).
    setSelected((prev) => {
      const isSel = prev.some((s) => isSameDay(s, d));

      // 2. Cap: once MAX are selected, non-selected in-window dates are inert
      //    (they also render greyed/disabled). Selected dates stay tappable so
      //    the user can always deselect to get back under the cap.
      if (!isSel && prev.length >= MAX_SELECTED) {
        return prev;
      }

      // 3. Toggle-off an already-selected date. Removing an interior date can
      //    split the run into two groups — we keep both (gap error surfaces).
      if (isSel) {
        return prev.filter((s) => !isSameDay(s, d));
      }

      // 4. Add the date. Adjacent -> extends the run; non-adjacent -> creates a
      //    gap so both runs render highlighted and the gap error can show.
      //    (Only reachable below the cap, so no 6th-day special-casing needed.)
      return [...prev, d].sort(compareDays);
    });
  }

  /* ------------------------- derived flags --------------------------- */
  const hasGap = hasGapIn(selected);
  const count = selected.length;
  const canContinue = count >= 1 && !hasGap;

  // Slot A — blocking error (orange). Gap takes priority over out-of-range.
  const slotA = hasGap ? MSG.GAP : outOfRange ? MSG.OUT_OF_RANGE : null;

  // Any selected date that falls on a Saturday (isoWeekday 5) or Sunday (6).
  const hasWeekend = selected.some((d) => isoWeekday(d) >= 5);

  // Slot B — advisory notices (blue). Fully suppressed while Slot A is showing.
  const slotB: string[] = [];
  if (!slotA && !hasGap) {
    if (count >= ADVISORY_THRESHOLD) slotB.push(MSG.APPROVAL);
    if (count === MAX_SELECTED) slotB.push(MSG.CAP);
    if (hasWeekend) slotB.push(MSG.WEEKEND);
  }

  const cellStateOf = (d: CivilDate): CellState => {
    if (isSelected(d)) return 'selected'; // selected overrides "today" visually
    if (!inWindow(d)) return 'disabled';
    // At the cap, every non-selected in-window date is inert + greyed.
    if (count >= MAX_SELECTED) return 'capped';
    if (isSameDay(d, today)) return 'today';
    return 'available';
  };

  const handleContinue = () => {
    if (!canContinue) return;
    const dates = [...selected]
      .sort(compareDays)
      .map((d) => new Date(d.year, d.month, d.day));
    onContinue?.(dates);
  };

  const label = monthLabel(cells);
  const timeStr = formatTime(now.hour, now.minute);
  const dateStr = `${weekdayName(today)}, ${monthName(today.month)} ${today.day}`;

  /* ------------------------------ view ------------------------------- */
  return (
    <div className="flex min-h-screen w-full justify-center bg-neutral-200">
      <div className="relative flex min-h-screen w-full max-w-[430px] flex-col bg-white">
        <main className="flex flex-1 flex-col px-6 pt-8 pb-4">
          {/* Top group: logo, progress, title, subtitle (natural height, pinned top) */}
          <div>
          {/* 1. Logo (hidden on short viewports to reclaim vertical space) */}
          <div className="compact-hide flex justify-center">
            <span className="relative text-3xl font-bold lowercase tracking-tight text-brand-navy">
              <span
                aria-hidden="true"
                className="absolute -top-1.5 left-[1.15em] text-sm font-bold text-brand-purple"
              >
                ✚
              </span>
              updoc
            </span>
          </div>

          {/* 2. Step progress bar (hidden on short viewports) */}
          <div
            className="compact-hide mt-6 flex gap-2"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={currentStep}
            aria-label={`Step ${currentStep} of ${totalSteps}`}
          >
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  i < currentStep ? 'bg-brand-purple' : 'bg-brand-progress-off'
                }`}
              />
            ))}
          </div>

          {/* 3. Title (rises toward the top when the logo/progress are hidden) */}
          <h1 className="compact-tight mt-8 text-center text-[24px] font-bold leading-tight text-brand-navy">
            Select Your Leave Dates
          </h1>

          {/* 4. Dynamic subtitle */}
          <p className="mt-2 text-center text-sm" aria-live="off">
            <span className="text-brand-muted">It is {timeStr} on </span>
            <span className="font-semibold text-brand-navy">{dateStr}</span>
          </p>
          </div>

          {/* Calendar block — vertically centered in the space between the
              subtitle and the footer (grows to fill, centers its content). */}
          <div className="flex flex-1 flex-col justify-center">
          {/* 5. Month label */}
          <p className="text-base font-semibold text-brand-navy">{label}</p>

          {/* 6. Calendar card */}
          <div className="mt-3 rounded-2xl border-[1.5px] border-neutral-900 bg-white p-4">
            {/* Weekday header */}
            <div className="grid grid-cols-7">
              {WEEKDAY_HEADERS.map((w) => (
                <div
                  key={w}
                  className="text-center text-xs font-bold uppercase tracking-wide text-brand-muted"
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Date cells: 3 or 4 rows of 7 (see grid algorithm above). Cells
                fill their column and a single `gap` drives both the row and
                column spacing, so the two stay equal at any viewport width. */}
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d) => {
                const state = cellStateOf(d);
                const greyed = state === 'disabled' || state === 'capped';
                const inert = state === 'capped'; // no message, no pointer events
                const base =
                  'flex h-10 w-full items-center justify-center rounded-2xl text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1';
                const byState =
                  state === 'selected'
                    ? 'bg-brand-purple font-bold text-white'
                    : state === 'today'
                      ? 'border border-brand-today-stroke bg-brand-today-fill font-bold text-brand-navy'
                      : state === 'available'
                        ? 'font-medium text-brand-navy hover:bg-neutral-100'
                        : `font-normal text-brand-disabled cursor-not-allowed${
                            inert ? ' pointer-events-none' : ''
                          }`;

                return (
                  <button
                    key={dateKey(d)}
                    type="button"
                    onClick={() => handleTap(d)}
                    aria-disabled={greyed || undefined}
                    aria-pressed={state === 'selected'}
                    aria-current={state === 'today' ? 'date' : undefined}
                    aria-label={fullDateLabel(d)}
                    className={`${base} ${byState}${greyed ? ' disabled-blur' : ''}`}
                  >
                    {d.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. Message area. A fixed reserved height keeps the calendar from
              jumping when messages appear/disappear — the space is always held,
              sized for the worst realistic case (5-day range incl. a weekend). */}
          <div className="mt-3 min-h-[7rem] space-y-1" aria-live="polite">
            {slotA && (
              <p className="text-sm font-medium text-brand-warn">{slotA}</p>
            )}
            {slotB.map((msg) => (
              <p key={msg} className="text-sm font-medium text-brand-info">
                {msg}
              </p>
            ))}
          </div>
          </div>
        </main>

        {/* 8. Sticky footer — single instance, pinned to the viewport bottom */}
        <footer className="sticky bottom-0 bg-white px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onBack?.()}
              className="w-[34%] rounded-2xl border-2 border-brand-purple bg-white py-4 text-lg font-bold text-brand-purple transition-colors hover:bg-brand-lavender"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue}
              aria-disabled={!canContinue}
              className={`flex-1 rounded-2xl py-4 text-lg font-bold transition-colors ${
                canContinue
                  ? 'cursor-pointer bg-brand-purple text-white hover:brightness-95'
                  : 'cursor-not-allowed bg-brand-continue-off text-white/70 disabled-blur'
              }`}
            >
              Continue
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function dateKey(d: CivilDate): string {
  return `${d.year}-${d.month}-${d.day}`;
}

function fullDateLabel(d: CivilDate): string {
  return `${weekdayName(d)}, ${monthName(d.month)} ${d.day}, ${d.year}`;
}

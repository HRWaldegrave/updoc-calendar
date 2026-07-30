import { useState } from 'react';
import { LeaveDateSelector } from './LeaveDateSelector';

/**
 * Demo page. Renders the component full-screen at a mobile width, centered on
 * larger viewports.
 *
 * By default it uses the real, LIVE local clock. A mock-date override is kept
 * for dev/QA so any scenario can be reproduced regardless of the real date:
 *   - (no param)                  -> live local clock (default)
 *   - ?mockDate=2026-08-02T21:30  -> reproduces the original 8 reference states
 *   - ?mockDate=live (or =now/=real) -> explicit live local clock
 */
const LIVE_VALUES = new Set(['live', 'now', 'real']);

function resolveMockNow(): string | undefined {
  const param = new URLSearchParams(window.location.search).get('mockDate');
  if (param === null) return undefined; // live local clock by default
  if (LIVE_VALUES.has(param.toLowerCase())) return undefined;
  return param;
}

function formatRange(dates: Date[]): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
  if (dates.length === 0) return '';
  if (dates.length === 1) return fmt(dates[0]);
  return `${fmt(dates[0])} → ${fmt(dates[dates.length - 1])} (${dates.length} days)`;
}

export default function App() {
  const mockNow = resolveMockNow();
  const [confirmed, setConfirmed] = useState<Date[] | null>(null);

  return (
    <>
      <LeaveDateSelector
        mockNow={mockNow}
        onContinue={(dates) => {
          // Demo behaviour: log to console + show a confirmation toast.
          // eslint-disable-next-line no-console
          console.log('onContinue — selected dates:', dates);
          setConfirmed(dates);
        }}
        onBack={() => {
          // eslint-disable-next-line no-console
          console.log('onBack pressed');
        }}
      />

      {confirmed && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-[398px] items-start gap-3 rounded-2xl bg-brand-navy px-4 py-3 text-white shadow-lg">
            <div className="flex-1">
              <p className="text-sm font-semibold">Leave dates confirmed</p>
              <p className="text-sm text-white/80">{formatRange(confirmed)}</p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmed(null)}
              className="rounded-lg px-2 py-0.5 text-lg leading-none text-white/70 hover:text-white"
              aria-label="Dismiss confirmation"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}

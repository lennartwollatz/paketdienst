import type { SyncProgressEvent } from '../api/emailAccounts';
import { getPhaseSharePercent } from '../lib/syncPercent';

const PHASE_COLORS: Record<SyncProgressEvent['phase'], string> = {
  fetch:    'bg-sky-500',
  analyze:  'bg-violet-500',
  tracking: 'bg-amber-500',
  load:     'bg-emerald-500',
};

interface Props {
  progress: SyncProgressEvent;
}

export default function SyncProgressBar({ progress }: Props) {
  const barColor = PHASE_COLORS[progress.phase] ?? 'bg-blue-500';
  const phaseShare = getPhaseSharePercent(progress.phase);
  const barFill = Math.min(100, Math.max(0, progress.percent));

  return (
    <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-blue-900 truncate">{progress.label}</p>
        <span className="text-xs font-semibold text-blue-700 tabular-nums flex-shrink-0">
          {phaseShare}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${barColor}`}
          style={{ width: `${barFill}%` }}
        />
      </div>
      {progress.total > 0 && (
        <p className="mt-1 text-[10px] text-blue-600/80">
          Schritt {progress.current} von {progress.total}
        </p>
      )}
    </div>
  );
}

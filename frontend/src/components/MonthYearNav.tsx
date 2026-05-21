import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel } from '../lib/expenseStats';
import {
  periodNavButtonClass,
  periodNavIconClass,
  periodNavSelectOverlayClass,
  periodNavValueClass,
} from './periodNavStyles';

interface Option {
  key: string;
  label: string;
}

interface Props {
  monthKey: string;
  options: Option[];
  onChange: (monthKey: string) => void;
}

export default function MonthYearNav({ monthKey, options, onChange }: Props) {
  const sortedKeys = useMemo(
    () => [...options.map((o) => o.key)].sort((a, b) => b.localeCompare(a)),
    [options],
  );

  const prevKey = useMemo(() => {
    for (let i = 0; i < sortedKeys.length; i += 1) {
      if (sortedKeys[i] < monthKey) return sortedKeys[i];
    }
    return null;
  }, [sortedKeys, monthKey]);

  const nextKey = useMemo(() => {
    for (let i = sortedKeys.length - 1; i >= 0; i -= 1) {
      if (sortedKeys[i] > monthKey) return sortedKeys[i];
    }
    return null;
  }, [sortedKeys, monthKey]);

  const canGoPrev = prevKey != null;
  const canGoNext = nextKey != null;

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0 text-gray-500">
      <button
        type="button"
        onClick={() => prevKey != null && onChange(prevKey)}
        disabled={!canGoPrev}
        className={periodNavButtonClass(canGoPrev)}
        aria-label="Vorheriger Monat"
      >
        <ChevronLeft className={periodNavIconClass} />
      </button>
      <div className="group relative inline-flex items-center justify-center max-w-[7.5rem] px-0.5">
        <span className={`${periodNavValueClass} truncate text-center`}>
          {monthLabel(monthKey)}
        </span>
        <select
          value={monthKey}
          onChange={(e) => onChange(e.target.value)}
          className={periodNavSelectOverlayClass}
          aria-label="Monat und Jahr wählen"
        >
          {!options.some((o) => o.key === monthKey) && (
            <option value={monthKey}>{monthLabel(monthKey)}</option>
          )}
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => nextKey != null && onChange(nextKey)}
        disabled={!canGoNext}
        className={periodNavButtonClass(canGoNext)}
        aria-label="Nächster Monat"
      >
        <ChevronRight className={periodNavIconClass} />
      </button>
    </div>
  );
}

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  periodNavButtonClass,
  periodNavIconClass,
  periodNavSelectOverlayClass,
  periodNavValueClass,
} from './periodNavStyles';

interface Option {
  key: number;
  label: string;
}

interface Props {
  year: number;
  options: Option[];
  onChange: (year: number) => void;
}

export default function YearNav({ year, options, onChange }: Props) {
  const sortedYears = useMemo(
    () => [...options.map((o) => o.key)].sort((a, b) => a - b),
    [options],
  );

  const prevYear = useMemo(() => {
    for (let i = sortedYears.length - 1; i >= 0; i -= 1) {
      if (sortedYears[i] < year) return sortedYears[i];
    }
    return null;
  }, [sortedYears, year]);

  const nextYear = useMemo(() => {
    for (const y of sortedYears) {
      if (y > year) return y;
    }
    return null;
  }, [sortedYears, year]);

  const canGoPrev = prevYear != null;
  const canGoNext = nextYear != null;

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0 text-gray-500">
      <button
        type="button"
        onClick={() => prevYear != null && onChange(prevYear)}
        disabled={!canGoPrev}
        className={periodNavButtonClass(canGoPrev)}
        aria-label="Vorheriges Jahr"
      >
        <ChevronLeft className={periodNavIconClass} />
      </button>
      <div className="group relative inline-flex items-center justify-center min-w-[2.5rem] px-0.5">
        <span className={`${periodNavValueClass} tabular-nums`}>{year}</span>
        <select
          value={year}
          onChange={(e) => onChange(Number(e.target.value))}
          className={periodNavSelectOverlayClass}
          aria-label="Jahr wählen"
        >
          {!options.some((o) => o.key === year) && (
            <option value={year}>{year}</option>
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
        onClick={() => nextYear != null && onChange(nextYear)}
        disabled={!canGoNext}
        className={periodNavButtonClass(canGoNext)}
        aria-label="Nächstes Jahr"
      >
        <ChevronRight className={periodNavIconClass} />
      </button>
    </div>
  );
}

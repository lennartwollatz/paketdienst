import type { AnalyticsMetric } from '../lib/expenseStats';

interface Props {
  metric: AnalyticsMetric;
  onChange: (metric: AnalyticsMetric) => void;
}

export default function AnalyticsMetricToggle({ metric, onChange }: Props) {
  return (
    <div
      className="flex rounded-full border border-gray-200 bg-white p-0.5 text-xs font-medium"
      role="group"
      aria-label="Anzeigemodus"
    >
      <button
        type="button"
        onClick={() => onChange('amount')}
        className={`px-3 py-1.5 rounded-full transition-all ${
          metric === 'amount'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Euro
      </button>
      <button
        type="button"
        onClick={() => onChange('count')}
        className={`px-3 py-1.5 rounded-full transition-all ${
          metric === 'count'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Anzahl
      </button>
    </div>
  );
}

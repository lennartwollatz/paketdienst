import CategoryIcon from '../CategoryIcon';
import {
  formatChartValue,
  formatDeliveredPending,
  type AnalyticsMetric,
} from '../../lib/expenseStats';
import type { ChartBar } from '../../lib/expenseStats';

interface Props {
  items: ChartBar[];
  metric: AnalyticsMetric;
  onBarClick?: (item: ChartBar) => void;
  selectedKey?: string | null;
  emptyMessage?: string;
  /** Vertikale Monatsdurchschnittslinie je Kategorie (365-Tage-Durchschnitt). */
  showAverageLine?: boolean;
  /** Monatsdurchschnitt je Kategorie (365 Tage), key = categoryId. */
  averageByKey?: Map<string, number>;
}

const ROW_H = 36;
const LABEL_W = 132;
const VALUE_COL_W = 64;
const PAD = 8;

export default function HorizontalBarChart({
  items,
  metric,
  onBarClick,
  selectedKey,
  emptyMessage = 'Keine Daten',
  showAverageLine = false,
  averageByKey,
}: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">{emptyMessage}</p>
    );
  }

  const max = Math.max(...items.map((i) => i.value), 1);
  const chartW = 200;
  const height = items.length * ROW_H + PAD * 2;
  const width = LABEL_W + chartW + VALUE_COL_W + PAD * 2;
  const valueX = width - PAD;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="Horizontales Balkendiagramm"
    >
      {items.map((item, i) => {
        const y = PAD + i * ROW_H;
        const totalW = (item.value / max) * chartW;
        const deliveredW = item.value > 0 ? (item.delivered / item.value) * totalW : 0;
        const pendingW = item.value > 0 ? (item.pending / item.value) * totalW : 0;
        const barY = y + 6;
        const barH = ROW_H - 12;
        const selected = selectedKey === item.key;
        const clickable = Boolean(onBarClick);
        const blueClass = selected ? 'fill-blue-600' : 'fill-blue-400';
        const grayClass = selected ? 'fill-gray-400' : 'fill-gray-300';
        const clickHandler = () => onBarClick?.(item);
        const monthlyAvg = averageByKey?.get(item.key) ?? 0;
        const avgLineX = LABEL_W + (monthlyAvg / max) * chartW;
        const showRowAvg = showAverageLine && monthlyAvg > 0;

        return (
          <g key={item.key}>
            <title>
              {`${item.label}: ${formatChartValue(item.value, metric)} (${formatDeliveredPending(item.delivered, item.pending, metric)})`}
            </title>
            {showRowAvg && (
              <line
                x1={avgLineX}
                y1={barY}
                x2={avgLineX}
                y2={barY + barH}
                className="stroke-amber-500"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                aria-hidden
              />
            )}
            <foreignObject x={0} y={y + 2} width={LABEL_W} height={ROW_H - 4}>
              <div className="flex items-center gap-1 h-full min-w-0">
                <CategoryIcon
                  categoryId={item.key}
                  className="w-3 h-3 text-gray-500 flex-shrink-0"
                />
                <span className="text-[10px] text-gray-700 truncate leading-none">
                  {item.label}
                </span>
              </div>
            </foreignObject>
            {deliveredW > 0 && (
              <rect
                x={LABEL_W}
                y={barY}
                width={Math.max(deliveredW, 2)}
                height={barH}
                rx={pendingW > 0 ? 0 : 4}
                className={`${blueClass} ${clickable ? 'cursor-pointer hover:fill-blue-500' : ''}`}
                onClick={clickHandler}
              />
            )}
            {pendingW > 0 && (
              <rect
                x={LABEL_W + deliveredW}
                y={barY}
                width={Math.max(pendingW, 2)}
                height={barH}
                rx={4}
                className={`${grayClass} ${clickable ? 'cursor-pointer hover:fill-gray-400' : ''}`}
                onClick={clickHandler}
              />
            )}
            {item.value > 0 && totalW < 4 && (
              <rect
                x={LABEL_W}
                y={barY}
                width={4}
                height={barH}
                rx={4}
                className={grayClass}
                onClick={clickHandler}
              />
            )}
            <text
              x={valueX}
              y={y + ROW_H / 2 + 4}
              textAnchor="end"
              className="fill-gray-500 text-[9px]"
              style={{ fontSize: 9 }}
            >
              {formatChartValue(item.value, metric)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

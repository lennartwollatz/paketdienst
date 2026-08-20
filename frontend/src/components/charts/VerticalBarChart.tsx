import { useEffect, useRef, useState } from 'react';
import {
  formatChartValue,
  formatDeliveredPending,
  monthLabel,
  type AnalyticsMetric,
} from '../../lib/expenseStats';
import type { ChartBar } from '../../lib/expenseStats';

interface Props {
  items: ChartBar[];
  metric: AnalyticsMetric;
  onBarClick?: (item: ChartBar) => void;
  selectedKey?: string | null;
  height?: number;
  emptyMessage?: string;
  /** Horizontale Monats-Durchschnittslinie (365-Tage-Durchschnitt). */
  showAverageLine?: boolean;
  /** Ø-Wert rechts an der Linie (Standard: an). */
  showAverageLabel?: boolean;
  /** Monatsdurchschnitt der letzten 365 Tage; erforderlich bei showAverageLine. */
  averageValue?: number;
}

/** Wert-Label immer oberhalb des Balkens (schwarz). */
function barValueLabelY(barTop: number): number {
  return barTop - 6;
}

function segmentTitle(item: ChartBar, label: string, metric: AnalyticsMetric): string {
  const base = /^\d{4}-\d{2}$/.test(item.key) ? monthLabel(item.key) : item.label;
  return `${base}: ${formatChartValue(item.value, metric)} (${formatDeliveredPending(item.delivered, item.pending, metric)})`;
}

function layoutBars(plotWidth: number, count: number, height: number) {
  const padX = 6;
  const valueLabelH = 14;
  const monthLabelH = 18;
  const chartTop = valueLabelH;
  const chartH = height - monthLabelH - chartTop;
  const baselineY = chartTop + chartH;
  const inner = plotWidth - padX * 2;
  const slotW = inner / Math.max(count, 1);
  const barW = Math.max(4, slotW * 0.72);

  const slotCenter = (index: number) => padX + (index + 0.5) * slotW;
  const barX = (index: number) => slotCenter(index) - barW / 2;

  return { padX, barW, slotW, slotCenter, barX, plotWidth, chartTop, chartH, baselineY };
}

export default function VerticalBarChart({
  items,
  metric,
  onBarClick,
  selectedKey,
  height = 200,
  emptyMessage = 'Keine Daten',
  showAverageLine = false,
  showAverageLabel = true,
  averageValue: averageValueProp,
}: Props) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(0);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setPlotWidth(Math.floor(w));
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">{emptyMessage}</p>
    );
  }

  const max = Math.max(...items.map((i) => i.value), 1);
  const averageValue = showAverageLine ? (averageValueProp ?? 0) : 0;
  const showAvg = showAverageLine && averageValue > 0;
  const width = plotWidth || 320;
  const layout = layoutBars(width, items.length, height);
  const { padX, barW, slotCenter, barX, chartTop, chartH, baselineY } = layout;
  const averageY = showAvg
    ? baselineY - (averageValue / max) * chartH
    : null;

  return (
    <div ref={plotRef} className="w-full">
      {plotWidth > 0 && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full"
          style={{ height }}
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label="Balkendiagramm"
        >
          {showAvg && averageY != null && (
            <g aria-hidden>
              <line
                x1={padX}
                y1={averageY}
                x2={width - padX}
                y2={averageY}
                className="stroke-amber-500"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              {showAverageLabel && (
                <text
                  x={width - padX}
                  y={averageY - 4}
                  textAnchor="end"
                  className="fill-amber-600"
                  style={{ fontSize: 7, pointerEvents: 'none' }}
                >
                  {`Ø ${formatChartValue(averageValue, metric)}`}
                </text>
              )}
            </g>
          )}
          {items.map((item, i) => {
            const totalH = (item.value / max) * chartH;
            const deliveredH = item.value > 0 ? (item.delivered / item.value) * totalH : 0;
            const pendingH = item.value > 0 ? (item.pending / item.value) * totalH : 0;
            const x = barX(i);
            const centerX = slotCenter(i);
            const selected = selectedKey === item.key;
            const clickable = Boolean(onBarClick);

            const displayTotalH = Math.max(totalH, item.value > 0 ? 4 : 0);
            const barTop = baselineY - displayTotalH;
            const valueY = barValueLabelY(barTop);

            const deliveredY = baselineY - deliveredH;
            const pendingY = baselineY - deliveredH - pendingH;

            const blueClass = selected ? 'fill-blue-600' : clickable ? 'fill-blue-400' : 'fill-blue-400';
            const grayClass = selected ? 'fill-gray-400' : 'fill-gray-300';
            const clickHandler = () => onBarClick?.(item);

            return (
              <g key={item.key}>
                <title>{segmentTitle(item, item.label, metric)}</title>
                {item.value === 0 && clickable && (
                  <rect
                    x={x}
                    y={chartTop}
                    width={barW}
                    height={chartH}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={clickHandler}
                  />
                )}
                {deliveredH > 0 && (
                  <rect
                    x={x}
                    y={deliveredY}
                    width={barW}
                    height={Math.max(deliveredH, 2)}
                    rx={pendingH > 0 ? 0 : 4}
                    className={`${blueClass} ${clickable ? 'cursor-pointer hover:fill-blue-500' : ''}`}
                    onClick={clickHandler}
                  />
                )}
                {pendingH > 0 && (
                  <rect
                    x={x}
                    y={pendingY}
                    width={barW}
                    height={Math.max(pendingH, 2)}
                    rx={4}
                    className={`${grayClass} ${clickable ? 'cursor-pointer hover:fill-gray-400' : ''}`}
                    onClick={clickHandler}
                  />
                )}
                {item.value > 0 && deliveredH === 0 && pendingH === 0 && (
                  <rect
                    x={x}
                    y={barTop}
                    width={barW}
                    height={4}
                    rx={4}
                    className={grayClass}
                    onClick={clickHandler}
                  />
                )}
                {pendingH > 0 && deliveredH > 0 && (
                  <rect
                    x={x}
                    y={pendingY + pendingH - 1}
                    width={barW}
                    height={1}
                    className="fill-white/30 pointer-events-none"
                  />
                )}
                {item.value > 0 && (
                  <text
                    x={centerX}
                    y={valueY}
                    textAnchor="middle"
                    className="fill-gray-900"
                    style={{ fontSize: 8, pointerEvents: 'none' }}
                  >
                    {formatChartValue(item.value, metric)}
                  </text>
                )}
                <text
                  x={centerX}
                  y={baselineY + 10}
                  textAnchor="middle"
                  className="fill-gray-500 text-[9px]"
                  style={{ fontSize: 9 }}
                >
                  {item.label}
                </text>
              </g>
            );
          })}
          <line
            x1={padX}
            y1={baselineY}
            x2={width - padX}
            y2={baselineY}
            className="stroke-gray-200"
            strokeWidth={1}
          />
        </svg>
      )}
    </div>
  );
}

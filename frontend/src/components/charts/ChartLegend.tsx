interface Props {
  showAverage?: boolean;
}

export default function ChartLegend({ showAverage = false }: Props) {
  return (
    <div className="flex items-center justify-end gap-4 text-xs text-gray-500 mb-2 flex-wrap">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm bg-blue-400" aria-hidden />
        Geliefert
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm bg-gray-300" aria-hidden />
        Noch nicht geliefert
      </span>
      {showAverage && (
        <span className="flex items-center gap-1.5">
          <span
            className="w-5 h-0 border-t-2 border-dashed border-amber-500"
            aria-hidden
          />
          Monatsdurchschnitt
        </span>
      )}
    </div>
  );
}

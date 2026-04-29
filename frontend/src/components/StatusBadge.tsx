const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  processing:        { label: 'In Bearbeitung',  classes: 'bg-purple-100 text-purple-700' },
  'in transit':      { label: 'Im Versand',      classes: 'bg-blue-100 text-blue-700' },
  'in packstation':  { label: 'In Packstation',  classes: 'bg-amber-100 text-amber-700' },
  delivered:         { label: 'Zugestellt',       classes: 'bg-green-100 text-green-700' },
  unknown:           { label: 'Unbekannt',        classes: 'bg-gray-100 text-gray-500' },
};

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const key = status.toLowerCase();
  const config = STATUS_CONFIG[key] || { label: status, classes: 'bg-gray-100 text-gray-600' };
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${config.classes} ${sizeClasses}`}>
      {config.label}
    </span>
  );
}

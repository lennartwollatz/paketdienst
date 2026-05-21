import { categoryLabel } from '../constants/orderCategories';
import CategoryIcon from './CategoryIcon';

interface Props {
  categoryId: string | null | undefined;
  size?: 'sm' | 'md';
}

export default function CategoryChip({ categoryId, size = 'sm' }: Props) {
  const label = categoryLabel(categoryId);
  if (!label) return null;

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-sm px-2.5 py-1 gap-1.5';
  const iconClass = size === 'sm' ? 'w-3 h-3 text-gray-500' : 'w-3.5 h-3.5 text-gray-500';

  return (
    <span className={`inline-flex items-center rounded-full font-medium bg-gray-100 text-gray-700 ${sizeClass}`}>
      <CategoryIcon categoryId={categoryId} className={iconClass} />
      {label}
    </span>
  );
}

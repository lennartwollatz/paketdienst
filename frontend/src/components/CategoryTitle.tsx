import { categoryDisplayLabel } from '../lib/expenseStats';
import CategoryIcon from './CategoryIcon';

interface Props {
  categoryId: string;
  className?: string;
  iconClassName?: string;
  as?: 'h2' | 'h3' | 'span' | 'p';
}

export default function CategoryTitle({
  categoryId,
  className = '',
  iconClassName = 'w-4 h-4 text-gray-500 flex-shrink-0',
  as: Tag = 'span',
}: Props) {
  return (
    <Tag className={`inline-flex items-center gap-1.5 min-w-0 ${className}`.trim()}>
      <CategoryIcon categoryId={categoryId} className={iconClassName} />
      <span className="truncate">{categoryDisplayLabel(categoryId)}</span>
    </Tag>
  );
}

import { categoryIcon } from '../constants/categoryIcons';

interface Props {
  categoryId: string | null | undefined;
  className?: string;
}

export default function CategoryIcon({ categoryId, className = 'w-4 h-4' }: Props) {
  const Icon = categoryIcon(categoryId);
  return <Icon className={className} aria-hidden />;
}

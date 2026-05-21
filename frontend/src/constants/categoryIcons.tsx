import type { LucideIcon } from 'lucide-react';
import {
  Shirt,
  Laptop,
  Sparkles,
  UtensilsCrossed,
  Truck,
  Dumbbell,
  Car,
  Wallet,
  HeartPulse,
  Home,
  Plane,
  CircleHelp,
} from 'lucide-react';
import type { OrderCategoryId } from './orderCategories';

const ICON_BY_CATEGORY: Record<OrderCategoryId, LucideIcon> = {
  klamotten: Shirt,
  software_technik: Laptop,
  kosmetik: Sparkles,
  essen: UtensilsCrossed,
  transport_logistik: Truck,
  freizeit_sport: Dumbbell,
  auto: Car,
  finanzen: Wallet,
  gesundheit: HeartPulse,
  haus_wohnen: Home,
  urlaub: Plane,
};

export function categoryIcon(categoryId: string | null | undefined): LucideIcon {
  if (!categoryId) return CircleHelp;
  return ICON_BY_CATEGORY[categoryId as OrderCategoryId] ?? CircleHelp;
}

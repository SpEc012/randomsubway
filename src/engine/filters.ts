import { byCategory } from '../data/ingredients';
import type { Category, FilterId, Ingredient, Tag } from '../data/types';

export interface FilterDef {
  id: FilterId;
  label: string;
  excludes: readonly Tag[];
}

export const FILTERS: readonly FilterDef[] = [
  { id: 'vegetarian', label: 'Vegetarian', excludes: ['pork', 'beef', 'poultry', 'fish'] },
  { id: 'vegan', label: 'Vegan', excludes: ['pork', 'beef', 'poultry', 'fish', 'dairy', 'egg'] },
  { id: 'pescatarian', label: 'Pescatarian', excludes: ['pork', 'beef', 'poultry'] },
  { id: 'no-pork', label: 'No Pork', excludes: ['pork'] },
  { id: 'no-beef', label: 'No Beef', excludes: ['beef'] },
  { id: 'dairy-free', label: 'Dairy-Free', excludes: ['dairy'] },
  { id: 'gluten-free', label: 'Gluten-Free', excludes: ['gluten'] },
  { id: 'no-heat', label: 'No Heat', excludes: ['spicy'] },
];

export function excludedTags(filters: readonly FilterId[]): Set<Tag> {
  const out = new Set<Tag>();
  for (const f of FILTERS) if (filters.includes(f.id)) for (const t of f.excludes) out.add(t);
  return out;
}

export function allowed(item: Ingredient, excluded: ReadonlySet<Tag>): boolean {
  return !item.tags.some((t) => excluded.has(t));
}

export type Pools = Record<Category, readonly Ingredient[]>;

export function filteredPools(filters: readonly FilterId[]): Pools {
  const ex = excludedTags(filters);
  const keep = (list: readonly Ingredient[]) => list.filter((i) => allowed(i, ex));
  return {
    bread: keep(byCategory.bread),
    protein: keep(byCategory.protein),
    cheese: keep(byCategory.cheese),
    veggie: keep(byCategory.veggie),
    sauce: keep(byCategory.sauce),
    seasoning: keep(byCategory.seasoning),
    extra: keep(byCategory.extra),
  };
}

/** Which single-choice categories a filter set empties out (UI explains, never silently fails). */
export function emptyRequiredPools(filters: readonly FilterId[]): Category[] {
  const pools = filteredPools(filters);
  return (['bread', 'protein', 'cheese'] as const).filter((c) => pools[c].length === 0);
}

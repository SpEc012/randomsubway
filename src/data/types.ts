export type Category = 'bread' | 'protein' | 'cheese' | 'veggie' | 'sauce' | 'seasoning' | 'extra';

/** Dietary / flavor tags. Filters exclude by tag. */
export type Tag = 'pork' | 'beef' | 'poultry' | 'fish' | 'dairy' | 'egg' | 'gluten' | 'spicy' | 'sweet';

/** Which procedural renderer draws an ingredient, plus its parameters. */
export type ArtSpec =
  | { kind: 'bread'; style: BreadStyle; palette: string[] }
  | { kind: 'fold'; palette: string[]; marble?: string } // folded deli slices
  | { kind: 'rounds'; palette: string[]; fleck: string; mix?: string[][] } // round cured meats
  | { kind: 'deliMix'; slices: { kind: 'fold' | 'rounds'; palette: string[]; fleck?: string }[] }
  | { kind: 'chunks'; palette: string[]; grill?: boolean; glaze?: string; shred?: boolean }
  | { kind: 'meatballs'; palette: string[]; sauce: string }
  | { kind: 'tuna'; palette: string[] }
  | { kind: 'bacon'; palette: string[] }
  | { kind: 'patty'; palette: string[]; flecks: string[] }
  | { kind: 'omelet'; palette: string[] }
  | { kind: 'none' }
  | { kind: 'cheeseSlice'; palette: string[]; holes?: boolean; flecks?: string[] }
  | { kind: 'cheeseShred'; palette: string[] }
  | { kind: 'crumble'; palette: string[] }
  | { kind: 'lettuce'; palette: string[] }
  | { kind: 'leaf'; palette: string[] }
  | { kind: 'disc'; rim: string; flesh: string; core: string; pattern: DiscPattern; size: number }
  | { kind: 'strip'; palette: string[] }
  | { kind: 'ring'; palette: string[]; size: number; seeds?: string }
  | { kind: 'spread'; palette: string[]; bits?: string[] }
  | { kind: 'drizzle'; palette: string[]; width: number; clear?: boolean; flecks?: string }
  | { kind: 'dust'; palette: string[]; size: number; flake?: boolean };

export type BreadStyle =
  | 'italian'
  | 'herbs-cheese'
  | 'multigrain'
  | 'flatbread'
  | 'jalapeno-cheese'
  | 'sourdough'
  | 'wrap'
  | 'bowl';
export type DiscPattern = 'tomato' | 'cucumber' | 'pickle';

export interface Ingredient {
  id: string;
  name: string;
  /** How it's said out loud at the counter, if different from the name. */
  spoken?: string;
  category: Category;
  /** Approximate kcal for a 6-inch portion. Illustrative only. */
  kcal: number;
  /** Approximate USD price delta. Illustrative only. */
  price: number;
  tags: Tag[];
  /** Popularity 0–1; drives the chaos dial. */
  weight: number;
  art: ArtSpec;
  blurb?: string;
}

export type Size = '6in' | 'footlong';

export interface Order {
  bread: string;
  size: Size;
  toasted: boolean;
  protein: string;
  cheese: string;
  veggies: string[];
  sauces: string[];
  seasonings: string[];
  extras: string[];
  /** Set when rolled from a signature sub. */
  signature?: string;
  /** Layers mutated away from the signature recipe. */
  mutations?: number;
}

export type ReelId = 'bread' | 'protein' | 'cheese' | 'veggies' | 'sauces' | 'seasonings' | 'extras';
export const REELS: readonly ReelId[] = [
  'bread',
  'protein',
  'cheese',
  'veggies',
  'sauces',
  'seasonings',
  'extras',
];

export type Mode = 'custom' | 'signature' | 'nightmare' | 'monk' | 'daily';
export const MODES: readonly Mode[] = ['custom', 'signature', 'nightmare', 'monk', 'daily'];

export type FilterId =
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'no-pork'
  | 'no-beef'
  | 'dairy-free'
  | 'gluten-free'
  | 'no-heat';

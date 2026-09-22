// Dev-only render lab: /lab.html?set=signatures|random|single&id=bmt&cols=2&raw=1
import { SIGNATURES } from './data/signatures';
import type { Order } from './data/types';
import { orderTitle } from './engine/order';
import { roll } from './engine/randomizer';
import { buildSandwich } from './render/sandwich';

const q = new URLSearchParams(location.search);
const root = document.getElementById('lab')!;
root.style.setProperty('--cols', q.get('cols') ?? '2');
const finished = !q.has('raw');

const orders: { label: string; order: Order; seed: string }[] = [];
const set = q.get('set') ?? 'signatures';
if (set === 'signatures') {
  for (const s of SIGNATURES) orders.push({ label: s.name, order: s.order, seed: s.id });
} else if (set === 'single') {
  const s = SIGNATURES.find((x) => x.id === q.get('id')) ?? SIGNATURES[0]!;
  orders.push({ label: s.name, order: s.order, seed: s.id });
} else {
  const n = Number(q.get('n') ?? 8);
  const chaos = Number(q.get('chaos') ?? 50);
  const mode = (q.get('mode') ?? 'custom') as 'custom';
  for (let i = 0; i < n; i++) {
    const seed = `LAB${i}${q.get('salt') ?? ''}`;
    const { order } = roll({ seed, mode, chaos, filters: [], locks: [] });
    orders.push({ label: orderTitle(order), order, seed });
  }
}

for (const { label, order, seed } of orders) {
  const art = buildSandwich(order, { seed, finished });
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = `${label} — ${order.bread}, ${order.protein}, ${order.cheese}, [${order.veggies.join(', ')}] [${order.sauces.join(', ')}]`;
  fig.append(art.svg, cap);
  root.append(fig);
}
document.body.dataset.ready = '1';
// set=breads: one of every bread style with the same fillings.
if (set === 'breads') {
  const { byCategory } = await import('./data/ingredients');
  for (const b of byCategory.bread.filter((x) => !q.get('bread') || x.id === q.get('bread'))) {
    const order: Order = {
      bread: b.id,
      size: 'footlong',
      toasted: b.id !== 'bowl',
      protein: 'turkey',
      cheese: 'swiss',
      veggies: ['lettuce', 'tomato', 'cucumber', 'red-onion'],
      sauces: ['honey-mustard'],
      seasonings: ['pepper'],
      extras: [],
    };
    const art = buildSandwich(order, { seed: b.id, finished });
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = b.name;
    fig.append(art.svg, cap);
    root.append(fig);
  }
}

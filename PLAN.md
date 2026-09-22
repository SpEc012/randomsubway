# SANDWICH ROULETTE — Implementation Brief

> A Subway order randomizer: spin the reels, watch a photoreal sandwich assemble itself layer by layer, get a counter-ready order card. Built to look and feel like the real thing.

---

## Context

`spec012/randomsubway` exists on GitHub and is **completely empty** — no commits, no branches. Branch `claude/subway-sandwich-randomizer-ouotlj` is checked out locally with zero commits. This brief is the full build from scratch.

The goal is not a toy `Math.random()` picker. It's a piece of interactive design: a slot-machine randomizer over the real Subway menu, where every roll renders a unique, genuinely appetizing sandwich, reports exactly which one of ~2.4 quadrillion possible orders you landed on, and hands you text you can read out loud at the counter.

### Environment constraints (verified, not assumed)

| Fact | Consequence |
|---|---|
| `subway.com` → `connect_rejected` by egress policy | Cannot scrape menu JSON or product photography |
| All CDNs (cdnjs, jsDelivr) → `connect_rejected` | **Zero runtime external requests.** No CDN fonts, no CDN libs. Everything self-hosted/inline |
| npm registry reachable (`vite@8.3.0` resolves) | Build toolchain is fine; dev deps install normally |
| Node v22.22.2, npm 10.9.7 | Modern target, safe to use ES2022+ |

### On the "1:1 Subway look"

You asked for their stuff one-to-one. Straight answer: their product photography, logo, and trade dress are Subway's IP, and committing them to a public repo puts the liability on your GitHub account. Also, they're literally unreachable from this machine. So the plan hits the same visual target three different ways:

1. **Photoreal procedural SVG** (§4) — not flat cartoon vectors. Layered gradient meshes, `feTurbulence` displacement for organic edges, `feSpecularLighting` for the wet gloss on tomato and pepper rings, soft `feGaussianBlur` contact shadows. This is the "shot top-down on white" product-photo look, rendered as math. It gets ~85% of the way to a photo *and* it animates, browns when toasted, and jitters so no two lettuce leaves are identical — things a JPEG can never do.
2. **Real brand language** — Subway's public brand green (`#008C15` / `#009639`), the yellow accent (`#FFC600`), their card-tile ingredient grid, their builder flow. Color values and layout patterns are not protectable the way photos are.
3. **A local drop-in asset pipeline** (§4.4) — `assets/custom/` is gitignored; drop your own JPEGs in, run `npm run assets:ingest`, and every ingredient swaps to photo mode. Your machine, your call, nothing copyrighted in the public repo.

App is named **SANDWICH ROULETTE** (alternates: ROLL-A-SUB, THE SUB ORACLE) with a footer disclaimer: *Not affiliated with, endorsed by, or sponsored by Subway IP LLC.* Original name + disclaimer is what keeps this shippable.

---

## 1. Stack & repo layout

Vanilla TypeScript + Vite. **Zero runtime dependencies** — direct DOM/SVG control is what frame-accurate reel animation actually wants, and it means the built bundle works offline forever.

```
randomsubway/
├── index.html
├── package.json              # vite, typescript, vitest, @biomejs/biome — dev deps only
├── tsconfig.json             # strict: true
├── vite.config.ts            # base: '/randomsubway/' for Pages
├── biome.json
├── README.md                 # hero GIF, the combination math, local dev, disclaimer
├── LICENSE                   # MIT
├── .github/workflows/
│   ├── ci.yml                # typecheck + biome + vitest on push/PR
│   └── deploy.yml            # build → GitHub Pages on main
├── public/
│   └── og.png                # social card (generated, §9)
└── src/
    ├── main.ts               # bootstrap, route ?seed= , mount
    ├── styles/
    │   ├── tokens.css        # ALL color/space/timing as CSS custom properties
    │   ├── base.css          # reset, typography, layout primitives
    │   └── app.css           # component styles
    ├── data/
    │   ├── ingredients.ts    # the master dataset (§2)
    │   ├── signatures.ts     # named menu subs (§2.3)
    │   ├── pairings.ts       # flavor-affinity matrix (§5.4)
    │   └── types.ts
    ├── engine/
    │   ├── rng.ts            # seeded PRNG (§5.1)
    │   ├── randomizer.ts     # roll logic, chaos dial, filters, locks (§5)
    │   ├── combinatorics.ts  # BigInt total-possibility math (§5.5)
    │   ├── scoring.ts        # harmony/cursed scoring (§5.4)
    │   └── order.ts          # Order model, text/URL serialization (§7.3)
    ├── render/
    │   ├── svg.ts            # tiny SVG helper (el/attr/path builders)
    │   ├── filters.ts        # shared <defs>: turbulence, specular, shadow, toast
    │   ├── ingredients/      # one module per ingredient family (§4.2)
    │   │   ├── bread.ts  meat.ts  cheese.ts  veg.ts  sauce.ts
    │   └── sandwich.ts       # cross-section compositor + layer animation (§4.3)
    ├── ui/
    │   ├── reels.ts          # slot reel component (§6.2)
    │   ├── stage.ts          # sandwich stage + toast/plate
    │   ├── odometer.ts       # BigInt digit-roll counter (§6.4)
    │   ├── controls.ts       # chaos dial, mode switch, filters, locks
    │   ├── receipt.ts        # order card, copy, share (§7)
    │   ├── history.ts        # roll history + hall of fame/shame
    │   └── achievements.ts   # badge unlocks (§8.3)
    ├── audio/
    │   └── synth.ts          # WebAudio-synthesized SFX, zero files (§6.5)
    └── util/
        ├── store.ts          # ~40-line reactive store (subscribe/set)
        ├── anim.ts           # spring + easing helpers, rAF loop, FLIP
        └── persist.ts        # localStorage with try/catch + schema version
```

**Hard rules:** no runtime deps in `dependencies`; no network requests at runtime; every color/duration a CSS custom property in `tokens.css`; `prefers-reduced-motion` respected everywhere; strict TS, no `any`.

---

## 2. The data model

`src/data/types.ts`:

```ts
export type Category =
  | 'bread' | 'protein' | 'cheese' | 'veggie'
  | 'sauce' | 'seasoning' | 'extra';

export interface Ingredient {
  id: string;                    // 'italian-herbs-cheese'
  name: string;                  // 'Italian Herbs & Cheese'
  category: Category;
  kcal: number;                  // per 6-inch portion, approximate
  priceDelta: number;            // USD, illustrative only
  tags: Tag[];                   // 'vegetarian' | 'vegan' | 'pork' | 'beef'
                                 // | 'spicy' | 'dairy' | 'gluten' | 'fish' | 'egg' | 'nut-free'
  weight: number;                // 0–1, popularity — drives the chaos dial (§5.2)
  art: ArtSpec;                  // how §4 draws it
  blurb?: string;                // flavor text for the receipt
}

export interface ArtSpec {
  renderer: string;              // key into the ingredient renderer registry
  palette: string[];             // 2–5 hex stops feeding the gradients
  layerHeight: number;           // px in the cross-section stack
  seedSalt: number;              // keeps per-ingredient jitter decorrelated
  toastable?: boolean;           // participates in the browning filter
}
```

### 2.1 Dataset scale (target counts)

| Category | Count | Notes |
|---|---|---|
| Bread | 8 | Italian, Italian Herbs & Cheese, Hearty Multigrain, Artisan Flatbread, Jalapeño Cheese, Sourdough, Wrap, No-bread (salad bowl) |
| Protein | 17 | Turkey, Black Forest Ham, Roast Beef, Rotisserie Chicken, Grilled Chicken, Steak, Meatballs, Tuna, Italian BMT, Cold Cut Combo, Pepperoni, Salami, Capicola, Bacon, Egg Omelet, Veggie Patty, Veggie-only |
| Cheese | 8 | American, Provolone, Monterey Cheddar, Pepper Jack, Swiss, Mozzarella, Feta, None |
| Veggie | 12 | Lettuce, Tomato, Cucumber, Green Pepper, Red Onion, Black Olives, Pickles, Jalapeños, Banana Peppers, Spinach, Avocado, Guacamole |
| Sauce | 18 | Mayo, Light Mayo, Yellow Mustard, Deli Brown, Honey Mustard, Ranch, Peppercorn Ranch, Chipotle Southwest, Sweet Onion, Baja Chipotle, BBQ, Oil, Red Wine Vinegar, Buffalo, Garlic Aioli, Creamy Sriracha, MVP Vinaigrette, Caesar |
| Seasoning | 5 | Salt, Black Pepper, Oregano, Parmesan, Red Pepper Flakes |
| Extra (boolean) | 4 | Double meat, Extra cheese, Add bacon, Add avocado |
| Size | 2 | 6-inch, Footlong |
| Toasted | 2 | Yes, No |

Every number (kcal, price) is **approximate and labeled as such in the UI** — do not present as official nutrition data.

### 2.2 Authoring note
Write `ingredients.ts` as a plain typed array with a `satisfies Ingredient[]` assertion so the compiler catches typos and every id is autocompletable. Derive lookup maps (`byId`, `byCategory`) once at module load.

### 2.3 Signature subs
`signatures.ts` maps the named menu lineup (The Philly, The Boss, The Monster, Italian B.M.T., Turkey Breast, Sweet Onion Chicken Teriyaki, Meatball Marinara, Veggie Delite, Tuna, Spicy Italian, Chicken & Bacon Ranch, Steak & Cheese, …) to concrete ingredient-id sets, so Signature mode reuses the exact same renderer and order pipeline as Custom mode.

---

## 3. Design system

`tokens.css` — everything themeable, light/dark from one place.

```css
:root {
  --green-700:#00612A; --green-600:#008C15; --green-500:#009639;
  --green-100:#E4F3E7; --yellow:#FFC600; --yellow-dim:#E0AE00;
  --ink:#0E1B12; --ink-soft:#40554A; --paper:#FFFFFF; --wash:#F5F8F5;
  --line:rgba(14,27,18,.10);
  --shadow-card:0 1px 2px rgba(14,27,18,.06), 0 8px 24px -8px rgba(14,27,18,.14);
  --radius:18px; --radius-sm:10px;
  --dur-fast:140ms; --dur:280ms; --dur-slow:620ms; --dur-spin:2400ms;
  --ease-out:cubic-bezier(.16,1,.3,1);
  --ease-snap:cubic-bezier(.34,1.56,.64,1);   /* overshoot for reel lock */
}
:root:not([data-theme="light"]) { @media (prefers-color-scheme: dark) { /* dark overrides */ } }
:root[data-theme="dark"] { /* same overrides */ }
```

**Type:** self-hosted variable font in `public/fonts/` (Inter or similar, subset, `woff2`, `font-display:swap`) — no Google Fonts, CDNs are blocked. System-stack fallback declared first so first paint never blocks.

**Layout:** three zones. Left = reel column (7 reels). Center = sandwich stage (the hero). Right = order receipt + stats. Collapses to a single scrolling column under 900px with the stage pinned sticky at top — on mobile the sandwich stays visible while reels scroll beneath it. 16px side gutters, never a horizontal scrollbar.

**Motion principle:** nothing linear. Reels use custom eased spin with a settle overshoot; ingredients enter the sandwich on a spring; numbers roll rather than swap. Under `prefers-reduced-motion: reduce`, all of it degrades to a 120ms cross-fade — the app stays *fully functional*, just still.

---

## 4. The photoreal SVG ingredient engine ★ centerpiece

This is what makes the project. Flat-vector food looks like a corporate illustration; these techniques look like food.

### 4.1 Shared filter defs (`render/filters.ts`)
One `<defs>` block injected once, referenced by every ingredient:

- **`#organic-edge`** — `feTurbulence type="fractalNoise" baseFrequency=".02 .05"` → `feDisplacementMap scale="6"`. Kills the "vector" tell on lettuce, meat, and bread edges.
- **`#crumb`** — fine turbulence + `feColorMatrix` → subtle bread-crumb grain, multiplied over the crust.
- **`#gloss`** — `feGaussianBlur` → `feSpecularLighting` with an `fePointLight` up-left → `feComposite` in `arithmetic` mode. This is the wet highlight on tomato, pickles, and pepper rings. It is the single biggest photorealism win.
- **`#contact-shadow`** — `feGaussianBlur stdDeviation="3"` + offset + low-alpha flood. Grounds each layer on the one below it.
- **`#toast`** — animatable `feColorMatrix` that warms and darkens, plus an amplitude-ramped turbulence for char mottling. Interpolating its values 0→1 *is* the toasting animation.

### 4.2 Per-ingredient renderers (`render/ingredients/*.ts`)
Each exports `(ctx: RenderCtx) => SVGGElement` and takes a seeded RNG so geometry is deterministic per roll but varied across rolls:

- **Bread** — a lofted crust profile from a cubic path whose control points jitter ±3px; three-stop gradient (pale crumb → golden crust → deep edge); scatter of `feTurbulence`-masked seed/oat specks for multigrain; a cheese-and-herb overlay layer for Italian Herbs & Cheese that partially melts under `#toast`.
- **Lettuce** — a ruffle generated by walking a sine with layered noise (frequency + amplitude jittered per instance), 3 overlapping translucent leaves at varying `hue-rotate`, `#organic-edge` applied. Every roll's lettuce is genuinely unique.
- **Tomato** — radial gradient flesh, a hand-authored seed-cavity path set rotated per slice, translucent rim, `#gloss`. 2–4 slices at jittered rotation.
- **Onion** — nested arc rings with decreasing opacity and a violet→white gradient.
- **Cheese** — trapezoid with a drape curve; when toasted, the path morphs to a melted profile with drip tails (animate `d` between two same-command paths).
- **Meats** — per-family: marbled turkey/ham strata (layered low-opacity blobs), meatball spheres with radial shading + marinara pool, bacon's signature wave with fat striping, tuna as a noise-scattered aggregate.
- **Sauce** — a drizzle along a jittered sine path with variable stroke width + round caps + a slight blur, drawn with an animated `stroke-dashoffset` so it *pours on*.

### 4.3 The compositor (`render/sandwich.ts`)
Stacks layers bottom→top at a slight isometric skew (a real cross-section, not a flat stack): bottom bread → protein → cheese → veggies → sauce drizzle → seasoning dust → top bread. Handles:
- Layer entry: each element drops in on a spring with a 60ms stagger and a tiny squash-and-stretch on landing.
- Footlong vs 6-inch: width scale + more repeats of each ingredient, not just a transform.
- Toast animation: ramp `#toast` amplitude 0→1 over 900ms with a heat-shimmer wobble.
- Wrap/salad-bowl variants: different compositor branch, same ingredient renderers.
- Export: `toPNG()` via serializing the SVG into a canvas → the share-image path (§7.4).

### 4.4 Optional real-photo mode
`assets/custom/` in `.gitignore`. `npm run assets:ingest` (a ~60-line Node script) scans that folder, matches `<ingredient-id>.{jpg,png,webp}`, writes `assets/manifest.local.json`, and the renderer prefers a photo layer over the procedural one when the manifest has an entry. Public repo ships zero third-party images; your local build can be as 1:1 as you like.

---

## 5. The randomizer engine

### 5.1 Seeded determinism
`rng.ts` implements **sfc32** seeded from a 32-bit hash of a short base36 seed string. Every roll = one seed. The seed drives reel outcomes *and* all art jitter, so `?seed=K3F9QZ` reproduces a byte-identical sandwich. This makes every roll shareable and every bug reproducible.

### 5.2 The Chaos Dial ★ signature mechanic
A 0–100 slider that reshapes the probability distribution:

```ts
// weight w ∈ (0,1] is popularity; chaos c ∈ [0,1]
const exponent = lerp(3.0, 0.0, c);        // c=0 → w³ (crush the rare); c=1 → all weights 1
const effective = Math.pow(w, exponent);
```

- **0 — Safe Bet:** heavily weighted to popular picks. Sauce count capped at 2, veggies 3–5. You'd actually order this.
- **50 — Adventurous:** near-uniform, mild caps.
- **100 — Absolute Chaos:** uniform, no caps. Tuna + sweet onion + jalapeños + mayo + mustard + olives is on the table.

Dial position also drives UI feedback: the accent color shifts green → amber → red, and the spin gets progressively more violent (longer spin, harder shake, higher SFX pitch).

### 5.3 Selection rules
- Single-choice categories (bread/protein/cheese/size/toast): weighted pick from the filtered pool.
- Subset categories (veggies/sauces/seasonings): draw a count from a chaos-shaped triangular distribution, then weighted sample without replacement.
- **Locks:** each reel has a pin toggle; locked reels are excluded from re-roll (slot-machine "hold"). Locks persist across rolls and are encoded in the share URL.
- **Dietary filters:** vegetarian, vegan, no-pork, no-beef, pescatarian, dairy-free, gluten-conscious, nut-free. Applied as a tag-based pool filter *before* weighting. If a filter empties a pool, the UI says which filter did it rather than silently failing.
- **Constraints:** a small rule list (no-bread bowl disables toasting; veggie patty forbids meat extras) evaluated post-roll with a single repair pass.

### 5.4 Harmony scoring ("is this cursed?")
`pairings.ts` holds a sparse symmetric affinity matrix: `[idA, idB, score]` where score ∈ [-3, +3] (tuna×marinara = -3; turkey×swiss = +3). `scoring.ts` sums all present pairs, normalizes by pair count, and maps to a 0–100 harmony score with a verdict band:

> 90+ **Chef's Kiss** · 70+ **Solid Order** · 50+ **Defensible** · 30+ **Questionable** · 15+ **Cursed** · <15 **A Crime Against Bread**

Rendered as an animated arc gauge that sweeps to position on roll-land. Low scores trigger a screen-shake + red flash; 90+ triggers lettuce-shred confetti.

### 5.5 The combination odometer ★ hook
`combinatorics.ts` computes the total possibility space with **BigInt**, live from the dataset (so it's always correct as ingredients are added):

```
breads × sizes × toast × proteins × cheeses × 2^veggies × 2^sauces × 2^seasonings × 2^extras
  8    ×   2   ×   2   ×    17    ×    8    ×   2^12    ×   2^18   ×     2^5      ×  2^4
= 17 × 2^47 = 2,392,537,301,840,576
```

Headline copy under the sandwich: **"You rolled 1 of 2,392,537,301,840,576 possible orders."** Digits roll in on an odometer animation. Also exposed: the count *after* your active dietary filters (watching 2.4 quadrillion collapse to 40 billion when you tick "vegan" is a genuinely great moment), and a running "% of all possible sandwiches you've personally seen" — a number with ~19 leading zeros, which is the joke.

---

## 6. Interaction & animation choreography

### 6.1 The spin — the money moment
1. **Anticipation** (120ms): pull-down on the lever, reels compress 2%, audio ducks.
2. **Launch:** reels accelerate over 260ms, `filter: blur(0 6px)` vertical motion blur ramps in with velocity.
3. **Spin** (`--dur-spin`, chaos-scaled): reels cycle ingredient tiles; ambient tick SFX with pitch tracking velocity.
4. **Sequential landing:** reels lock left→right at 180ms intervals — bread, protein, cheese, veg, sauce, seasoning, extras. Each lock = overshoot settle (`--ease-snap`) + chassis shake + a click that rises in pitch per reel. *Sequential, not simultaneous* — this is what builds tension.
5. **Assembly:** as each reel locks, that layer flies from the reel into the sandwich stage (FLIP-transformed from reel rect → stage slot) and springs into place.
6. **Toast:** if toasted, the whole stack goes through the browning filter with a heat shimmer.
7. **Verdict:** harmony gauge sweeps, odometer rolls, receipt prints in with a paper-feed animation (clip-path reveal + slight rotation settle).

Total ≈ 4.2s at chaos 0, ≈ 5.5s at chaos 100. **Spacebar or clicking mid-spin slams everything to the final state instantly** — never trap the user in your animation.

### 6.2 Reels
Each reel: a masked viewport showing a vertical tile strip, `transform: translateY()` driven by rAF (not CSS transitions — we need mid-flight velocity for the blur). Tiles show the ingredient's mini-SVG + name. Pin button top-right; pinned reels dim to a locked chrome state and don't spin.

### 6.3 Keyboard & input
`Space` spin/slam · `1`–`7` toggle reel locks · `R` re-roll unlocked only · `C` copy order · `S` share link · `T` toggle toast · `M` mute · `←/→` chaos dial · `?` shortcut overlay. Full focus rings, ARIA live region announcing the final order for screen readers, all controls reachable by tab.

### 6.4 Odometer
Per-digit vertical strips that roll to target with staggered durations (rightmost digits spin longest). Handles BigInt strings with locale grouping.

### 6.5 Audio — synthesized, zero files
`audio/synth.ts` builds everything from `OscillatorNode` + `BiquadFilter` + noise buffers:
- reel tick: short filtered-noise burst, pitch ↑ with velocity
- reel lock: sine thunk + click transient, pitch steps up per reel
- lever: filtered noise sweep
- sauce pour: band-passed noise with an LFO
- jackpot: major arpeggio; cursed: detuned minor second
Audio context created **only on first user gesture** (autoplay policy). Mute persists to localStorage. Never plays under `prefers-reduced-motion` unless explicitly unmuted.

---

## 7. Output — the part that's actually useful

### 7.1 The receipt card
Thermal-receipt styled panel, monospace, with: size + bread + toast state, protein (+ double), cheese, itemized veggies and sauces, extras, approximate kcal and price, the harmony verdict, the seed code, and a timestamp.

### 7.2 Counter-ready script
One-tap copy of natural spoken text — the actual killer feature:

> "Hi — can I get a footlong Italian Herbs and Cheese, toasted, with Black Forest ham and provolone. Lettuce, tomato, red onion, banana peppers. Chipotle southwest and a little oil. Salt, pepper, and oregano. Thanks!"

Generated by `order.ts` with correct grammar, Oxford commas, and natural clause joining — not a comma-delimited dump.

### 7.3 Share URLs
Order → compact base64url payload of `{seed, mode, locks, chaos, filters}` in `?s=`. Opening the link replays the exact roll **with the full spin animation**, so sharing feels like handing someone the machine.

### 7.4 Share image
`sandwich.toPNG()` renders the stage SVG to canvas at 2×, composites the receipt summary and harmony score, and offers download + `navigator.share` where supported. Falls back to download-only.

---

## 8. Replay features

### 8.1 Modes
- **Custom Build** — the full 7-reel randomizer (default).
- **Signature** — rolls a named sub from `signatures.ts`, then optionally chaos-mutates N layers ("The Italian B.M.T., but wrong").
- **Nightmare** — chaos 100, max veggies, max sauces, double everything. Harmony scores are reliably catastrophic.
- **Monk** — minimum viable sandwich. Bread, one protein, nothing else. Serene.
- **Daily Sub** — seed derived from the UTC date, so everyone gets the same sandwich today. Shows a "today's roll" badge and is permalinkable.

### 8.2 History
Last 50 rolls in localStorage (wrapped in try/catch, schema-versioned): thumbnail, name, harmony score, seed. Click to reload. "Hall of Fame" (top 5 scores) and "Hall of Shame" (bottom 5) pinned at the top. Clear-history control.

### 8.3 Achievements
~18 badges unlocked in localStorage with a toast animation: *Perfect Storm* (harmony 95+), *Abomination* (<10), *Purist* (Monk mode roll), *Everything Bagel* (all 12 veggies), *Sauce Boss* (6+ sauces), *Déjà Vu* (roll the same sandwich twice), *Centurion* (100 rolls), *Exact Match* (roll a real signature sub by pure chance in Custom mode — vanishingly rare, which is the point).

---

## 9. Accessibility, performance, quality

- **A11y:** WCAG AA contrast on all tokens in both themes; reels are `role="listbox"`-ish with proper labels; an `aria-live="polite"` region announces the settled order in full; `prefers-reduced-motion` gives a complete non-animated path; the harmony verdict is text, not color-only; every control keyboard-reachable with visible focus.
- **Performance:** animate only `transform`/`opacity`/`filter`; a single shared rAF loop in `anim.ts`; reuse SVG nodes across rolls instead of rebuilding the tree; lazy-build offscreen reel tiles. Target 60fps on mid-range mobile; budget < 250KB gzipped total including the font.
- **Tests (vitest):** `rng` determinism (same seed → same sequence), `combinatorics` against hand-computed BigInt values, `randomizer` filter correctness (vegan filter never yields a `dairy`/`meat` tag — property-test over 10k seeds), `scoring` band boundaries, `order` serialize→deserialize round-trip, and the grammar generator's output for edge cases (zero sauces, one veggie).
- **CI:** `ci.yml` runs typecheck + biome + vitest. `deploy.yml` builds and publishes to Pages on `main`.

---

## 10. Build order

Ship it in verifiable slices — each phase ends with something runnable.

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | Scaffold: Vite + TS + biome + vitest, tokens.css, CI workflows, README, LICENSE | `npm run dev` serves a styled shell; CI green |
| 2 | `data/` complete + `combinatorics.ts` + tests | Odometer prints the real BigInt total |
| 3 | `engine/`: rng, randomizer, chaos dial, filters, locks, scoring + tests | Rolls valid orders in console; filters provably correct |
| 4 | `render/`: filters.ts + all ingredient renderers + compositor | A static sandwich renders and looks *good* — this phase is worth the most iteration time |
| 5 | `ui/reels.ts` + spin choreography + FLIP assembly | The full spin lands and builds the sandwich |
| 6 | Receipt, spoken script, share URL, share PNG | Copy button produces counter-ready text; links replay exactly |
| 7 | Audio synth, history, achievements, modes, keyboard map | Feature-complete |
| 8 | Polish: reduced-motion pass, a11y audit, mobile layout, perf, OG image, README GIF | Ships |

Commit per phase with clear messages on `claude/subway-sandwich-randomizer-ouotlj`. Push at the end. **No PR unless you ask for one.**

---

## 11. Verification

1. `npm ci && npm run typecheck && npm run lint && npm test` — all green.
2. `npm run dev` — spin 20+ times across chaos 0 / 50 / 100. Every roll must produce a valid, plausibly-renderable sandwich; no layer clipping, no z-order bugs, no overlapping sauce drizzle.
3. **Determinism:** copy a share URL, hard-reload it, confirm the rendered sandwich is pixel-identical and the seed code matches.
4. **Filters:** tick vegan → roll 30 times → zero animal-tagged ingredients, and the filtered combination count updates.
5. **Locks:** pin bread + protein, re-roll 10× → those two never change, the rest always do.
6. **Reduced motion:** set the OS flag (or emulate in DevTools) → app still fully usable, no spin, no shake.
7. **Mobile:** 390×844 viewport → no horizontal scroll, stage stays visible, all controls tappable at ≥44px.
8. **Offline:** `npm run build && npm run preview`, then kill the network in DevTools → app works completely (proves zero external requests).
9. **Lighthouse:** Performance and Accessibility ≥ 95 on the production build.
10. **Screenshot the result** and attach it, so the visual quality of phase 4 is reviewable and not just asserted.

---

## 12. Open risks

- **Phase 4 is the whole project.** If the SVG food doesn't look genuinely appetizing, nothing else matters. Budget the most iteration time there, and render early screenshots for review before building UI on top of it.
- **Nutrition/price numbers are illustrative.** Label them in the UI ("approximate") and in the README. Don't imply official data.
- **Naming.** Ship as SANDWICH ROULETTE with the non-affiliation disclaimer in the footer and README. Don't reproduce the Subway wordmark or logo.

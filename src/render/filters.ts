import { el } from './svg';

export type FilterName =
  | 'crust'
  | 'crumb'
  | 'gloss'
  | 'sheen'
  | 'organic'
  | 'shadow'
  | 'toast'
  | 'lumpy'
  | 'shimmer';

/**
 * Paint context for one SVG document: owns <defs>, hands out gradient and
 * filter references with an instance prefix so multiple sandwiches (stage,
 * thumbnails, export) never collide.
 */
export class Paint {
  readonly defs: SVGDefsElement;
  private n = 0;
  private cache = new Map<string, string>();
  private toastMatrix?: SVGFEColorMatrixElement;
  private toastSpots?: SVGFEColorMatrixElement;
  private shimmerMap?: SVGFEDisplacementMapElement;

  constructor(
    readonly prefix: string,
    /** Lite mode skips filters — for tiny icons and fast thumbnails. */
    readonly lite = false,
  ) {
    this.defs = el('defs');
    if (!lite) this.installFilters();
  }

  uid(tag = 'x'): string {
    return `${this.prefix}-${tag}${this.n++}`;
  }

  fx(name: FilterName): string | undefined {
    return this.lite ? undefined : `url(#${this.prefix}-${name})`;
  }

  /** Vertical (default) linear gradient, evenly spaced stops. Cached per stop list. */
  linear(stops: readonly string[], dir: 'v' | 'h' | 'd' = 'v', opacity?: readonly number[]): string {
    const key = `L${dir}${stops.join()}${opacity?.join() ?? ''}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const id = this.uid('lg');
    const [x2, y2] = dir === 'v' ? ['0', '1'] : dir === 'h' ? ['1', '0'] : ['1', '1'];
    const g = el('linearGradient', { id, x1: 0, y1: 0, x2, y2 });
    stops.forEach((c, i) => {
      g.appendChild(
        el('stop', {
          offset: stops.length === 1 ? 0 : i / (stops.length - 1),
          'stop-color': c,
          'stop-opacity': opacity?.[i],
        }),
      );
    });
    this.defs.appendChild(g);
    const url = `url(#${id})`;
    this.cache.set(key, url);
    return url;
  }

  /** Radial gradient with an off-center focal point (light from upper-left). */
  radial(stops: readonly string[], fx = 0.35, fy = 0.3, r = 0.75, opacity?: readonly number[]): string {
    const key = `R${fx}${fy}${r}${stops.join()}${opacity?.join() ?? ''}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const id = this.uid('rg');
    const g = el('radialGradient', { id, cx: 0.5, cy: 0.5, r, fx, fy });
    stops.forEach((c, i) => {
      g.appendChild(
        el('stop', {
          offset: stops.length === 1 ? 0 : i / (stops.length - 1),
          'stop-color': c,
          'stop-opacity': opacity?.[i],
        }),
      );
    });
    this.defs.appendChild(g);
    const url = `url(#${id})`;
    this.cache.set(key, url);
    return url;
  }

  /** Browning: 0 = raw, 1 = golden-toasted with char mottling. */
  setToast(t: number): void {
    if (!this.toastMatrix || !this.toastSpots) return;
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const m = [
      lerp(1, 0.98),
      lerp(0, 0.04),
      0,
      0,
      lerp(0, 0),
      lerp(0, 0.02),
      lerp(1, 0.86),
      0,
      0,
      lerp(0, -0.02),
      0,
      lerp(0, 0.02),
      lerp(1, 0.7),
      0,
      lerp(0, -0.03),
      0,
      0,
      0,
      1,
      0,
    ];
    this.toastMatrix.setAttribute('values', m.map((v) => v.toFixed(3)).join(' '));
    this.toastSpots.setAttribute(
      'values',
      `0 0 0 0 0.42  0 0 0 0 0.22  0 0 0 0 0.07  0 0 0 ${(t * 1.9).toFixed(3)} ${(-t * 1.12).toFixed(3)}`,
    );
  }

  /** Heat-haze wobble amplitude (0 = off). */
  setShimmer(amount: number): void {
    this.shimmerMap?.setAttribute('scale', amount.toFixed(2));
  }

  private installFilters(): void {
    const id = (n: FilterName) => `${this.prefix}-${n}`;
    const wide = { x: '-10%', y: '-25%', width: '120%', height: '150%' };

    // Crust: bumpy baked surface via diffuse lighting over fractal noise, multiplied onto the fill.
    this.defs.appendChild(
      el(
        'filter',
        { id: id('crust'), ...wide, 'color-interpolation-filters': 'sRGB' },
        el('feTurbulence', {
          type: 'fractalNoise',
          baseFrequency: '0.06 0.11',
          numOctaves: 2,
          seed: 11,
          result: 'n',
        }),
        el(
          'feDiffuseLighting',
          { in: 'n', 'lighting-color': '#fff', surfaceScale: 1.1, diffuseConstant: 1.1, result: 'l' },
          el('feDistantLight', { azimuth: 235, elevation: 62 }),
        ),
        el('feComposite', {
          in: 'l',
          in2: 'SourceGraphic',
          operator: 'arithmetic',
          k1: 0.22,
          k2: 0,
          k3: 0.82,
          k4: 0,
        }),
        el('feComposite', { in2: 'SourceGraphic', operator: 'in' }),
      ),
    );

    // Crumb: fine open-cell texture for cut bread faces.
    this.defs.appendChild(
      el(
        'filter',
        { id: id('crumb'), ...wide, 'color-interpolation-filters': 'sRGB' },
        el('feTurbulence', {
          type: 'fractalNoise',
          baseFrequency: '0.55',
          numOctaves: 2,
          seed: 4,
          result: 'n',
        }),
        el(
          'feDiffuseLighting',
          { in: 'n', 'lighting-color': '#fff', surfaceScale: 1.6, result: 'l' },
          el('feDistantLight', { azimuth: 240, elevation: 60 }),
        ),
        el('feComposite', {
          in: 'l',
          in2: 'SourceGraphic',
          operator: 'arithmetic',
          k1: 0.42,
          k2: 0,
          k3: 0.62,
          k4: 0,
        }),
        el('feComposite', { in2: 'SourceGraphic', operator: 'in' }),
      ),
    );

    // Lumpy: medium bumps for meat, tuna, patties, meatballs.
    this.defs.appendChild(
      el(
        'filter',
        { id: id('lumpy'), ...wide, 'color-interpolation-filters': 'sRGB' },
        el('feTurbulence', {
          type: 'fractalNoise',
          baseFrequency: '0.18',
          numOctaves: 3,
          seed: 21,
          result: 'n',
        }),
        el(
          'feDiffuseLighting',
          { in: 'n', 'lighting-color': '#fff', surfaceScale: 1.4, result: 'l' },
          el('feDistantLight', { azimuth: 225, elevation: 58 }),
        ),
        el('feComposite', {
          in: 'l',
          in2: 'SourceGraphic',
          operator: 'arithmetic',
          k1: 0.45,
          k2: 0,
          k3: 0.6,
          k4: 0,
        }),
        el('feComposite', { in2: 'SourceGraphic', operator: 'in' }),
      ),
    );

    // Gloss: puffy specular highlight from the blurred alpha — the wet tomato look.
    this.defs.appendChild(
      el(
        'filter',
        { id: id('gloss'), ...wide, 'color-interpolation-filters': 'sRGB' },
        el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 2.2, result: 'b' }),
        el(
          'feSpecularLighting',
          {
            in: 'b',
            surfaceScale: 5,
            specularConstant: 1.05,
            specularExponent: 26,
            'lighting-color': '#fff',
            result: 's',
          },
          el('feDistantLight', { azimuth: 225, elevation: 48 }),
        ),
        el('feComposite', { in: 's', in2: 'SourceAlpha', operator: 'in', result: 'hi' }),
        el('feComposite', {
          in: 'SourceGraphic',
          in2: 'hi',
          operator: 'arithmetic',
          k1: 0,
          k2: 1,
          k3: 0.75,
          k4: 0,
        }),
      ),
    );

    // Sheen: subtler gloss for cheese, sauces, cured meats.
    this.defs.appendChild(
      el(
        'filter',
        { id: id('sheen'), ...wide, 'color-interpolation-filters': 'sRGB' },
        el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 3, result: 'b' }),
        el(
          'feSpecularLighting',
          {
            in: 'b',
            surfaceScale: 3,
            specularConstant: 0.75,
            specularExponent: 18,
            'lighting-color': '#fff',
            result: 's',
          },
          el('feDistantLight', { azimuth: 225, elevation: 55 }),
        ),
        el('feComposite', { in: 's', in2: 'SourceAlpha', operator: 'in', result: 'hi' }),
        el('feComposite', {
          in: 'SourceGraphic',
          in2: 'hi',
          operator: 'arithmetic',
          k1: 0,
          k2: 1,
          k3: 0.45,
          k4: 0,
        }),
      ),
    );

    // Organic edge: displace outlines so nothing reads as vector-perfect.
    this.defs.appendChild(
      el(
        'filter',
        { id: id('organic'), ...wide },
        el('feTurbulence', {
          type: 'fractalNoise',
          baseFrequency: '0.035 0.07',
          numOctaves: 2,
          seed: 7,
          result: 't',
        }),
        el('feDisplacementMap', {
          in: 'SourceGraphic',
          in2: 't',
          scale: 7,
          xChannelSelector: 'R',
          yChannelSelector: 'G',
        }),
      ),
    );

    // Contact shadow: grounds each layer on the one below.
    this.defs.appendChild(
      el(
        'filter',
        { id: id('shadow'), x: '-5%', y: '-20%', width: '110%', height: '160%' },
        el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 3.2, result: 'b' }),
        el('feOffset', { in: 'b', dy: 3.5, result: 'o' }),
        el('feFlood', { 'flood-color': '#2a1606', 'flood-opacity': 0.32, result: 'c' }),
        el('feComposite', { in: 'c', in2: 'o', operator: 'in', result: 's' }),
        el('feMerge', {}, el('feMergeNode', { in: 's' }), el('feMergeNode', { in: 'SourceGraphic' })),
      ),
    );

    // Toast: animatable browning matrix + turbulence-driven char spots.
    this.toastMatrix = el('feColorMatrix', { in: 'SourceGraphic', type: 'matrix', result: 'c' });
    this.toastSpots = el('feColorMatrix', { in: 'n', type: 'matrix', result: 'sp' });
    this.defs.appendChild(
      el(
        'filter',
        { id: id('toast'), ...wide, 'color-interpolation-filters': 'sRGB' },
        this.toastMatrix,
        el('feTurbulence', {
          type: 'fractalNoise',
          baseFrequency: '0.035 0.06',
          numOctaves: 3,
          seed: 3,
          result: 'n',
        }),
        this.toastSpots,
        el('feComposite', { in: 'sp', in2: 'SourceAlpha', operator: 'in', result: 'spots' }),
        el('feMerge', {}, el('feMergeNode', { in: 'c' }), el('feMergeNode', { in: 'spots' })),
      ),
    );
    this.setToast(0);

    // Shimmer: heat haze while toasting (scale animated 0 → 4 → 0).
    this.shimmerMap = el('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'w',
      scale: 0,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
    });
    this.defs.appendChild(
      el(
        'filter',
        { id: id('shimmer'), x: '-5%', y: '-10%', width: '110%', height: '120%' },
        el('feTurbulence', {
          type: 'turbulence',
          baseFrequency: '0.012 0.06',
          numOctaves: 1,
          seed: 2,
          result: 'w',
        }),
        this.shimmerMap,
      ),
    );
  }
}

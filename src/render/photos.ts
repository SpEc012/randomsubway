/**
 * Optional local photo mode. Drop `<ingredient-id>.{jpg,png,webp}` files in
 * `assets/custom/` (gitignored) and they replace the procedural art for that
 * ingredient in your local build. The public repo ships zero third-party images.
 */
const files = import.meta.glob('/assets/custom/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const PHOTOS: ReadonlyMap<string, string> = new Map(
  Object.entries(files).map(([path, url]) => [
    path
      .split('/')
      .pop()!
      .replace(/\.[a-z]+$/i, ''),
    url,
  ]),
);

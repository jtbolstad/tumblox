import type { Level } from '../data/level';
import { levelThumb } from './thumb';

/**
 * A pre-rendered screenshot of a level, made from the real game scene (see `scripts/thumbs.mjs`),
 * falling back to the flat 2D icon (`levelThumb`) for any level that one hasn't been made for yet (a
 * shared link or an editor level never goes through that script). This has no Three.js dependency, so
 * the phone remote - which always wants this, never the live desktop preview - doesn't pay for one.
 */
export function levelPreviewImg(level: Level): HTMLElement {
  const img = document.createElement('img');
  img.className = 'thumb';
  img.loading = 'lazy';
  img.alt = '';
  img.src = `thumbs/${level.id}.jpg`;
  img.onerror = () => img.replaceWith(levelThumb(level));
  return img;
}

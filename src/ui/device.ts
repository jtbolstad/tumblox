const STORAGE_KEY = 'blox.tv.v1';

/**
 * Smart-TV browsers advertise themselves distinctly in the UA string. This misses some (a TV
 * running a generic Chrome build) and could rarely false-positive a docked tablet, so it's
 * paired with a manual override below rather than trusted alone.
 */
function detectTv(): boolean {
  if (/Tizen|Web0S|WebOS|SmartTV|GoogleTV|AFT[A-Z]?|BRAVIA|HbbTV|VIDAA|CrKey/i.test(navigator.userAgent)) {
    return true;
  }
  // Chrome's User-Agent reduction strips the distinguishing tokens above from many generic
  // Android TV boxes and Google Cast devices, leaving nothing in the UA to match. Fall back to a
  // trait only a remote-only device has: no pointing device at all (not even a coarse touchscreen).
  return matchMedia('(pointer: none)').matches;
}

/** `?tv=1` / `?tv=0` forces it one way and remembers the choice; otherwise a saved choice wins. */
function readTvOverride(): boolean | null {
  const param = new URLSearchParams(location.search).get('tv');
  if (param === '1' || param === '0') {
    const value = param === '1';
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore: the override just won't stick
    }
    return value;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true' || saved === 'false') return saved === 'true';
  } catch {
    // storage blocked: fall through to auto-detection
  }
  return null;
}

/** True when the game should assume no keyboard/mouse: a smart TV, or the `?tv=` override. */
export const isTv: boolean = readTvOverride() ?? detectTv();

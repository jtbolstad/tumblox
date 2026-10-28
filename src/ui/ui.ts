import type { Goal, Level } from '../data/level';
import { MAX_PLAYERS, type PartyMode, partyModeFor } from '../data/party';
import type { LevelProgress } from '../data/progress';
import type { Medal } from '../data/rules';
import { THEME_IDS, THEMES } from '../data/themes';
import { TOOLS } from '../data/tools';
import { levelPreviewImg } from '../render/level-preview';
import { isTv } from './device';

/** A phone or a TV remote has no spare GPU headroom for several live 3D views at once; a mouse-driven desktop does. */
const LIVE_PREVIEW = !isTv && !matchMedia('(pointer: coarse)').matches;
let previewCleanups: Array<() => void> = [];

/**
 * A level preview for a menu tile: on desktop, a small live-rotating 3D render of the level's blocks
 * (loaded lazily, so a TV or phone browsing this same menu never fetches that code); elsewhere, a
 * pre-rendered screenshot of the real scene.
 */
function levelPreview(level: Level): HTMLElement {
  if (!LIVE_PREVIEW) return levelPreviewImg(level);
  const el = document.createElement('div');
  el.className = 'thumb live-thumb';
  import('../render/live-thumb').then(({ mountLiveThumb }) => {
    previewCleanups.push(mountLiveThumb(el, level, () => el.replaceWith(levelPreviewImg(level))));
  });
  return el;
}

/** Call before rebuilding the level grid, so any live previews on the old tiles stop rendering. */
function disposeLevelPreviews() {
  for (const fn of previewCleanups) fn();
  previewCleanups = [];
}
import type { Brief } from './brief';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id} in index.html`);
  return node as T;
}

const MAX_BALL_ICONS = 10;

const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** True for colours dark enough to need white text on them. */
function isDark(color: number) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

const PARTY_MODE_NAME: Record<PartyMode, string> = { duel: 'Score duel', jengaOff: 'Jenga-off' };

const MEDAL_ICON: Record<Medal, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

export function goalText(goal: Goal): string {
  switch (goal.type) {
    case 'toppleGems':
      return 'Topple all gems';
    case 'scoreTarget':
      return `Score ${goal.target}`;
    case 'clearBoard':
      return 'Clear the board';
    case 'jenga':
      return `Pull out ${goal.remove} blocks`;
  }
}

export interface ResultOpts {
  won: boolean;
  score: number;
  medal: Medal | null;
  best: number;
  hasNext: boolean;
  /** shown instead of "Out of throws" when the level was lost another way */
  lostReason?: string;
  /** start the next level by itself after this many seconds (a won level with a next one) */
  autoNextSeconds?: number;
}

export interface UiHandlers {
  /** `players` is 1 for normal play, 2-4 for a hot-seat party game */
  onSelect: (index: number, players: number) => void;
  onRetry: () => void;
  onNext: () => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onTitle: () => void;
}

export function createUi(handlers: UiHandlers) {
  const menu = el('menu');
  const result = el('result');
  const grid = el('level-grid');
  const playerRow = el('player-row');
  const partyBox = el('party');
  const toastBox = el('toast');
  const calloutBox = el('callout');
  const banner = el('banner');
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;
  let players = 1;
  let shown: { levels: readonly Level[]; progress: Record<string, LevelProgress> } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  el('menu-btn').addEventListener('click', handlers.onOpenMenu);
  el('play-btn').addEventListener('click', handlers.onOpenMenu);
  el('title-btn').addEventListener('click', handlers.onTitle);
  const title = el('title');
  let ballColor = '#ffb703';
  let countsBalls = true; // false for the hose, whose budget is seconds of water
  el('menu-close').addEventListener('click', handlers.onCloseMenu);
  el('levels-btn').addEventListener('click', () => {
    cancelAutoNext();
    handlers.onOpenMenu();
  });
  el('retry-btn').addEventListener('click', () => {
    cancelAutoNext();
    handlers.onRetry();
  });
  el('next-btn').addEventListener('click', () => {
    cancelAutoNext();
    handlers.onNext();
  });

  // after a cleared level the next one starts by itself; the button counts down
  let autoNextTimer: ReturnType<typeof setInterval> | undefined;
  function cancelAutoNext() {
    clearInterval(autoNextTimer);
    autoNextTimer = undefined;
    el('next-btn').textContent = 'Next level';
  }
  function startAutoNext(seconds: number) {
    cancelAutoNext();
    let left = seconds;
    const label = () => (el('next-btn').textContent = `Next level (${left})`);
    label();
    autoNextTimer = setInterval(() => {
      left--;
      if (left <= 0) {
        cancelAutoNext();
        handlers.onNext();
      } else {
        label();
      }
    }, 1000);
  }
  /** What the result panel last showed, so closing the level menu can bring it back. */
  let lastResult: ResultOpts | null = null;

  function renderMenu() {
    if (!shown) return;
    disposeLevelPreviews();
    const { levels, progress } = shown;
    playerRow.replaceChildren(
      ...Array.from({ length: MAX_PLAYERS }, (_, k) => {
        const n = k + 1;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = n === players ? 'chip active' : 'chip';
        b.textContent = n === 1 ? '1 player' : `${n}`;
        b.setAttribute('aria-pressed', String(n === players));
        b.addEventListener('click', () => {
          players = n;
          renderMenu();
        });
        return b;
      }),
    );
    // world map: one panel per world in its sky colours, levels as little floating isles
    grid.replaceChildren(
      ...THEME_IDS.flatMap((themeId) => {
        const entries = levels.flatMap((level, i) => (level.theme === themeId ? [{ level, i }] : []));
        if (entries.length === 0) return [];
        const t = THEMES[themeId];
        const world = document.createElement('section');
        world.className = 'world';
        world.style.setProperty('--sky-top', css(t.sky.top));
        world.style.setProperty('--sky-horizon', css(t.sky.horizon));
        world.style.setProperty('--ground', css(t.ground));
        world.style.setProperty('--earth', css(t.earth));
        world.style.setProperty('--isle-ink', isDark(t.ground) ? '#fff' : '#023047');
        world.style.setProperty('--title-ink', isDark(t.sky.top) ? '#fff' : '#023047');
        const cleared = entries.filter(({ level }) => progress[level.id]).length;
        const golds = entries.filter(({ level }) => progress[level.id]?.medal === 'gold').length;
        const head = document.createElement('header');
        head.append(
          Object.assign(document.createElement('h2'), { textContent: t.name }),
          Object.assign(document.createElement('span'), {
            className: 'tally',
            textContent: `${cleared}/${entries.length} cleared${golds ? ` · ${MEDAL_ICON.gold} ${golds}` : ''}`,
          }),
        );
        const isles = document.createElement('div');
        isles.className = 'isles';
        for (const { level, i } of entries) {
          const p = progress[level.id];
          const mode = partyModeFor(level);
          const isle = document.createElement('button');
          isle.type = 'button';
          isle.className = 'isle';
          const m = Object.assign(document.createElement('span'), { className: 'm' });
          isle.append(
            levelPreview(level),
            Object.assign(document.createElement('span'), { className: 'n', textContent: String(i + 1) }),
            Object.assign(document.createElement('span'), { className: 'name', textContent: level.name }),
            m,
          );
          if (players > 1) {
            m.textContent = mode ? PARTY_MODE_NAME[mode] : 'solo only';
            isle.disabled = mode === null;
          } else if (p?.medal) {
            m.textContent = `${MEDAL_ICON[p.medal]} ${p.best}`;
          }
          isle.addEventListener('click', () => handlers.onSelect(i, players));
          isles.append(isle);
        }
        world.append(head, isles);
        return [world];
      }),
    );
  }

  return {
    showMenu(levels: readonly Level[], progress: Record<string, LevelProgress>) {
      shown = { levels, progress };
      cancelAutoNext();
      renderMenu();
      result.hidden = true;
      title.hidden = true;
      banner.hidden = true;
      menu.hidden = false;
    },
    /** Scoreboard in the HUD; null clears it for solo play. */
    setParty(info: { name: string; score: number | null; active: boolean; out: boolean }[] | null) {
      partyBox.replaceChildren(
        ...(info ?? []).map((p) => {
          const chip = document.createElement('span');
          chip.className = `player${p.active ? ' active' : ''}${p.out ? ' out' : ''}`;
          chip.textContent = p.score === null ? p.name : `${p.name} ${p.score}`;
          return chip;
        }),
      );
    },
    /** Big bouncing call-out for chain reactions, with a smaller line under it. */
    callout(title: string, sub: string) {
      calloutBox.replaceChildren(
        Object.assign(document.createElement('div'), { className: 'title', textContent: title }),
        Object.assign(document.createElement('div'), { className: 'sub', textContent: sub }),
      );
      calloutBox.classList.remove('show');
      void calloutBox.offsetWidth; // restart the CSS animation
      calloutBox.classList.add('show');
    },
    /** The start-of-level card: what to do here. Counts down its last few seconds, or until the player acts. */
    showBanner(brief: Brief, seconds = 4) {
      const countdown = Object.assign(document.createElement('div'), { className: 'countdown' });
      banner.replaceChildren(
        Object.assign(document.createElement('div'), { className: 'title', textContent: brief.title }),
        Object.assign(document.createElement('div'), { className: 'goal', textContent: brief.goal }),
        ...brief.lines.map((line) =>
          Object.assign(document.createElement('div'), { className: 'line', textContent: line }),
        ),
        countdown,
      );
      banner.hidden = false;
      banner.classList.remove('leaving');
      clearTimeout(bannerTimer);
      clearInterval(countdownTimer);
      let remaining = seconds;
      const tick = () => {
        remaining--;
        countdown.textContent = remaining > 0 && remaining <= 3 ? `Starting in ${remaining}…` : '';
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          this.hideBanner();
        }
      };
      countdownTimer = setInterval(tick, 1000);
    },
    hideBanner() {
      if (banner.hidden || banner.classList.contains('leaving')) return;
      clearTimeout(bannerTimer);
      clearInterval(countdownTimer);
      banner.classList.add('leaving'); // fades out, then hides
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, 350);
    },
    /** Short message over the playfield that fades by itself. */
    toast(text: string) {
      toastBox.textContent = text;
      toastBox.classList.remove('show');
      void toastBox.offsetWidth; // restart the CSS animation
      toastBox.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastBox.classList.remove('show'), 1600);
    },
    showPartyResult(title: string, detail: string) {
      el('result-title').textContent = title;
      el('result-medal').textContent = '🏆';
      el('result-detail').textContent = detail;
      el('next-btn').hidden = true;
      result.hidden = false;
    },
    hideMenu() {
      menu.hidden = true;
    },
    setLevel(level: Level) {
      el('level-name').textContent = level.name;
      el('goal').textContent = `${goalText(level.goal)} · ${TOOLS[level.tool].name}`;
      el('throws-label').textContent = TOOLS[level.tool].grab
        ? 'Grabs'
        : TOOLS[level.tool].hose
          ? 'Water (s)'
          : TOOLS[level.tool].laser
            ? 'Shots'
            : 'Throws';
      ballColor = `#${TOOLS[level.tool].color.toString(16).padStart(6, '0')}`;
      countsBalls = !TOOLS[level.tool].hose;
      result.hidden = true;
      cancelAutoNext();
      lastResult = null;
    },
    showTitle() {
      menu.hidden = true;
      result.hidden = true;
      title.hidden = false;
      document.body.classList.add('on-title');
    },
    hideTitle() {
      title.hidden = true;
      document.body.classList.remove('on-title');
    },
    /** Floating score text at a screen position; removes itself when its animation ends. */
    popup(text: string, x: number, y: number, negative: boolean, color?: string) {
      const node = document.createElement('div');
      node.className = negative ? 'popup negative' : 'popup';
      node.textContent = text;
      if (color && !negative) node.style.setProperty('--pop', color);
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.addEventListener('animationend', () => node.remove());
      document.body.append(node);
    },
    /** A speech bubble over a character; fades by itself. At most a few at a time. */
    bubble(text: string, x: number, y: number) {
      const live = document.querySelectorAll('.bubble');
      if (live.length >= 3) return;
      const node = document.createElement('div');
      node.className = 'bubble';
      node.textContent = text;
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.addEventListener('animationend', () => node.remove());
      document.body.append(node);
    },
    setStats(throwsLeft: number, score: number) {
      const throws = el('throws');
      if (countsBalls && throwsLeft > 0 && throwsLeft <= MAX_BALL_ICONS) {
        // one ball per throw left, so the budget reads at a glance
        throws.replaceChildren(
          ...Array.from({ length: throwsLeft }, () => {
            const ball = document.createElement('span');
            ball.className = 'ball-icon';
            ball.style.background = ballColor;
            return ball;
          }),
        );
        throws.setAttribute('aria-label', String(throwsLeft));
      } else {
        throws.textContent = throwsLeft >= 999 ? '∞' : String(throwsLeft);
        throws.removeAttribute('aria-label');
      }
      el('score').textContent = String(score);
    },
    showResult(opts: ResultOpts) {
      lastResult = opts;
      el('result-title').textContent = opts.won ? 'Level cleared!' : (opts.lostReason ?? 'Out of throws');
      const medal = el('result-medal');
      medal.textContent = opts.won ? (opts.medal ? MEDAL_ICON[opts.medal] : 'No medal') : '';
      medal.classList.remove('drop');
      const panel = medal.parentElement as HTMLElement;
      panel.style.overflow = '';
      if (opts.won && opts.medal) {
        // the medal overshoots the panel while it drops; clip until it lands so no scrollbars flash up
        panel.style.overflow = 'hidden';
        medal.addEventListener('animationend', () => (panel.style.overflow = ''), { once: true });
        void medal.offsetWidth; // restart the drop animation
        medal.classList.add('drop');
      }
      el('result-detail').textContent = opts.won
        ? `Score ${opts.score} · Best ${opts.best}`
        : 'Give it another go.';
      el('next-btn').hidden = !(opts.won && opts.hasNext);
      result.hidden = false;
      if (opts.won && opts.hasNext && opts.autoNextSeconds) startAutoNext(opts.autoNextSeconds);
      else cancelAutoNext();
    },
    /** Bring the last result panel back (closing the level menu on top of a finished level). */
    restoreResult() {
      if (lastResult) this.showResult({ ...lastResult, autoNextSeconds: undefined });
    },
  };
}

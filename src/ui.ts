import type { Brief } from './brief';
import type { Goal, Level } from './level';
import { MAX_PLAYERS, type PartyMode, partyModeFor } from './party';
import type { LevelProgress } from './progress';
import type { Medal } from './rules';
import { THEME_IDS, THEMES } from './themes';
import { TOOLS } from './tools';

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

export interface UiHandlers {
  /** `players` is 1 for normal play, 2-4 for a hot-seat party game */
  onSelect: (index: number, players: number) => void;
  onRetry: () => void;
  onNext: () => void;
  onOpenMenu: () => void;
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
  let players = 1;
  let shown: { levels: readonly Level[]; progress: Record<string, LevelProgress> } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  el('menu-btn').addEventListener('click', handlers.onOpenMenu);
  el('play-btn').addEventListener('click', handlers.onOpenMenu);
  el('title-btn').addEventListener('click', handlers.onTitle);
  const title = el('title');
  let ballColor = '#ffb703';
  let countsBalls = true; // false for the hose, whose budget is seconds of water
  el('levels-btn').addEventListener('click', handlers.onOpenMenu);
  el('retry-btn').addEventListener('click', handlers.onRetry);
  el('next-btn').addEventListener('click', handlers.onNext);

  function renderMenu() {
    if (!shown) return;
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
    /** The start-of-level card: what to do here. Stays a few seconds, or until the player acts. */
    showBanner(brief: Brief, seconds = 5) {
      banner.replaceChildren(
        Object.assign(document.createElement('div'), { className: 'title', textContent: brief.title }),
        Object.assign(document.createElement('div'), { className: 'goal', textContent: brief.goal }),
        ...brief.lines.map((line) =>
          Object.assign(document.createElement('div'), { className: 'line', textContent: line }),
        ),
      );
      banner.hidden = false;
      banner.classList.remove('leaving');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => this.hideBanner(), seconds * 1000);
    },
    hideBanner() {
      if (banner.hidden || banner.classList.contains('leaving')) return;
      clearTimeout(bannerTimer);
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
    showResult(opts: {
      won: boolean;
      score: number;
      medal: Medal | null;
      best: number;
      hasNext: boolean;
      /** shown instead of "Out of throws" when the level was lost another way */
      lostReason?: string;
    }) {
      el('result-title').textContent = opts.won ? 'Level cleared!' : (opts.lostReason ?? 'Out of throws');
      const medal = el('result-medal');
      medal.textContent = opts.won ? (opts.medal ? MEDAL_ICON[opts.medal] : 'No medal') : '';
      medal.classList.remove('drop');
      if (opts.won && opts.medal) {
        void medal.offsetWidth; // restart the drop animation
        medal.classList.add('drop');
      }
      el('result-detail').textContent = opts.won
        ? `Score ${opts.score} · Best ${opts.best}`
        : 'Give it another go.';
      el('next-btn').hidden = !(opts.won && opts.hasNext);
      result.hidden = false;
    },
  };
}

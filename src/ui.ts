import type { Goal, Level } from './level';
import { MAX_PLAYERS, type PartyMode, partyModeFor } from './party';
import type { LevelProgress } from './progress';
import type { Medal } from './rules';
import { TOOLS } from './tools';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id} in index.html`);
  return node as T;
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
}

export function createUi(handlers: UiHandlers) {
  const menu = el('menu');
  const result = el('result');
  const grid = el('level-grid');
  const playerRow = el('player-row');
  const partyBox = el('party');
  const toastBox = el('toast');
  const calloutBox = el('callout');
  let players = 1;
  let shown: { levels: readonly Level[]; progress: Record<string, LevelProgress> } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  el('menu-btn').addEventListener('click', handlers.onOpenMenu);
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
    grid.replaceChildren(
      ...levels.map((level, i) => {
        const p = progress[level.id];
        const mode = partyModeFor(level);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'card';
        card.innerHTML = `<span class="n">${i + 1}</span><span>${level.name}</span><span class="m"></span>`;
        const m = card.querySelector('.m') as HTMLElement;
        if (players > 1) {
          m.textContent = mode ? PARTY_MODE_NAME[mode] : 'solo only';
          card.disabled = mode === null;
        } else if (p?.medal) {
          m.textContent = `${MEDAL_ICON[p.medal]} ${p.best}`;
          m.className = `m medal-${p.medal}`;
        }
        card.addEventListener('click', () => handlers.onSelect(i, players));
        return card;
      }),
    );
  }

  return {
    showMenu(levels: readonly Level[], progress: Record<string, LevelProgress>) {
      shown = { levels, progress };
      renderMenu();
      result.hidden = true;
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
      result.hidden = true;
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
      el('throws').textContent = throwsLeft >= 999 ? '∞' : String(throwsLeft);
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
      el('result-detail').textContent = opts.won
        ? `Score ${opts.score} · Best ${opts.best}`
        : 'Give it another go.';
      el('next-btn').hidden = !(opts.won && opts.hasNext);
      result.hidden = false;
    },
  };
}

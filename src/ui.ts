import type { Goal, Level } from './level';
import type { LevelProgress } from './progress';
import type { Medal } from './rules';
import { TOOLS } from './tools';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id} in index.html`);
  return node as T;
}

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
  onSelect: (index: number) => void;
  onRetry: () => void;
  onNext: () => void;
  onOpenMenu: () => void;
}

export function createUi(handlers: UiHandlers) {
  const menu = el('menu');
  const result = el('result');
  const grid = el('level-grid');

  el('menu-btn').addEventListener('click', handlers.onOpenMenu);
  el('levels-btn').addEventListener('click', handlers.onOpenMenu);
  el('retry-btn').addEventListener('click', handlers.onRetry);
  el('next-btn').addEventListener('click', handlers.onNext);

  return {
    showMenu(levels: readonly Level[], progress: Record<string, LevelProgress>) {
      grid.replaceChildren(
        ...levels.map((level, i) => {
          const p = progress[level.id];
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'card';
          card.innerHTML = `<span class="n">${i + 1}</span><span>${level.name}</span><span class="m"></span>`;
          const m = card.querySelector('.m') as HTMLElement;
          if (p?.medal) {
            m.textContent = `${MEDAL_ICON[p.medal]} ${p.best}`;
            m.className = `m medal-${p.medal}`;
          }
          card.addEventListener('click', () => handlers.onSelect(i));
          return card;
        }),
      );
      result.hidden = true;
      menu.hidden = false;
    },
    hideMenu() {
      menu.hidden = true;
    },
    setLevel(level: Level) {
      el('level-name').textContent = level.name;
      el('goal').textContent = `${goalText(level.goal)} · ${TOOLS[level.tool].name}`;
      el('throws-label').textContent = TOOLS[level.tool].grab ? 'Grabs' : 'Throws';
      result.hidden = true;
    },
    /** Floating score text at a screen position; removes itself when its animation ends. */
    popup(text: string, x: number, y: number, negative: boolean) {
      const node = document.createElement('div');
      node.className = negative ? 'popup negative' : 'popup';
      node.textContent = text;
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.addEventListener('animationend', () => node.remove());
      document.body.append(node);
    },
    setStats(throwsLeft: number, score: number) {
      el('throws').textContent = String(throwsLeft);
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

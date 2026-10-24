import { playStinger } from './audio';
import type { createCameraRig } from './camera-runtime';
import type { BlockEntity, CharacterEntity, Phase } from './entities';
import type { Level } from './level';
import {
  createParty,
  endDuelTurn,
  endJengaTurn,
  type Party,
  partyModeFor,
  playerLabel,
  topple,
  totalTurns,
} from './party';
import { loadProgress } from './progress';
import { type BlockState, blockScore, type CharacterState, characterScore } from './rules';
import { titleLevel } from './title';
import type { createUi } from './ui';

const INFINITE_TURNS = 999; // Jenga-off has no throw limit

/**
 * Menu/title navigation, hot-seat party flow, and the score/stat readouts both of those (and the rest
 * of main.ts) read. `loadLevel`/`clearLevel` stay in main.ts — they build the scene/physics bodies for a
 * level, using mesh/material state that lives in main.ts's renderer setup — this is everything *around*
 * that: when to call it, and what the level's score and remaining throws are.
 */
export function createLevelRuntime(deps: {
  ui: ReturnType<typeof createUi>;
  levels: readonly Level[];
  cam: ReturnType<typeof createCameraRig>;
  loadLevel: (index: number) => void;
  fireworks: { celebrate: (shells: number, platformTop: number) => void };
  TITLE_INDEX: number;
  blocks: BlockEntity[];
  chars: CharacterEntity[];
  getLevel: () => Level;
  getLevelIndex: () => number;
  getPhase: () => Phase;
  setPhase: (p: Phase) => void;
  getParty: () => Party | null;
  setParty: (p: Party | null) => void;
  getThrowsUsed: () => number;
  getBonus: () => number;
  setTurnActive: (active: boolean) => void;
}) {
  const {
    ui,
    levels,
    cam,
    loadLevel,
    fireworks,
    TITLE_INDEX,
    blocks,
    chars,
    getLevel,
    getLevelIndex,
    getPhase,
    setPhase,
    getParty,
    setParty,
    getThrowsUsed,
    getBonus,
    setTurnActive,
  } = deps;

  const titleScene = titleLevel();

  let menuReturn: { phase: Phase; introLevel: number } | null = null;

  /** A level was just picked directly (menu click, or a phone's `select`): any stale "back" target is moot. */
  function forgetMenuReturn() {
    menuReturn = null;
  }

  function openMenu() {
    if (getPhase() !== 'menu') menuReturn = { phase: getPhase(), introLevel: cam.introLevel };
    setPhase('menu');
    cam.introLevel = -1; // picking a level from the menu flies in again
    ui.showMenu(levels, loadProgress());
  }

  /** Close the level list without picking: back to the title, or to the level (and its result) underneath. */
  function closeMenu() {
    if (getPhase() !== 'menu') return;
    const back = menuReturn;
    menuReturn = null;
    ui.hideMenu();
    if (!back || back.phase === 'menu' || back.phase === 'title' || getLevelIndex() === TITLE_INDEX) {
      showTitle();
      return;
    }
    setPhase(back.phase);
    cam.introLevel = back.introLevel;
    if (back.phase === 'won' || back.phase === 'lost') ui.restoreResult();
  }

  function showTitle() {
    setParty(null);
    loadLevel(TITLE_INDEX);
    setPhase('title');
    ui.showTitle();
  }

  function blockStates(): BlockState[] {
    return blocks.map((b) => ({ type: b.type, status: b.status, multiplier: b.multiplier }));
  }

  function charStates(): CharacterState[] {
    return chars.map((c) => ({ role: c.role, status: c.status }));
  }

  function totalThrows() {
    const party = getParty();
    if (!party) return getLevel().throws;
    return party.mode === 'duel' ? totalTurns(party) : INFINITE_TURNS;
  }

  function throwsLeft() {
    // hose water is spent continuously, so round up: a sliver of water still counts as a second
    return Math.max(0, Math.ceil(totalThrows() - getThrowsUsed() - 1e-6));
  }

  /** Points so far: fallen blocks, knocked-off rivals and chain bonus. */
  function currentScore() {
    return blockScore(blockStates()) + characterScore(charStates()) + getBonus();
  }

  let lastStats = '';
  function refreshStats() {
    const left = throwsLeft();
    const score = currentScore();
    const key = `${left}/${score}`;
    if (key === lastStats) return;
    lastStats = key;
    ui.setStats(left, score);
  }

  /** Forces the next `refreshStats()` to redraw, even if the numbers happen to match the last level's. */
  function resetStats() {
    lastStats = '';
  }

  function startSolo(index: number) {
    setParty(null);
    loadLevel(index);
  }

  function startParty(index: number, players: number) {
    const lvl = levels[index];
    const mode = partyModeFor(lvl);
    if (!mode) return startSolo(index);
    setParty(createParty(mode, players, lvl.throws));
    loadLevel(index);
    announceTurn();
  }

  function restart() {
    const party = getParty();
    if (getLevelIndex() === TITLE_INDEX) showTitle();
    else if (party) startParty(getLevelIndex(), party.players);
    else loadLevel(getLevelIndex());
  }

  function refreshParty() {
    const party = getParty();
    if (!party) {
      ui.setParty(null);
      return;
    }
    ui.setParty(
      party.scores.map((score, i) => ({
        name: playerLabel(i),
        score: party.mode === 'duel' ? score : null,
        active: i === party.current && !party.winners,
        out: party.out[i],
      })),
    );
  }

  let turnBaseline = 0; // party duel: block score when the turn started

  function announceTurn() {
    const party = getParty();
    if (!party) return;
    turnBaseline = currentScore();
    ui.toast(`${playerLabel(party.current)}'s turn`);
    refreshParty();
  }

  /** Party: the current player's throw has resolved. Score it and pass the turn. */
  function endPartyTurn() {
    const party = getParty();
    if (!party) return;
    setTurnActive(false);
    const who = party.current;
    if (party.mode === 'duel') {
      const score = currentScore();
      const gained = score - turnBaseline;
      turnBaseline = score; // set now: the next player may act before the toast ends
      endDuelTurn(party, gained);
      ui.toast(`${playerLabel(who)} ${gained > 0 ? '+' : ''}${gained}`);
      if (!party.winners) setTimeout(announceTurn, 900);
    } else {
      endJengaTurn(party);
      if (!party.winners) announceTurn();
    }
    refreshParty();
    if (party.winners) finishParty();
  }

  /** Party: the Jenga tower fell on the current player's watch. */
  function partyTopple() {
    const party = getParty();
    if (!party) return;
    const loser = party.current;
    const rebuild = topple(party);
    playStinger('lose');
    refreshParty();
    if (!rebuild) return finishParty();
    setPhase('lost'); // freeze the sim until the rebuild
    ui.toast(`${playerLabel(loser)} toppled it!`);
    setTimeout(() => {
      if (getParty() !== party || getPhase() !== 'lost') return; // the player left or restarted meanwhile
      loadLevel(getLevelIndex());
      announceTurn();
    }, 1600);
  }

  function finishParty() {
    const party = getParty();
    if (!party?.winners) return;
    setPhase('won');
    playStinger('win');
    fireworks.celebrate(30, getLevel().platform.top);
    const names = party.winners.map(playerLabel).join(' & ');
    const detail =
      party.mode === 'duel'
        ? party.scores.map((s, i) => `${playerLabel(i)} ${s}`).join(' · ')
        : `${names} is the last one standing${party.winners.length > 1 ? ' (turn limit reached)' : ''}`;
    ui.showPartyResult(party.winners.length === 1 ? `${names} wins!` : `Tie: ${names}`, detail);
  }

  return {
    titleScene,
    openMenu,
    closeMenu,
    forgetMenuReturn,
    showTitle,
    blockStates,
    charStates,
    totalThrows,
    throwsLeft,
    currentScore,
    refreshStats,
    resetStats,
    startSolo,
    startParty,
    restart,
    refreshParty,
    announceTurn,
    endPartyTurn,
    partyTopple,
    finishParty,
  };
}

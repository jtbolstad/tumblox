// The phone side of the remote: tilt aims, a swipe on the pad throws.
import '@fontsource-variable/fredoka';
import Peer from 'peerjs';
import { startTranslating, tr } from './i18n';
import { loadBundledLevels } from './level';
import { type HostMsg, parseHostMsg, type RemoteMsg, wrapDeg } from './remote-protocol';
import { THEME_IDS, THEMES } from './themes';
import { chargeTier, type PointerSample, powerTier, releaseVelocity } from './throw';
import { levelThumb } from './thumb';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = el('status');
const turnBanner = el('turn-banner');
const connectBtn = el<HTMLButtonElement>('connect');
const pad = el('pad');
const orbitPad = el('orbit-pad');
const orbitKnob = el('orbit-knob');
const centerBtn = el('center');
const speedBox = el('speed');
const bar = el('bar');
const levelName = el('level-name');
const throwsBox = el('throws');
const buttons = el('buttons');
const nextBtn = el<HTMLButtonElement>('next-btn');
const picker = el('picker');
const levelList = el('level-list');

// the same static bundle the game page has: its levels line up by index with `levelInfo` from the host
const bundledLevels = loadBundledLevels();
const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
/** True for colours dark enough to need white text on them. */
function isDark(color: number) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

type State = Extract<HostMsg, { t: 'state' }>;
let state: State | null = null;
let levelInfo: Extract<HostMsg, { t: 'levels' }>['levels'] = [];
/** The power of a swipe in words: nobody knows what a number of pixels a second means. */
const POWER_WORDS = ['Gentle toss', 'Light throw', 'Strong throw', 'Full power!'] as const;
const tierText = (tier: 0 | 1 | 2 | 3) =>
  `${'●'.repeat(tier + 1)}${'○'.repeat(3 - tier)}  ${tr(POWER_WORDS[tier])}`;
const power = (speed: number) => tierText(powerTier(speed, state?.tiers ?? [1000, 2300, 5400]));
const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' } as const;
// one fixed color per hot-seat slot, so whoever's turn it is reads at a glance, before the text does
const PLAYER_COLORS = ['#fb8500', '#219ebc', '#8ac926', '#e63972'];

// the hash is "<hostId>:<slot>" for a party phone (one per player), or just "<hostId>" for solo play
const [hostId, slotPart] = location.hash.slice(1).split(':');
const mySlot = Number.parseInt(slotPart ?? '', 10) || 0;
let conn: ReturnType<Peer['connect']> | null = null;
let base: { alpha: number; beta: number } | null = null;
let latest: { alpha: number; beta: number } | null = null;
let lastSent = 0;
let myTurn = true; // false while a hot-seat party is on another player's turn

function send(m: RemoteMsg) {
  if (conn?.open) conn.send(m);
}

function setStatus(text: string) {
  status.textContent = tr(text);
}

async function allowMotion(): Promise<boolean> {
  // iOS asks the user first, and only from a tap
  const ctor = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof ctor.requestPermission === 'function') {
    try {
      return (await ctor.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

function onOrientation(e: DeviceOrientationEvent) {
  if (e.alpha === null || e.beta === null) return;
  latest = { alpha: e.alpha, beta: e.beta };
  base ??= latest;
  const yaw = wrapDeg(latest.alpha - base.alpha);
  const pitch = latest.beta - base.beta;
  if (!myTurn) return; // a hot-seat party: don't move the aim crosshair on someone else's turn
  const now = performance.now();
  if (now - lastSent < 30) return; // about 30 updates a second is plenty
  lastSent = now;
  send({ t: 'aim', yaw, pitch });
}

connectBtn.addEventListener('click', async () => {
  if (!hostId) {
    setStatus('Scan the QR code on the game screen to open this page.');
    return;
  }
  if (!(await allowMotion())) {
    setStatus('Motion sensors are needed to aim. Allow them and try again.');
    return;
  }
  addEventListener('deviceorientation', onOrientation);
  setStatus('Connecting…');
  connectBtn.disabled = true;
  const peer = new Peer();
  peer.on('open', () => {
    conn = peer.connect(hostId, { serialization: 'json' });
    conn.on('data', (data) => {
      const m = parseHostMsg(data);
      if (!m) return;
      if (m.t === 'state') state = m;
      else levelInfo = m.levels;
      render();
    });
    conn.on('open', () => {
      send({ t: 'identify', slot: mySlot });
      setStatus('Connected. Point at the screen.');
      connectBtn.hidden = true;
      pad.hidden = false;
      centerBtn.hidden = false;
      buttons.hidden = false;
      bar.hidden = false;
      navigator.wakeLock?.request('screen').catch(() => undefined); // keep the phone awake while playing
    });
    conn.on('close', () => {
      setStatus('Disconnected. Reload the page to connect again.');
      pad.hidden = true;
    });
  });
  peer.on('error', () => {
    setStatus('Could not connect. Is the game open on the other screen?');
    connectBtn.disabled = false;
  });
});

centerBtn.addEventListener('click', () => {
  base = latest; // whatever the phone points at now is "straight ahead"
});

// the pad: a finger down, then either a swipe (speed throws) or a held press (hold time charges,
// just like holding Space on the keyboard)
let samples: PointerSample[] = [];
let padDownAt = 0;
let chargeTimer: ReturnType<typeof setInterval> | undefined;
const TAP_SPEED_THRESHOLD = 300; // px/s: below this a release counts as a held press, not a swipe

pad.addEventListener('pointerdown', (ev) => {
  if (!myTurn) return; // a hot-seat party: wait for this phone's player to come up
  pad.setPointerCapture(ev.pointerId);
  pad.classList.add('active');
  samples = [{ t: ev.timeStamp, x: ev.clientX, y: ev.clientY }];
  padDownAt = ev.timeStamp;
  send({ t: 'down' });
  clearInterval(chargeTimer);
  chargeTimer = setInterval(() => {
    // only show the charging power while the finger has not swiped yet
    if (releaseVelocity(samples).speed < TAP_SPEED_THRESHOLD) {
      speedBox.textContent = tierText(chargeTier((performance.now() - padDownAt) / 1000));
    }
  }, 60);
});
pad.addEventListener('pointermove', (ev) => {
  if (!pad.hasPointerCapture(ev.pointerId)) return;
  samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
  if (samples.length > 64) samples.shift();
  speedBox.textContent = power(releaseVelocity(samples).speed);
});
function lift(ev: PointerEvent) {
  clearInterval(chargeTimer);
  if (!pad.hasPointerCapture(ev.pointerId)) return;
  samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
  const speed = releaseVelocity(samples).speed;
  const holdMs = ev.timeStamp - padDownAt;
  pad.classList.remove('active');
  speedBox.textContent = speed > 0 ? power(speed) : '';
  send({ t: 'up', speed, holdMs });
  if (speed > 300 || holdMs > 150) navigator.vibrate?.(30);
}
pad.addEventListener('pointerup', lift);
pad.addEventListener('pointercancel', lift);

// the knob: drags off-centre to rotate/tilt the camera, independent of the tilt sensor that aims
const ORBIT_RADIUS = 30; // px the knob can travel from centre, also how far a finger must drag for full speed
let orbitDx = 0;
let orbitDy = 0;
let orbitSendTimer: ReturnType<typeof setInterval> | undefined;

function updateOrbitKnob(ev: PointerEvent) {
  const rect = orbitPad.getBoundingClientRect();
  const dx = (ev.clientX - (rect.left + rect.width / 2)) / ORBIT_RADIUS;
  const dy = (ev.clientY - (rect.top + rect.height / 2)) / ORBIT_RADIUS;
  const len = Math.hypot(dx, dy) || 1;
  const clamp = Math.min(1, len);
  orbitDx = (dx / len) * clamp;
  orbitDy = (dy / len) * clamp;
  orbitKnob.style.transform = `translate(${orbitDx * ORBIT_RADIUS}px, ${orbitDy * ORBIT_RADIUS}px)`;
}
function releaseOrbitKnob() {
  clearInterval(orbitSendTimer);
  orbitSendTimer = undefined;
  orbitDx = 0;
  orbitDy = 0;
  orbitKnob.style.transform = '';
}
orbitPad.addEventListener('pointerdown', (ev) => {
  ev.stopPropagation(); // don't let the throw pad underneath see this finger too
  orbitPad.setPointerCapture(ev.pointerId);
  updateOrbitKnob(ev);
  clearInterval(orbitSendTimer);
  orbitSendTimer = setInterval(() => {
    if (orbitDx !== 0 || orbitDy !== 0) send({ t: 'orbit', dx: orbitDx, dy: orbitDy });
  }, 33);
});
orbitPad.addEventListener('pointermove', (ev) => {
  if (!orbitPad.hasPointerCapture(ev.pointerId)) return;
  ev.stopPropagation();
  updateOrbitKnob(ev);
});
orbitPad.addEventListener('pointerup', (ev) => {
  ev.stopPropagation();
  releaseOrbitKnob();
});
orbitPad.addEventListener('pointercancel', (ev) => {
  ev.stopPropagation();
  releaseOrbitKnob();
});

// buttons: the same actions as the game's own screens
function sendCmd(cmd: 'retry' | 'next' | 'menu' | 'title') {
  send({ t: 'cmd', cmd });
  navigator.vibrate?.(15);
}
el('retry-btn').addEventListener('click', () => sendCmd('retry'));
nextBtn.addEventListener('click', () => sendCmd('next'));
el('levels-btn').addEventListener('click', () => openPicker());
el('picker-close').addEventListener('click', () => closePicker());

/** World map, grouped and coloured the same way the game's own level menu is. */
function openPicker() {
  levelList.replaceChildren(
    ...THEME_IDS.flatMap((themeId) => {
      const entries = levelInfo.flatMap((l, i) => (l.theme === themeId ? [{ l, i }] : []));
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
      const head = document.createElement('header');
      head.append(Object.assign(document.createElement('h2'), { textContent: tr(t.name) }));
      const isles = document.createElement('div');
      isles.className = 'isles';
      for (const { l, i } of entries) {
        const isle = document.createElement('button');
        isle.type = 'button';
        isle.className = state?.level === i ? 'isle current' : 'isle';
        const bundled = bundledLevels[i];
        isle.append(
          ...(bundled ? [levelThumb(bundled)] : []),
          Object.assign(document.createElement('span'), { className: 'n', textContent: String(i + 1) }),
          Object.assign(document.createElement('span'), { className: 'name', textContent: tr(l.name) }),
          Object.assign(document.createElement('span'), {
            className: 'm',
            textContent: l.medal ? MEDAL[l.medal] : '',
          }),
        );
        isle.addEventListener('click', () => {
          send({ t: 'select', index: i });
          closePicker();
        });
        isles.append(isle);
      }
      world.append(head, isles);
      return [world];
    }),
  );
  picker.hidden = false;
}
function closePicker() {
  picker.hidden = true;
}

/** Show what the game is doing: level name, throws left, and only the buttons that make sense now. */
function render() {
  if (!state) return;
  const { phase } = state;
  levelName.textContent = state.name ? tr(state.name) : 'Tumble';
  throwsBox.textContent = phase === 'playing' ? `${tr('Throws')}: ${state.throwsLeft}` : '';
  el('retry-btn').hidden = phase === 'title' || phase === 'menu';
  nextBtn.hidden = !(phase === 'won' && state.hasNext);
  myTurn = state.players <= 1 || state.currentPlayer === mySlot;
  pad.classList.toggle('waiting', phase === 'playing' && !myTurn);

  // a shared phone gets passed around: who it is now is more important than any other status line
  const showBanner = state.players > 1 && phase === 'playing';
  turnBanner.hidden = !showBanner;
  if (showBanner) {
    turnBanner.classList.toggle('mine', myTurn);
    turnBanner.classList.toggle('theirs', !myTurn);
    turnBanner.style.background = PLAYER_COLORS[state.currentPlayer % PLAYER_COLORS.length];
    turnBanner.textContent = myTurn
      ? tr(`You are P${mySlot + 1}. Point at the screen.`)
      : tr(`P${state.currentPlayer + 1}'s turn — wait for yours`);
  }

  if (phase === 'won') setStatus('Level cleared!');
  else if (phase === 'lost') setStatus('Out of throws');
  else if (phase === 'title' || phase === 'menu') setStatus('Pick a level');
  else if (!showBanner) setStatus('Connected. Point at the screen.');
  else status.textContent = ''; // the banner above already says whose turn it is
  // the game's own level list is open, or we are on the title: the phone offers the choice too
  if ((phase === 'menu' || phase === 'title') && picker.hidden && levelInfo.length > 0) openPicker();
}

startTranslating();

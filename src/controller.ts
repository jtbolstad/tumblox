// The phone side of the remote: tilt aims, a swipe on the pad throws.
import '@fontsource-variable/fredoka';
import Peer from 'peerjs';
import { startTranslating, tr } from './i18n';
import { type RemoteMsg, wrapDeg } from './remote-protocol';
import { type PointerSample, releaseVelocity } from './throw';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = el('status');
const connectBtn = el<HTMLButtonElement>('connect');
const pad = el('pad');
const centerBtn = el('center');
const speedBox = el('speed');

const hostId = location.hash.slice(1);
let conn: ReturnType<Peer['connect']> | null = null;
let base: { alpha: number; beta: number } | null = null;
let latest: { alpha: number; beta: number } | null = null;
let lastSent = 0;

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
  const now = performance.now();
  if (now - lastSent < 30) return; // about 30 updates a second is plenty
  lastSent = now;
  send({ t: 'aim', yaw: wrapDeg(latest.alpha - base.alpha), pitch: latest.beta - base.beta });
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
    conn.on('open', () => {
      setStatus('Connected. Point at the screen.');
      connectBtn.hidden = true;
      pad.hidden = false;
      centerBtn.hidden = false;
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

// the pad: a finger down, a swipe, and how fast it was going when it lifted
let samples: PointerSample[] = [];
pad.addEventListener('pointerdown', (ev) => {
  pad.setPointerCapture(ev.pointerId);
  pad.classList.add('active');
  samples = [{ t: ev.timeStamp, x: ev.clientX, y: ev.clientY }];
  send({ t: 'down' });
});
pad.addEventListener('pointermove', (ev) => {
  if (!pad.hasPointerCapture(ev.pointerId)) return;
  samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
  if (samples.length > 64) samples.shift();
  speedBox.textContent = `${Math.round(releaseVelocity(samples).speed)} px/s`;
});
function lift(ev: PointerEvent) {
  if (!pad.hasPointerCapture(ev.pointerId)) return;
  samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
  const speed = releaseVelocity(samples).speed;
  pad.classList.remove('active');
  speedBox.textContent = speed > 0 ? `${Math.round(speed)} px/s` : '';
  send({ t: 'up', speed });
  if (speed > 300) navigator.vibrate?.(30);
}
pad.addEventListener('pointerup', lift);
pad.addEventListener('pointercancel', lift);

startTranslating();

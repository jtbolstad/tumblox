import { type Channel, getVolume, isMuted, setMuted, setVolume, unlockAudio } from './audio';
import { lang, setLang } from './i18n';

export const QUALITIES = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];

/**
 * The HUD's corner buttons: mute, the sound panel (one slider per audio channel), language and
 * quality. Side-effecting DOM wiring, set up once at startup. The quality setting itself lives in
 * main.ts, reached through `getQuality`/`setQuality`; `applyQuality` re-applies it to the renderer.
 */
export function createHudPanels(deps: {
  getQuality: () => Quality;
  setQuality: (q: Quality) => void;
  applyQuality: () => void;
}) {
  const { getQuality, setQuality, applyQuality } = deps;

  const muteBtn = document.getElementById('mute-btn') as HTMLElement;
  function showMute() {
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  }
  showMute();
  muteBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    showMute();
    unlockAudio();
  });

  // sound panel: one slider per channel
  const soundBtn = document.getElementById('sound-btn') as HTMLElement;
  const soundPanel = document.getElementById('sound-panel') as HTMLElement;
  for (const input of soundPanel.querySelectorAll<HTMLInputElement>('input[type=range]')) {
    const channel = input.dataset.channel as Channel;
    input.value = String(Math.round(getVolume(channel) * 100));
    input.addEventListener('input', () => {
      unlockAudio();
      setVolume(channel, Number(input.value) / 100);
    });
  }
  soundBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    soundPanel.hidden = !soundPanel.hidden;
    soundBtn.setAttribute('aria-expanded', String(!soundPanel.hidden));
    unlockAudio();
  });
  soundPanel.addEventListener('click', (ev) => ev.stopPropagation());
  addEventListener('click', () => {
    if (!soundPanel.hidden) {
      soundPanel.hidden = true;
      soundBtn.setAttribute('aria-expanded', 'false');
    }
  });

  const langBtn = document.getElementById('lang-btn') as HTMLElement;
  langBtn.textContent = lang === 'nb' ? 'EN' : 'NO'; // shows the language a click switches to
  langBtn.addEventListener('click', () => setLang(lang === 'nb' ? 'en' : 'nb'));

  const qualityBtn = document.getElementById('quality-btn') as HTMLElement;
  function showQuality() {
    const quality = getQuality();
    qualityBtn.textContent = quality[0].toUpperCase() + quality.slice(1);
  }
  showQuality();
  qualityBtn.addEventListener('click', () => {
    const next = QUALITIES[(QUALITIES.indexOf(getQuality()) + 1) % QUALITIES.length];
    setQuality(next);
    try {
      localStorage.setItem('blox.quality.v1', next);
    } catch {
      // ignore: the choice just is not remembered
    }
    applyQuality();
    showQuality();
  });
}

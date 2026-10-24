import { playerLabel } from './party';
import type { RemoteHost } from './remote';
import { drawRemoteQr } from './remote';

/**
 * The QR/status panel: one tile per phone slot the game currently wants (one per hot-seat
 * player, or just one for solo play). `remoteConnected` is owned by the caller — this only
 * reads it to render status text.
 */
export function createRemoteSlotPanel(deps: {
  remoteSlotsEl: HTMLElement;
  activeSlotCount: () => number;
  getHost: () => RemoteHost | null;
  remoteConnected: boolean[];
}) {
  const { remoteSlotsEl, activeSlotCount, getHost, remoteConnected } = deps;
  let shown = 0; // how many slot tiles are currently built, so a rebuild only happens when the count changes

  /** Rebuild the QR panels to match the current player count (a party starting, ending, or changing size). */
  function refresh() {
    const host = getHost();
    if (!host) return;
    const count = activeSlotCount();
    if (count === shown) return;
    shown = count;
    remoteSlotsEl.replaceChildren(
      ...Array.from({ length: count }, (_, slot) => {
        const box = document.createElement('div');
        box.className = 'remote-slot';
        const label = document.createElement('div');
        label.className = 'slot-label';
        label.textContent = count > 1 ? playerLabel(slot) : 'Scan with your phone';
        const canvas = document.createElement('canvas');
        canvas.width = 220;
        canvas.height = 220;
        drawRemoteQr(canvas, host.urlFor(slot));
        const status = document.createElement('div');
        status.className = 'slot-status';
        box.append(label, canvas, status);
        return box;
      }),
    );
    updateStatus();
  }

  function updateStatus() {
    const host = getHost();
    const boxes = remoteSlotsEl.querySelectorAll<HTMLElement>('.remote-slot');
    boxes.forEach((box, slot) => {
      const status = box.querySelector('.slot-status');
      if (!status) return;
      status.textContent =
        host?.unreachable && !remoteConnected[slot]
          ? 'A phone cannot open localhost. Start the game with pnpm dev:phone and open the network address.'
          : remoteConnected[slot]
            ? 'Connected'
            : 'Waiting for a phone…';
    });
  }

  /** Force the next `refresh()` to rebuild even if the slot count did not change (new QR/status needed). */
  function forceRebuild() {
    shown = -1;
  }

  return { refresh, updateStatus, forceRebuild };
}

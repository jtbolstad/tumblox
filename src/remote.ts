import Peer, { type DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import { MAX_REMOTE_SLOTS, type HostMsg, parseRemoteMsg, type RemoteMsg } from './remote-protocol';

export interface RemoteHost {
  /** the address a given player's phone should open (0-based slot) */
  urlFor(slot: number): string;
  /** true when the address still says localhost, which only works on this computer */
  unreachable: boolean;
  /** Send something to one connected phone, if there is one in that slot. */
  send(slot: number, m: HostMsg): void;
  /** Send something to every connected phone (whichever slot each is in). */
  broadcast(m: HostMsg): void;
  close(): void;
}

/** Draw a QR code for a remote URL into a canvas, so the panel can show one per player. */
export function drawRemoteQr(canvas: HTMLCanvasElement, url: string) {
  void QRCode.toCanvas(canvas, url, { width: 220, margin: 1 });
}

/**
 * The game side of the phone remote. Opens one peer on the public PeerJS broker (only used to introduce
 * devices; tilt/swipe data then flows straight between them). Up to `MAX_REMOTE_SLOTS` phones can connect
 * at once, one per hot-seat player: each scans a different QR code (the URL hash carries its slot number,
 * `urlFor`) and announces its slot with an `identify` message before anything else. `onMsg` and `onStatus`
 * are told which slot a message or status change came from; slot 0 is also the solo-play phone.
 */
export function startRemoteHost(
  onMsg: (slot: number, m: Exclude<RemoteMsg, { t: 'identify' }>) => void,
  onStatus: (slot: number, s: 'waiting' | 'connected' | 'error') => void,
): RemoteHost {
  const id = `tumble-${Math.random().toString(36).slice(2, 8)}`;
  const peer = new Peer(id);
  // on localhost a phone cannot reach this page; in dev the server tells us its network address
  const lan = (window as unknown as { __LAN_ORIGIN__?: string }).__LAN_ORIGIN__;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const base = local && lan ? new URL(location.pathname, lan).toString() : location.href;
  const sampleUrl = new URL('./remote.html', base);

  function urlFor(slot: number): string {
    const url = new URL('./remote.html', base);
    url.hash = `${id}:${slot}`;
    return url.toString();
  }

  const conns = new Map<number, DataConnection>();
  const host: RemoteHost = {
    urlFor,
    unreachable: ['localhost', '127.0.0.1', '[::1]'].includes(sampleUrl.hostname),
    send: (slot, m) => {
      const conn = conns.get(slot);
      if (conn?.open) conn.send(m);
    },
    broadcast: (m) => {
      for (const conn of conns.values()) if (conn.open) conn.send(m);
    },
    close: () => peer.destroy(),
  };

  peer.on('open', () => {
    for (let slot = 0; slot < MAX_REMOTE_SLOTS; slot++) onStatus(slot, 'waiting');
  });
  peer.on('connection', (conn) => {
    let slot: number | null = null; // known once the phone's first message identifies it
    conn.on('data', (data) => {
      const m = parseRemoteMsg(data);
      if (!m) return;
      if (m.t === 'identify') {
        conns.get(m.slot)?.close(); // a new phone claiming a slot replaces whichever one was there
        slot = m.slot;
        conns.set(slot, conn);
        onStatus(slot, 'connected');
        return;
      }
      if (slot !== null) onMsg(slot, m);
    });
    conn.on('close', () => {
      if (slot !== null && conns.get(slot) === conn) {
        conns.delete(slot);
        onStatus(slot, 'waiting');
      }
    });
  });
  peer.on('error', () => {
    for (let slot = 0; slot < MAX_REMOTE_SLOTS; slot++) onStatus(slot, 'error');
  });
  return host;
}

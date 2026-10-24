import Peer, { type DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import { parseRemoteMsg, type RemoteMsg } from './remote-protocol';

export interface RemoteHost {
  /** the address the phone should open */
  url: string;
  /** true when the address still says localhost, which only works on this computer */
  unreachable: boolean;
  close(): void;
}

/**
 * The game side of the phone remote. Opens a peer on the public PeerJS broker (only used to introduce the two
 * devices; the tilt and swipe data then flows straight between them), draws a QR code for the phone to scan,
 * and hands every valid message to `onMsg`. `onStatus` says whether a phone is connected.
 */
export function startRemoteHost(
  qrCanvas: HTMLCanvasElement,
  onMsg: (m: RemoteMsg) => void,
  onStatus: (s: 'waiting' | 'connected' | 'error') => void,
): RemoteHost {
  const id = `tumble-${Math.random().toString(36).slice(2, 8)}`;
  const peer = new Peer(id);
  // on localhost a phone cannot reach this page; in dev the server tells us its network address
  const lan = (window as unknown as { __LAN_ORIGIN__?: string }).__LAN_ORIGIN__;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const base = local && lan ? new URL(location.pathname, lan).toString() : location.href;
  const url = new URL('./remote.html', base);
  url.hash = id;
  const host: RemoteHost = {
    url: url.toString(),
    unreachable: ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    close: () => peer.destroy(),
  };
  let current: DataConnection | null = null;

  peer.on('open', () => {
    void QRCode.toCanvas(qrCanvas, host.url, { width: 220, margin: 1 });
    onStatus('waiting');
  });
  peer.on('connection', (conn) => {
    current?.close(); // one phone at a time: the newest wins
    current = conn;
    conn.on('open', () => onStatus('connected'));
    conn.on('data', (data) => {
      const m = parseRemoteMsg(data);
      if (m) onMsg(m);
    });
    conn.on('close', () => {
      if (current === conn) {
        current = null;
        onStatus('waiting');
      }
    });
  });
  peer.on('error', () => onStatus('error'));
  return host;
}

import Peer, { type DataConnection } from 'peerjs';
import { CARDS } from '../data/cards';
import { FACTIONS } from '../data/factions';

/**
 * Peer-to-peer connection for online 1v1 (WebRTC data channel via PeerJS).
 * PeerJS's free public broker is only used to introduce the two players;
 * game traffic then flows directly between browsers (or via PeerJS's
 * public TURN relay when a direct path isn't possible).
 */
const PREFIX = 'bannerfall-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** Both players must run the same game data, or the simulations would drift apart. */
export const NET_VERSION = (() => {
  const s = JSON.stringify([FACTIONS, CARDS]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
})();

export function makeCode() {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

export class NetLink {
  onMessage: (msg: any) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private closed = false;

  private constructor(
    private peer: Peer,
    private conn: DataConnection,
  ) {
    conn.on('data', (d) => this.onMessage(d));
    conn.on('close', () => this.fail('Opponent disconnected'));
    conn.on('error', () => this.fail('Connection error'));
    peer.on('disconnected', () => {
      /* lost the broker only; the direct connection may still be fine */
    });
  }

  private fail(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.onClose(reason);
  }

  send(msg: unknown) {
    if (!this.closed && this.conn.open) this.conn.send(msg);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.conn.send({ t: 'bye' });
    } catch {
      /* ignore */
    }
    setTimeout(() => this.peer.destroy(), 200);
  }

  /** Create a game: resolves with the room code right away, and `link` once someone joins. */
  static async host(onCode: (code: string) => void, signal: AbortSignal): Promise<NetLink> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeCode();
      const peer = new Peer(PREFIX + code, { debug: 0 });
      const opened = await new Promise<boolean | string>((resolve) => {
        peer.on('open', () => resolve(true));
        peer.on('error', (e: { type?: string }) => resolve(e.type ?? 'error'));
      });
      if (opened === 'unavailable-id') {
        peer.destroy();
        continue; // code collision: try another
      }
      if (opened !== true) {
        peer.destroy();
        throw new Error(opened === 'network' || opened === 'server-error' ? 'Could not reach the matchmaking service' : `Connection failed (${opened})`);
      }
      onCode(code);
      return await new Promise<NetLink>((resolve, reject) => {
        signal.addEventListener('abort', () => {
          peer.destroy();
          reject(new Error('cancelled'));
        });
        peer.on('connection', (conn) => {
          conn.on('open', () => resolve(new NetLink(peer, conn)));
        });
      });
    }
    throw new Error('Could not create a room, please try again');
  }

  /** Join a game by its room code. */
  static async join(code: string, signal: AbortSignal): Promise<NetLink> {
    const peer = new Peer({ debug: 0 });
    await new Promise<void>((resolve, reject) => {
      peer.on('open', () => resolve());
      peer.on('error', () => reject(new Error('Could not reach the matchmaking service')));
    });
    return await new Promise<NetLink>((resolve, reject) => {
      const timer = setTimeout(() => {
        peer.destroy();
        reject(new Error('No game found with that code (or it timed out)'));
      }, 15000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        peer.destroy();
        reject(new Error('cancelled'));
      });
      peer.on('error', (e: { type?: string }) => {
        clearTimeout(timer);
        peer.destroy();
        reject(new Error(e.type === 'peer-unavailable' ? 'No game found with that code' : 'Connection failed'));
      });
      const conn = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        clearTimeout(timer);
        resolve(new NetLink(peer, conn));
      });
    });
  }
}

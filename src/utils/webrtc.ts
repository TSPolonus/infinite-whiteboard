import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type {
  CanvasElement,
  BoardSettings,
  NetworkMessage,
  LaserPoint,
  RemoteCursor,
} from '../types';

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

const CHUNK_SIZE = 14000; // 14KB per chunk (far below the 64KB SCTP limit)

export interface NetworkCallbacks {
  onElementAdd: (el: CanvasElement) => void;
  onElementUpdate: (el: CanvasElement) => void;
  onElementDelete: (id: string) => void;
  onBoardSync: (elements: CanvasElement[], settings: BoardSettings) => void;
  onLaserStroke: (points: LaserPoint[]) => void;
  onCursorMove: (cursor: RemoteCursor) => void;
  onPeerJoin: (peerId: string, name: string) => void;
  onPeerLeave: (peerId: string) => void;
  onPasswordRequired: () => void;
  onPasswordError: (msg: string) => void;
  onConnectionStatusChange: (status: 'disconnected' | 'connecting' | 'connected' | 'host') => void;
  onNetworkError?: (msg: string) => void;
}

export class BoardNetworkManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private isHost: boolean = false;
  private myUserId: string = '';
  private myUserName: string = 'Użytkownik';
  private callbacks: NetworkCallbacks;
  private currentBoardProvider: () => { elements: CanvasElement[]; settings: BoardSettings };
  private roomCode: string = '';
  private heartbeatTimer: number | null = null;
  private chunkBuffers: Map<string, { chunks: string[]; received: number; total: number }> = new Map();

  constructor(
    callbacks: NetworkCallbacks,
    currentBoardProvider: () => { elements: CanvasElement[]; settings: BoardSettings }
  ) {
    this.callbacks = callbacks;
    this.currentBoardProvider = currentBoardProvider;
    this.myUserId = 'u' + Math.random().toString(36).substring(2, 6);
  }

  public getUserId(): string {
    return this.myUserId;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  public connect(roomCode: string, passwordAttempt?: string) {
    this.roomCode = roomCode.toUpperCase().trim();
    this.disconnect();
    this.callbacks.onConnectionStatusChange('connecting');

    const cleanCode = this.roomCode.replace(/[^A-Z0-9]/g, '');
    const hostPeerId = `inf2-${cleanCode}-host`;
    const clientPeerId = `inf2-${cleanCode}-${this.myUserId}`;

    const clientPeer = new Peer(clientPeerId, PEER_CONFIG);
    this.peer = clientPeer;

    clientPeer.on('open', () => {
      const conn = clientPeer.connect(hostPeerId, {
        reliable: true,
      });

      let connectedToHost = false;

      conn.on('open', () => {
        connectedToHost = true;
        this.isHost = false;
        this.connections.set(hostPeerId, conn);
        this.callbacks.onConnectionStatusChange('connected');
        this.startHeartbeat();

        this.sendSafe(conn, {
          type: 'join',
          userId: this.myUserId,
          userName: this.myUserName,
          password: passwordAttempt,
        });
      });

      conn.on('data', (data) => {
        this.handleRawData(data, conn);
      });

      conn.on('close', () => {
        this.connections.delete(hostPeerId);
        this.callbacks.onPeerLeave(hostPeerId);
      });

      conn.on('error', () => {
        // Fallback to host
        if (!connectedToHost) {
          this.initAsHost(cleanCode);
        }
      });

      setTimeout(() => {
        if (!connectedToHost && this.peer === clientPeer) {
          this.initAsHost(cleanCode);
        }
      }, 3500);
    });

    clientPeer.on('error', (err) => {
      if (err.type === 'peer-unavailable' || err.type === 'socket-error') {
        this.initAsHost(cleanCode);
      }
    });
  }

  public initAsHost(cleanCode: string) {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
    }

    const hostPeerId = `inf2-${cleanCode}-host`;
    const hostPeer = new Peer(hostPeerId, PEER_CONFIG);
    this.peer = hostPeer;
    this.isHost = true;

    hostPeer.on('open', () => {
      this.callbacks.onConnectionStatusChange('host');
      this.startHeartbeat();
    });

    hostPeer.on('connection', (conn) => {
      conn.on('open', () => {
        // Connected
      });

      conn.on('data', async (data) => {
        this.handleRawData(data, conn);
      });

      conn.on('close', () => {
        this.connections.delete(conn.peer);
        this.callbacks.onPeerLeave(conn.peer);
      });

      conn.on('error', (err) => {
        console.warn('Host conn warning', err);
      });
    });

    hostPeer.on('error', (err) => {
      console.warn('Host peer warning', err);
    });
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => {
      this.broadcast({ type: 'ping' });
    }, 5000);
  }

  // Handle incoming data, supporting fragmented chunks
  private handleRawData(raw: any, conn: DataConnection) {
    if (!raw) return;

    if (raw.type === 'chunk') {
      const { msgId, chunkIndex, totalChunks, data } = raw;
      let buffer = this.chunkBuffers.get(msgId);
      if (!buffer) {
        buffer = { chunks: new Array(totalChunks), received: 0, total: totalChunks };
        this.chunkBuffers.set(msgId, buffer);
      }

      buffer.chunks[chunkIndex] = data;
      buffer.received++;

      if (buffer.received === buffer.total) {
        const fullJson = buffer.chunks.join('');
        this.chunkBuffers.delete(msgId);
        try {
          const parsed = JSON.parse(fullJson);
          this.processMessage(parsed, conn);
        } catch (e) {
          console.error('Failed to parse reassembled message', e);
        }
      }
      return;
    }

    this.processMessage(raw as NetworkMessage, conn);
  }

  private async processMessage(msg: NetworkMessage, conn: DataConnection) {
    if (msg.type === 'ping') {
      this.sendSafe(conn, { type: 'pong' });
      return;
    }
    if (msg.type === 'pong') {
      return;
    }

    // Host processes join request
    if (this.isHost && msg.type === 'join') {
      const { settings, elements } = this.currentBoardProvider();

      if (settings.isPasswordProtected && settings.passwordHash) {
        if (!msg.password) {
          this.sendSafe(conn, {
            type: 'join_ack',
            success: false,
            error: 'PASSWORD_REQUIRED',
          });
          return;
        }

        const inputHash = await hashPassword(msg.password);
        if (inputHash !== settings.passwordHash) {
          this.sendSafe(conn, {
            type: 'join_ack',
            success: false,
            error: 'INVALID_PASSWORD',
          });
          return;
        }
      }

      this.connections.set(conn.peer, conn);
      this.callbacks.onPeerJoin(conn.peer, msg.userName);

      this.sendSafe(conn, {
        type: 'join_ack',
        success: true,
        board: { elements, settings },
      });
      return;
    }

    switch (msg.type) {
      case 'join_ack': {
        if (!msg.success) {
          if (msg.error === 'PASSWORD_REQUIRED') {
            this.callbacks.onPasswordRequired();
          } else if (msg.error === 'INVALID_PASSWORD') {
            this.callbacks.onPasswordError('Błędne hasło do lobby!');
          }
          return;
        }

        if (msg.board) {
          this.callbacks.onBoardSync(msg.board.elements, msg.board.settings);
        }
        break;
      }

      case 'element_add':
        this.callbacks.onElementAdd(msg.element);
        break;

      case 'element_update':
        this.callbacks.onElementUpdate(msg.element);
        break;

      case 'element_delete':
        this.callbacks.onElementDelete(msg.id);
        break;

      case 'board_sync':
        this.callbacks.onBoardSync(msg.elements, msg.settings);
        break;

      case 'laser_stroke': {
        // Tag with local reception time to eliminate clock skew!
        const now = Date.now();
        const adjustedPoints = msg.points.map((p) => ({ ...p, receivedAt: now }));
        this.callbacks.onLaserStroke(adjustedPoints);
        break;
      }

      case 'cursor_move':
        this.callbacks.onCursorMove(msg.cursor);
        break;

      case 'board_settings_update':
        break;
    }

    // Host forwards message to all other connected peers
    if (this.isHost) {
      this.broadcastExcept(msg, conn.peer);
    }
  }

  // Safe chunked sender: splits large payloads into safe <12KB fragments
  // Uses bufferedAmount check to avoid overflowing DataChannel buffer
  public sendSafe(conn: DataConnection, msg: NetworkMessage) {
    if (!conn || !conn.open) return;

    try {
      const jsonStr = JSON.stringify(msg);

      if (jsonStr.length <= CHUNK_SIZE) {
        // Small message: send directly
        try {
          conn.send(msg);
        } catch (e) {
          console.warn('sendSafe direct send error', e);
          this.handleConnectionError(conn);
        }
      } else {
        // Large message: split into chunks and send with backpressure awareness
        const totalChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);
        const msgId = 'm_' + Math.random().toString(36).substring(2, 9);
        this.sendChunksWithBackpressure(conn, jsonStr, msgId, totalChunks, 0);
      }
    } catch (e) {
      console.warn('sendSafe serialization error', e);
    }
  }

  private sendChunksWithBackpressure(
    conn: DataConnection,
    jsonStr: string,
    msgId: string,
    totalChunks: number,
    startIndex: number
  ) {
    if (!conn.open) return;

    // Check DataChannel buffer (peerjs exposes underlying DataChannel via _dc)
    const dc = (conn as any)._dc as RTCDataChannel | undefined;
    const buffered = dc?.bufferedAmount ?? 0;
    const MAX_BUFFER = 65536; // 64KB threshold

    if (buffered > MAX_BUFFER) {
      // Buffer is full: wait for it to drain before sending more
      setTimeout(() => {
        this.sendChunksWithBackpressure(conn, jsonStr, msgId, totalChunks, startIndex);
      }, 20);
      return;
    }

    // Send next batch of chunks (up to 4 at a time)
    const batchSize = 4;
    let i = startIndex;
    for (; i < Math.min(startIndex + batchSize, totalChunks); i++) {
      if (!conn.open) return;
      const slice = jsonStr.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      try {
        conn.send({
          type: 'chunk',
          msgId,
          chunkIndex: i,
          totalChunks,
          data: slice,
        });
      } catch (e) {
        console.warn('sendSafe chunk send error', e);
        this.handleConnectionError(conn);
        return;
      }
    }

    if (i < totalChunks) {
      // Schedule remaining chunks
      setTimeout(() => {
        this.sendChunksWithBackpressure(conn, jsonStr, msgId, totalChunks, i);
      }, 10);
    }
  }

  private handleConnectionError(conn: DataConnection) {
    // Remove broken connection and notify
    this.connections.delete(conn.peer);
    try { conn.close(); } catch (e) {}
    this.callbacks.onConnectionStatusChange('disconnected');
  }

  public broadcast(msg: NetworkMessage) {
    for (const [, conn] of this.connections) {
      this.sendSafe(conn, msg);
    }
  }

  private broadcastExcept(msg: NetworkMessage, excludePeerId: string) {
    for (const [peerId, conn] of this.connections) {
      if (peerId !== excludePeerId) {
        this.sendSafe(conn, msg);
      }
    }
  }

  public getConnectedCount(): number {
    return this.connections.size + 1;
  }

  public disconnect() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [, conn] of this.connections) {
      try {
        conn.close();
      } catch (e) {}
    }
    this.connections.clear();
    this.chunkBuffers.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }

    this.callbacks.onConnectionStatusChange('disconnected');
  }
}

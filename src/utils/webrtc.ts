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
      // Google Public STUN (błyskawiczne UDP, wysoka dostępność)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Cloudflare Public STUN
      { urls: 'stun:stun.cloudflare.com:3478' },
      // Twilio Global STUN (AWS Europe / USA)
      { urls: 'stun:global.stun.twilio.com:3478' },
      // Nextcloud STUN (port 443 HTTPS & port 3478)
      { urls: 'stun:stun.nextcloud.com:443' },
      { urls: 'stun:stun.nextcloud.com:3478' },
      // Syncthing STUN
      { urls: 'stun:stun.syncthing.net:3478' },
    ],
    iceCandidatePoolSize: 10,
  },
};

const CHUNK_SIZE = 4000; // 4KB per chunk - safely below PeerJS 16KB internal MTU and WebRTC 64KB SCTP limit

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
  private pendingQueue: NetworkMessage[] = [];

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
      this.connectToHost(clientPeer, hostPeerId, cleanCode, passwordAttempt);
    });

    clientPeer.on('error', (err) => {
      if (err.type === 'peer-unavailable' || err.type === 'socket-error') {
        this.initAsHost(cleanCode);
      }
    });
  }

  private connectToHost(
    peer: Peer,
    hostPeerId: string,
    cleanCode: string,
    passwordAttempt?: string
  ) {
    if (this.isHost || !peer || peer.destroyed) return;

    const existingConn = this.connections.get(hostPeerId);
    if (existingConn && existingConn.open) return;

    const conn = peer.connect(hostPeerId, {
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

      this.flushPendingQueue(conn);
    });

    conn.on('data', (data) => {
      this.handleRawData(data, conn);
    });

    conn.on('close', () => {
      this.connections.delete(hostPeerId);
      this.callbacks.onPeerLeave(hostPeerId);
    });

    conn.on('error', (err) => {
      console.warn('Client connection notice:', err);
    });

    setTimeout(() => {
      if (!connectedToHost && this.peer === peer && !peer.destroyed && this.connections.size === 0) {
        this.initAsHost(cleanCode);
      }
    }, 12000);
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
        setTimeout(() => {
          this.chunkBuffers.delete(msgId);
        }, 15000);
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
      this.flushPendingQueue(conn);
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
        this.flushPendingQueue(conn);
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

  // Safe chunked sender: splits large payloads into safe 8KB fragments
  // Checks dataChannel.bufferedAmount to prevent buffer congestion on tablets/mobile
  public sendSafe(conn: DataConnection, msg: NetworkMessage) {
    if (!conn || !conn.open) return;

    try {
      const jsonStr = JSON.stringify(msg);

      if (jsonStr.length <= CHUNK_SIZE) {
        // Small message: send directly
        try {
          conn.send(msg);
        } catch (e) {
          console.warn('sendSafe direct send warning', e);
        }
      } else {
        // Large message: split into 8KB chunks and send one by one with backpressure check
        const totalChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);
        const msgId = 'm_' + Math.random().toString(36).substring(2, 9);
        this.sendSingleChunk(conn, jsonStr, msgId, totalChunks, 0);
      }
    } catch (e) {
      console.warn('sendSafe serialization error', e);
    }
  }

  private sendSingleChunk(
    conn: DataConnection,
    jsonStr: string,
    msgId: string,
    totalChunks: number,
    index: number
  ) {
    if (!conn || !conn.open) return;

    // Check PeerJS underlying RTCDataChannel buffer
    const dc = (conn as any).dataChannel as RTCDataChannel | undefined;
    const buffered = dc?.bufferedAmount ?? 0;
    const MAX_BUFFER = 16384; // 16KB threshold for mobile devices

    if (buffered > MAX_BUFFER) {
      // Buffer is congested: wait 25ms for buffer to clear before sending next chunk
      setTimeout(() => {
        this.sendSingleChunk(conn, jsonStr, msgId, totalChunks, index);
      }, 25);
      return;
    }

    const slice = jsonStr.substring(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    try {
      conn.send({
        type: 'chunk',
        msgId,
        chunkIndex: index,
        totalChunks,
        data: slice,
      });
    } catch (e) {
      console.warn(`sendSafe chunk ${index}/${totalChunks} warning`, e);
      return;
    }

    if (index + 1 < totalChunks) {
      // Send next chunk with 15ms spacing so mobile network stack can dispatch packets cleanly
      setTimeout(() => {
        this.sendSingleChunk(conn, jsonStr, msgId, totalChunks, index + 1);
      }, 15);
    }
  }

  public ensureConnection(roomCode: string) {
    if (!this.peer || this.peer.destroyed) {
      this.connect(roomCode);
      return;
    }
    if (this.peer.disconnected) {
      this.peer.reconnect();
    }
    // Jeśli klient utracił połączenie z hostem (np. powrót z aparatu/galerii na tablecie)
    if (!this.isHost && this.peer && !this.peer.destroyed) {
      const cleanCode = (roomCode || this.roomCode).replace(/[^A-Z0-9]/g, '');
      const hostPeerId = `inf2-${cleanCode}-host`;
      const conn = this.connections.get(hostPeerId);
      if (!conn || !conn.open) {
        this.connectToHost(this.peer, hostPeerId, cleanCode);
      }
    }
  }

  public broadcast(msg: NetworkMessage) {
    let sentCount = 0;
    for (const [, conn] of this.connections) {
      if (conn && conn.open) {
        this.sendSafe(conn, msg);
        sentCount++;
      }
    }

    // Jeśli połączenie jest chwilowo wznawiane (np. powrót z aparatu/galerii Huawei),
    // zakolejkuj element, aby wysłać go natychmiast po re-handshake
    if (
      sentCount === 0 &&
      (msg.type === 'element_add' ||
        msg.type === 'element_update' ||
        msg.type === 'element_delete' ||
        msg.type === 'board_sync')
    ) {
      this.pendingQueue.push(msg);
    }
  }

  private flushPendingQueue(conn: DataConnection) {
    if (this.pendingQueue.length === 0 || !conn || !conn.open) return;
    const queued = [...this.pendingQueue];
    this.pendingQueue = [];
    for (const m of queued) {
      this.sendSafe(conn, m);
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

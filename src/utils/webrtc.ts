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
}

export class BoardNetworkManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private isHost: boolean = false;
  private myUserId: string = '';
  private myUserName: string = 'Użytkownik';
  private callbacks: NetworkCallbacks;
  private currentBoardProvider: () => { elements: CanvasElement[]; settings: BoardSettings };

  constructor(
    callbacks: NetworkCallbacks,
    currentBoardProvider: () => { elements: CanvasElement[]; settings: BoardSettings }
  ) {
    this.callbacks = callbacks;
    this.currentBoardProvider = currentBoardProvider;
    this.myUserId = 'user_' + Math.random().toString(36).substring(2, 9);
  }

  public getUserId(): string {
    return this.myUserId;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  public setUserName(name: string) {
    this.myUserName = name;
  }

  public connect(boardId: string, passwordAttempt?: string) {
    this.disconnect();
    this.callbacks.onConnectionStatusChange('connecting');

    const hostPeerId = `infboard-${boardId}-host`;
    const clientPeer = new Peer(`infboard-${boardId}-${this.myUserId}`, {
      debug: 1,
    });

    this.peer = clientPeer;

    clientPeer.on('open', () => {
      const conn = clientPeer.connect(hostPeerId, {
        reliable: true,
      });

      conn.on('open', () => {
        this.isHost = false;
        this.connections.set(hostPeerId, conn);
        this.callbacks.onConnectionStatusChange('connected');

        const joinMsg: NetworkMessage = {
          type: 'join',
          userId: this.myUserId,
          userName: this.myUserName,
          password: passwordAttempt,
        };
        conn.send(joinMsg);
      });

      conn.on('data', (data) => {
        this.handleMessage(data as NetworkMessage);
      });

      conn.on('close', () => {
        this.connections.delete(hostPeerId);
        this.callbacks.onPeerLeave(hostPeerId);
      });

      conn.on('error', () => {
        this.initAsHost(boardId);
      });
    });

    clientPeer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        this.initAsHost(boardId);
      }
    });
  }

  public initAsHost(boardId: string) {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
    }

    const hostPeerId = `infboard-${boardId}-host`;
    const hostPeer = new Peer(hostPeerId, { debug: 1 });
    this.peer = hostPeer;
    this.isHost = true;

    hostPeer.on('open', () => {
      this.callbacks.onConnectionStatusChange('host');
    });

    hostPeer.on('connection', (conn) => {
      conn.on('open', () => {
        // Ready for join request
      });

      conn.on('data', async (data) => {
        const msg = data as NetworkMessage;
        if (msg.type === 'join') {
          const { settings, elements } = this.currentBoardProvider();

          if (settings.isPasswordProtected && settings.passwordHash) {
            if (!msg.password) {
              conn.send({
                type: 'join_ack',
                success: false,
                error: 'PASSWORD_REQUIRED',
              });
              return;
            }

            const inputHash = await hashPassword(msg.password);
            if (inputHash !== settings.passwordHash) {
              conn.send({
                type: 'join_ack',
                success: false,
                error: 'INVALID_PASSWORD',
              });
              return;
            }
          }

          this.connections.set(conn.peer, conn);
          this.callbacks.onPeerJoin(conn.peer, msg.userName);

          conn.send({
            type: 'join_ack',
            success: true,
            board: { elements, settings },
          });
        } else {
          this.handleMessage(msg);
          this.broadcastExcept(msg, conn.peer);
        }
      });

      conn.on('close', () => {
        this.connections.delete(conn.peer);
        this.callbacks.onPeerLeave(conn.peer);
      });
    });

    hostPeer.on('error', (err) => {
      console.warn('Host peer error', err);
    });
  }

  private handleMessage(msg: NetworkMessage) {
    switch (msg.type) {
      case 'join_ack': {
        if (!msg.success) {
          if (msg.error === 'PASSWORD_REQUIRED') {
            this.callbacks.onPasswordRequired();
          } else if (msg.error === 'INVALID_PASSWORD') {
            this.callbacks.onPasswordError('Błędne hasło do tablicy!');
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

      case 'laser_stroke':
        this.callbacks.onLaserStroke(msg.points);
        break;

      case 'cursor_move':
        this.callbacks.onCursorMove(msg.cursor);
        break;

      case 'board_settings_update':
        break;
    }
  }

  public broadcast(msg: NetworkMessage) {
    for (const [, conn] of this.connections) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  private broadcastExcept(msg: NetworkMessage, excludePeerId: string) {
    for (const [peerId, conn] of this.connections) {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(msg);
      }
    }
  }

  public getConnectedCount(): number {
    return this.connections.size + 1;
  }

  public disconnect() {
    for (const [, conn] of this.connections) {
      try {
        conn.close();
      } catch (e) {}
    }
    this.connections.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }

    this.callbacks.onConnectionStatusChange('disconnected');
  }
}

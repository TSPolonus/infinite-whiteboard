import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
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
  onForceRefreshImages?: () => void;
  onNetworkError?: () => void;
}

interface WireEnvelope {
  senderId: string;
  senderName: string;
  msg: NetworkMessage;
}

// Globalne, bezpieczne brokery WebSocket WSS o najniższym opóźnieniu w Europie (z opcją brokera własnego/lokalnego)
export function getBrokersList(): string[] {
  const custom = typeof window !== 'undefined' ? localStorage.getItem('infinity_custom_broker')?.trim() : null;
  const list: string[] = [];
  if (custom && (custom.startsWith('ws://') || custom.startsWith('wss://'))) {
    list.push(custom);
  }
  list.push(
    'wss://broker.hivemq.com:8884/mqtt', // Frankfurt / Central Europe (~46ms z Gdańska/Warszawy)
    'wss://test.mosquitto.org:8081',     // Eclipse Mosquitto (~48ms z Polski)
    'wss://broker.emqx.io:8084/mqtt'     // EMQX Global Backup
  );
  return list;
}

export class BoardNetworkManager {
  private client: MqttClient | null = null;
  private currentBrokerIndex: number = 0;
  private isHost: boolean = false;
  private myUserId: string = '';
  private myUserName: string = 'Użytkownik';
  private callbacks: NetworkCallbacks;
  private currentBoardProvider: () => { elements: CanvasElement[]; settings: BoardSettings };
  private roomCode: string = '';
  private knownPeers: Map<string, { name: string; lastSeen: number }> = new Map();
  private pendingQueue: NetworkMessage[] = [];
  private heartbeatTimer: number | null = null;
  private cleanupTimer: number | null = null;
  private joinAckTimer: number | null = null;
  private passwordAttempt?: string;
  private hasReceivedJoinAck: boolean = false;

  constructor(
    callbacks: NetworkCallbacks,
    currentBoardProvider: () => { elements: CanvasElement[]; settings: BoardSettings }
  ) {
    this.callbacks = callbacks;
    this.currentBoardProvider = currentBoardProvider;
    this.myUserId = 'u_' + Math.random().toString(36).substring(2, 9);
  }

  public getUserId(): string {
    return this.myUserId;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  public connect(roomCode: string, passwordAttempt?: string) {
    this.roomCode = roomCode.toUpperCase().trim();
    this.passwordAttempt = passwordAttempt;
    this.disconnect();
    this.callbacks.onConnectionStatusChange('connecting');

    const cleanCode = this.roomCode.replace(/[^A-Z0-9]/g, '');
    this.currentBrokerIndex = 0;
    this.initMqttConnection(cleanCode, 0);
  }

  private initMqttConnection(cleanCode: string, brokerIdx: number) {
    const brokers = getBrokersList();
    const brokerUrl = brokers[brokerIdx % brokers.length];
    this.hasReceivedJoinAck = false;

    try {
      const client = mqtt.connect(brokerUrl, {
        clientId: `inf4_${cleanCode}_${this.myUserId}_${Math.random().toString(36).substring(2, 6)}`,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 2500,
        keepalive: 30,
      });

      this.client = client;

      const broadcastTopic = `infdraw/v4/${cleanCode}/broadcast`;
      const directTopic = `infdraw/v4/${cleanCode}/direct/${this.myUserId}`;

      client.on('connect', () => {
        // Subskrybuj kanał wspólny pokoju oraz kanał wiadomości bezpośrednich
        client.subscribe([broadcastTopic, directTopic], { qos: 0 }, (err) => {
          if (err) {
            console.warn('Błąd subskrypcji kanałów MQTT:', err);
            return;
          }

          // Wyślij powitanie i zgłoszenie chęci dołączenia (Join request)
          this.publishToTopic(broadcastTopic, {
            type: 'join',
            userId: this.myUserId,
            userName: this.myUserName,
            password: this.passwordAttempt,
          });

          // Jeśli w ciągu 2.2s nikt nie odpowie (brak istniejących uczestników), stajemy się Hostem
          if (this.joinAckTimer) clearTimeout(this.joinAckTimer);
          this.joinAckTimer = window.setTimeout(() => {
            if (!this.hasReceivedJoinAck) {
              this.isHost = true;
              this.callbacks.onConnectionStatusChange('host');
            }
          }, 2200);

          this.startHeartbeat();
          this.flushPendingQueue();
        });
      });

      client.on('message', (_topic: string, payload: Uint8Array) => {
        try {
          const rawStr = new TextDecoder('utf-8').decode(payload);
          const envelope: WireEnvelope = JSON.parse(rawStr);

          // Ignoruj echo własnych wiadomości
          if (envelope.senderId === this.myUserId) {
            return;
          }

          // Zaktualizuj obecność nadawcy w lobby
          this.updatePeerPresence(envelope.senderId, envelope.senderName);

          // Przetwórz treść komunikatu
          this.handleNetworkMessage(envelope.msg, envelope.senderId);
        } catch (e) {
          console.warn('Błąd parsowania wiadomości sieciowej:', e);
        }
      });

      client.on('error', (err) => {
        console.warn(`MQTT błąd brokera [${brokerUrl}]:`, err);
        const brokers = getBrokersList();
        if (brokerIdx < brokers.length - 1 && this.currentBrokerIndex === brokerIdx) {
          const nextIdx = brokerIdx + 1;
          this.currentBrokerIndex = nextIdx;
          try {
            client.end(true);
          } catch (e) {}
          this.initMqttConnection(cleanCode, nextIdx);
        }
      });

      client.on('close', () => {
        // Połączenie chwilowo zamknięte (np. minimalizacja karty na tablecie)
      });

      client.on('reconnect', () => {
        // Wznowiono połączenie po wyjściu z aparatu/galerii
        this.flushPendingQueue();
      });
    } catch (err) {
      console.error('Nieudana inicjalizacja klienta MQTT:', err);
    }
  }

  private updatePeerPresence(peerId: string, peerName: string) {
    const isNew = !this.knownPeers.has(peerId);
    this.knownPeers.set(peerId, { name: peerName || 'Uczestnik', lastSeen: Date.now() });

    if (isNew) {
      this.callbacks.onPeerJoin(peerId, peerName || 'Uczestnik');
      this.callbacks.onConnectionStatusChange(this.isHost ? 'host' : 'connected');
    }
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    const cleanCode = this.roomCode.replace(/[^A-Z0-9]/g, '');
    const broadcastTopic = `infdraw/v4/${cleanCode}/broadcast`;

    // 1. Regularny Heartbeat co 4 sekundy
    this.heartbeatTimer = window.setInterval(() => {
      this.publishToTopic(broadcastTopic, { type: 'ping' });
    }, 4000);

    // 2. Czyszczenie nieaktywnych uczestników co 2 sekundy (timeout 14s)
    this.cleanupTimer = window.setInterval(() => {
      const now = Date.now();
      for (const [peerId, info] of this.knownPeers) {
        if (now - info.lastSeen > 14000) {
          this.knownPeers.delete(peerId);
          this.callbacks.onPeerLeave(peerId);
        }
      }

      // Jeśli wszyscy opuścili pokój, przejmij rolę Hosta
      if (this.knownPeers.size === 0 && !this.isHost) {
        this.isHost = true;
        this.callbacks.onConnectionStatusChange('host');
      }
    }, 2000);
  }

  private async handleNetworkMessage(msg: NetworkMessage, senderId: string) {
    const cleanCode = this.roomCode.replace(/[^A-Z0-9]/g, '');

    // Nowy uczestnik prosi o dołączenie do lobby
    if (msg.type === 'join') {
      const activePeers = Array.from(this.knownPeers.keys());
      const allIds = [this.myUserId, ...activePeers].sort();

      // Odpowiada Host lub uczestnik z najmniejszym ID, aby uniknąć zdublowanych odpowiedzi
      if (this.isHost || allIds[0] === this.myUserId) {
        const { settings, elements } = this.currentBoardProvider();
        const directTargetTopic = `infdraw/v4/${cleanCode}/direct/${senderId}`;

        // Weryfikacja hasła pokoju
        if (settings.isPasswordProtected && settings.passwordHash) {
          if (!msg.password) {
            this.publishToTopic(directTargetTopic, {
              type: 'join_ack',
              success: false,
              error: 'PASSWORD_REQUIRED',
            });
            return;
          }

          const inputHash = await hashPassword(msg.password);
          if (inputHash !== settings.passwordHash) {
            this.publishToTopic(directTargetTopic, {
              type: 'join_ack',
              success: false,
              error: 'INVALID_PASSWORD',
            });
            return;
          }
        }

        // Pomyślna autoryzacja: odeślij stan tablicy
        this.publishToTopic(directTargetTopic, {
          type: 'join_ack',
          success: true,
          board: { elements, settings },
        });
      }
      return;
    }

    switch (msg.type) {
      case 'join_ack': {
        this.hasReceivedJoinAck = true;
        if (this.joinAckTimer) {
          clearTimeout(this.joinAckTimer);
          this.joinAckTimer = null;
        }

        if (!msg.success) {
          if (msg.error === 'PASSWORD_REQUIRED') {
            this.callbacks.onPasswordRequired();
          } else if (msg.error === 'INVALID_PASSWORD') {
            this.callbacks.onPasswordError('Błędne hasło do lobby!');
          }
          return;
        }

        this.isHost = false;
        this.callbacks.onConnectionStatusChange('connected');

        if (msg.board) {
          this.callbacks.onBoardSync(msg.board.elements, msg.board.settings);
        }
        this.flushPendingQueue();
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
        const now = Date.now();
        const adjustedPoints = msg.points.map((p) => ({ ...p, receivedAt: now }));
        this.callbacks.onLaserStroke(adjustedPoints);
        break;
      }

      case 'cursor_move':
        this.callbacks.onCursorMove(msg.cursor);
        break;

      case 'force_refresh_images':
        this.callbacks.onForceRefreshImages?.();
        break;

      case 'ping':
      case 'pong':
        break;

      case 'board_settings_update':
        break;
    }
  }

  private publishToTopic(topic: string, msg: NetworkMessage) {
    if (!this.client || !this.client.connected) {
      if (
        msg.type === 'element_add' ||
        msg.type === 'element_update' ||
        msg.type === 'element_delete' ||
        msg.type === 'board_sync'
      ) {
        this.pendingQueue.push(msg);
      }
      return;
    }

    const envelope: WireEnvelope = {
      senderId: this.myUserId,
      senderName: this.myUserName,
      msg,
    };

    try {
      const payloadStr = JSON.stringify(envelope);
      this.client.publish(topic, payloadStr, { qos: 0 });
    } catch (err) {
      console.warn('Błąd publikacji wiadomości MQTT:', err);
    }
  }

  public broadcast(msg: NetworkMessage) {
    const cleanCode = this.roomCode.replace(/[^A-Z0-9]/g, '');
    const broadcastTopic = `infdraw/v4/${cleanCode}/broadcast`;
    this.publishToTopic(broadcastTopic, msg);
  }

  private flushPendingQueue() {
    if (this.pendingQueue.length === 0 || !this.client || !this.client.connected) return;
    const queued = [...this.pendingQueue];
    this.pendingQueue = [];
    for (const m of queued) {
      this.broadcast(m);
    }
  }

  public ensureConnection(roomCode: string) {
    const cleanCode = (roomCode || this.roomCode).replace(/[^A-Z0-9]/g, '');
    if (!this.client) {
      this.connect(cleanCode, this.passwordAttempt);
      return;
    }
    if (this.client.disconnected) {
      this.client.reconnect();
    }
    this.flushPendingQueue();
  }

  public getConnectedCount(): number {
    return this.knownPeers.size + 1;
  }

  public disconnect() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.joinAckTimer) {
      clearTimeout(this.joinAckTimer);
      this.joinAckTimer = null;
    }

    this.knownPeers.clear();
    this.pendingQueue = [];

    if (this.client) {
      try {
        this.client.end(true);
      } catch (e) {}
      this.client = null;
    }

    this.callbacks.onConnectionStatusChange('disconnected');
  }
}

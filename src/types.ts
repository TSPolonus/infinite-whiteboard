export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'laser' | 'hand' | 'shape';

export type ShapeType =
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'double_arrow'
  | 'diamond'
  | 'star'
  | 'hexagon'
  | 'heart'
  | 'speech_bubble';

export type EraserMode = 'stroke' | 'brush';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface StrokeElement {
  id: string;
  type: 'stroke';
  tool: 'pen' | 'highlighter';
  points: Point[];
  color: string;
  size: number;
  opacity: number;
  timestamp: number;
  userId?: string;
}

export interface ShapeElement {
  id: string;
  type: 'shape';
  shapeType: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fillColor?: string;
  strokeWidth: number;
  points?: Point[];
  rotation?: number;
  timestamp: number;
  userId?: string;
}

export interface ImageElement {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  aspectRatio: number;
  rotation?: number;
  timestamp: number;
  userId?: string;
}

export type CanvasElement = StrokeElement | ShapeElement | ImageElement;

export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export interface LaserPoint {
  x: number;
  y: number;
  timestamp: number;
  receivedAt?: number;
  color: string;
  size: number;
  duration?: number;
  userId?: string;
}

export interface RemoteCursor {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  lastActive: number;
}

export interface ToolSettings {
  pen: { color: string; size: number };
  highlighter: { color: string; size: number };
  shape: { color: string; size: number };
  laser: { color: string; size: number; duration: number };
  eraser: { mode: EraserMode; size: number };
}

export interface BoardSettings {
  id: string;
  roomCode: string;
  title: string;
  isPasswordProtected: boolean;
  passwordHash?: string;
  backgroundColor: string;
  gridType: 'dots' | 'lines' | 'none';
  gridSize: number;
  palmRejection: boolean;
}

export type NetworkMessage =
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'chunk'; msgId: string; chunkIndex: number; totalChunks: number; data: string }
  | { type: 'join'; userId: string; userName: string; password?: string }
  | { type: 'join_ack'; success: boolean; error?: string; board?: { elements: CanvasElement[]; settings: BoardSettings } }
  | { type: 'element_add'; element: CanvasElement }
  | { type: 'element_update'; element: CanvasElement }
  | { type: 'element_delete'; id: string }
  | { type: 'board_sync'; elements: CanvasElement[]; settings: BoardSettings }
  | { type: 'laser_stroke'; points: LaserPoint[] }
  | { type: 'cursor_move'; cursor: RemoteCursor }
  | { type: 'board_settings_update'; settings: Partial<BoardSettings> };

import React, { useRef, useState, useEffect, useCallback } from 'react';
import type {
  Tool,
  ShapeType,
  CanvasElement,
  StrokeElement,
  ShapeElement,
  ImageElement,
  ViewportTransform,
  Point,
  BoardSettings,
  LaserPoint,
  RemoteCursor,
  ToolSettings,
} from './types';
import {
  screenToWorld,
  drawGrid,
  drawStroke,
  drawShape,
  drawImageElement,
  drawLaserTrails,
  drawSelectionBox,
  drawRemoteCursor,
  isPointInsideElement,
  getElementBBox,
  getHandleAtPoint,
  eraseStrokePixels,
} from './utils/canvasRenderer';
import type { ResizeHandle } from './utils/canvasRenderer';
import { detectShape } from './utils/shapeDetection';
import { BoardNetworkManager, generateRoomCode } from './utils/webrtc';
import { Toolbar } from './components/Toolbar';
import { ShareModal } from './components/ShareModal';
import { SettingsModal } from './components/SettingsModal';
import { PasswordPromptModal } from './components/PasswordPromptModal';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize room code
  const [boardSettings, setBoardSettings] = useState<BoardSettings>(() => {
    const hash = window.location.hash.replace('#room=', '').toUpperCase();
    const code = hash && hash.length >= 3 ? hash : generateRoomCode();
    if (!hash) {
      window.location.hash = `room=${code}`;
    }
    return {
      id: code,
      roomCode: code,
      title: 'Moja Tablica',
      isPasswordProtected: false,
      backgroundColor: '#ffffff', // Podstawowy tryb: biały
      gridType: 'lines',           // Podstawowy tryb: w kratkę
      gridSize: 32,
      palmRejection: true,
    };
  });

  // Individual tool settings (per-tool state)
  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    pen: { color: '#0f172a', size: 3 },
    highlighter: { color: '#facc15', size: 24 },
    shape: { color: '#2563eb', size: 3 },
    laser: { color: '#f43f5e', size: 6, duration: 1200 },
    eraser: { mode: 'brush', size: 28 },
  });

  // Canvas elements state
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [redoStack, setRedoStack] = useState<CanvasElement[][]>([]);

  // Viewport transform
  const [transform, setTransform] = useState<ViewportTransform>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1,
  });

  // Active tools
  const [currentTool, setCurrentTool] = useState<Tool>('pen');
  const [currentShape, setCurrentShape] = useState<ShapeType>('rectangle');
  const [autoShapeEnabled, setAutoShapeEnabled] = useState<boolean>(true);

  // Active interaction states
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [snappedShape, setSnappedShape] = useState<ShapeElement | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [elementInitialPos, setElementInitialPos] = useState<Point | null>(null);
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandle | null>(null);
  const [initialBBox, setInitialBBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [activeRotationAngle, setActiveRotationAngle] = useState<number | null>(null);

  // Tablet Auto-shape hold detection with jitter deadband
  const holdTimerRef = useRef<number | null>(null);
  const lastAnchorRef = useRef<Point | null>(null);

  // Multi-touch gestures
  const activePointers = useRef<Map<number, Point>>(new Map());
  const initialPinchDist = useRef<number | null>(null);
  const initialScale = useRef<number>(1);
  const isSpacePressed = useRef<boolean>(false);
  const isRightClickPanning = useRef<boolean>(false);

  // Laser trails
  const laserTrailsRef = useRef<LaserPoint[]>([]);
  const lastLaserBroadcastRef = useRef<number>(0);

  // Remote collaboration & Lobby
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [connectedCount, setConnectedCount] = useState<number>(1);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'host'>('disconnected');
  const networkManagerRef = useRef<BoardNetworkManager | null>(null);

  // Modals
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<string>('');

  // Image cache
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // History push helper
  const pushToHistory = useCallback((newElements: CanvasElement[]) => {
    setHistory((prev) => [...prev.slice(-30), elements]);
    setRedoStack([]);
    setElements(newElements);
  }, [elements]);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack((prev) => [...prev, elements]);
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setElements(previous);

    networkManagerRef.current?.broadcast({
      type: 'board_sync',
      elements: previous,
      settings: boardSettings,
    });
  }, [history, elements, boardSettings]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory((prev) => [...prev, elements]);
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setElements(next);

    networkManagerRef.current?.broadcast({
      type: 'board_sync',
      elements: next,
      settings: boardSettings,
    });
  }, [redoStack, elements, boardSettings]);

  // Setup Lobby Networking
  const initNetworking = useCallback((code: string, password?: string) => {
    if (networkManagerRef.current) {
      networkManagerRef.current.disconnect();
    }

    const netManager = new BoardNetworkManager(
      {
        onElementAdd: (el) => {
          setElements((prev) => [...prev, el]);
        },
        onElementUpdate: (el) => {
          setElements((prev) => prev.map((e) => (e.id === el.id ? el : e)));
        },
        onElementDelete: (id) => {
          setElements((prev) => prev.filter((e) => e.id !== id));
        },
        onBoardSync: (syncElements, syncSettings) => {
          setElements(syncElements);
          if (syncSettings) setBoardSettings(syncSettings);
          setIsPasswordModalOpen(false);
        },
        onLaserStroke: (points) => {
          laserTrailsRef.current.push(...points);
        },
        onCursorMove: (cursor) => {
          setRemoteCursors((prev) => {
            const next = new Map(prev);
            next.set(cursor.userId, cursor);
            return next;
          });
        },
        onPeerJoin: () => {
          setConnectedCount(netManager.getConnectedCount());
        },
        onPeerLeave: (peerId) => {
          setConnectedCount(netManager.getConnectedCount());
          setRemoteCursors((prev) => {
            const next = new Map(prev);
            for (const [id, c] of next) {
              if (c.userId === peerId) next.delete(id);
            }
            return next;
          });
        },
        onPasswordRequired: () => {
          setIsPasswordModalOpen(true);
          setPasswordErrorMessage('');
        },
        onPasswordError: (msg) => {
          setIsPasswordModalOpen(true);
          setPasswordErrorMessage(msg);
        },
        onConnectionStatusChange: (status) => {
          setConnectionStatus(status);
          setConnectedCount(netManager.getConnectedCount());
        },
      },
      () => ({
        elements,
        settings: boardSettings,
      })
    );

    networkManagerRef.current = netManager;
    netManager.connect(code, password);
  }, [elements, boardSettings]);

  useEffect(() => {
    initNetworking(boardSettings.roomCode);
    return () => {
      networkManagerRef.current?.disconnect();
    };
  }, [boardSettings.roomCode]);

  // Join Room by Code
  const handleJoinRoomByCode = (newCode: string) => {
    const clean = newCode.toUpperCase().trim();
    window.location.hash = `room=${clean}`;
    setBoardSettings((prev) => ({ ...prev, id: clean, roomCode: clean }));
    initNetworking(clean);
    setIsShareModalOpen(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.code === 'Space' && !isSpacePressed.current) {
        isSpacePressed.current = true;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId && !(e.target instanceof HTMLInputElement)) {
          handleDeleteSelected();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressed.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleUndo, handleRedo, selectedElementId]);

  // Image Paste (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.items) {
        for (const item of Array.from(e.clipboardData.items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) handleImageUpload(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [transform]);

  // Resize canvas with DPR
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Stylus & Touch Coordinate Calculation
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { screenPos: { x: e.clientX, y: e.clientY }, worldPos: screenToWorld(e.clientX, e.clientY, transform) };
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY, transform);
    return { screenPos: { x: screenX, y: screenY }, worldPos };
  };

  // Main Render Loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const now = Date.now();

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = boardSettings.backgroundColor;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      // Grid
      const isDark = boardSettings.backgroundColor !== '#ffffff' && boardSettings.backgroundColor !== '#f8fafc';
      drawGrid(
        ctx,
        window.innerWidth,
        window.innerHeight,
        transform,
        boardSettings.gridType,
        boardSettings.gridSize,
        isDark
      );

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.scale, transform.scale);

      // 1. Existing Elements
      for (const el of elements) {
        if (el.type === 'stroke') {
          drawStroke(ctx, el);
        } else if (el.type === 'shape') {
          drawShape(ctx, el);
        } else if (el.type === 'image') {
          drawImageElement(ctx, el, imageCacheRef.current);
        }
      }

      // 2. Active stroke or shape preview
      if (isDrawing && currentStroke.length > 0) {
        if (snappedShape) {
          drawShape(ctx, snappedShape);
        } else if (currentTool === 'shape') {
          const p0 = currentStroke[0];
          const pn = currentStroke[currentStroke.length - 1];
          const tempShape: ShapeElement = {
            id: 'temp_shape',
            type: 'shape',
            shapeType: currentShape,
            x: Math.min(p0.x, pn.x),
            y: Math.min(p0.y, pn.y),
            width: Math.abs(pn.x - p0.x),
            height: Math.abs(pn.y - p0.y),
            color: toolSettings.shape.color,
            strokeWidth: toolSettings.shape.size,
            points: currentShape === 'line' || currentShape === 'arrow' || currentShape === 'double_arrow' ? [p0, pn] : undefined,
            timestamp: now,
          };
          drawShape(ctx, tempShape);
        } else if (currentTool === 'pen' || currentTool === 'highlighter') {
          const activeColor = currentTool === 'pen' ? toolSettings.pen.color : toolSettings.highlighter.color;
          const activeSize = currentTool === 'pen' ? toolSettings.pen.size : toolSettings.highlighter.size;
          const tempStroke: StrokeElement = {
            id: 'temp',
            type: 'stroke',
            tool: currentTool,
            points: currentStroke,
            color: activeColor,
            size: activeSize,
            opacity: currentTool === 'highlighter' ? 0.40 : 1,
            timestamp: now,
          };
          drawStroke(ctx, tempStroke);
        } else if (currentTool === 'eraser' && toolSettings.eraser.mode === 'brush') {
          // Live drawing eraser preview stroke
          const lastP = currentStroke[currentStroke.length - 1];
          ctx.save();
          ctx.beginPath();
          ctx.arc(lastP.x, lastP.y, toolSettings.eraser.size, 0, Math.PI * 2);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5 / transform.scale;
          ctx.setLineDash([3 / transform.scale, 3 / transform.scale]);
          ctx.stroke();
          ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
          ctx.fill();
          ctx.restore();
        }
      }

      // 3. Laser trails
      const maxLaserLifetime = toolSettings.laser.duration || 1500;
      laserTrailsRef.current = laserTrailsRef.current.filter((p) => now - p.timestamp < (p.duration || maxLaserLifetime));
      drawLaserTrails(ctx, laserTrailsRef.current, now);

      // 4. Selection box & handles
      if (selectedElementId) {
        const selected = elements.find((e) => e.id === selectedElementId);
        if (selected) {
          drawSelectionBox(ctx, selected, transform);
        }
      }

      // 5. Remote Cursors
      for (const [, cursor] of remoteCursors) {
        if (now - cursor.lastActive < 10000) {
          drawRemoteCursor(ctx, cursor);
        }
      }

      ctx.restore();
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    elements,
    transform,
    boardSettings,
    toolSettings,
    isDrawing,
    currentStroke,
    snappedShape,
    currentTool,
    currentShape,
    selectedElementId,
    remoteCursors,
  ]);

  // Pointer Down Handler
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}

    const { screenPos, worldPos } = getCanvasPoint(e);
    activePointers.current.set(e.pointerId, screenPos);

    // 1. Right Click Panning on PC
    if (e.button === 2) {
      isRightClickPanning.current = true;
      setDragStart(screenPos);
      return;
    }

    // 2. Multi-touch gesture (Pinch-to-zoom / Two-finger pan)
    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      initialPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialScale.current = transform.scale;
      setIsDrawing(false);
      setCurrentStroke([]);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      return;
    }

    if (activePointers.current.size > 2) return;

    // 3. PALM REJECTION MODE:
    if (boardSettings.palmRejection && e.pointerType === 'touch') {
      setDragStart(screenPos);
      return;
    }

    // 4. Hand tool or Spacebar pan
    if (isSpacePressed.current || currentTool === 'hand' || e.button === 1) {
      setDragStart(screenPos);
      return;
    }

    // 5. Select Tool: Check resize/rotation handles first, then element hit
    if (currentTool === 'select') {
      if (selectedElementId) {
        const selected = elements.find((el) => el.id === selectedElementId);
        if (selected) {
          const handle = getHandleAtPoint(worldPos, selected, transform);
          if (handle) {
            setActiveResizeHandle(handle);
            setDragStart(worldPos);
            const bbox = getElementBBox(selected);
            if (bbox) {
              setInitialBBox({
                x: bbox.minX,
                y: bbox.minY,
                width: bbox.maxX - bbox.minX,
                height: bbox.maxY - bbox.minY,
              });
            }
            return;
          }
        }
      }

      const hit = elements.slice().reverse().find((el) => isPointInsideElement(worldPos, el));
      if (hit) {
        setSelectedElementId(hit.id);
        setDragStart(worldPos);
        setElementInitialPos({ x: (hit as any).x || 0, y: (hit as any).y || 0 });
      } else {
        setSelectedElementId(null);
        setActiveResizeHandle(null);
      }
      return;
    }

    // 6. Eraser Tool: object vs brush erase
    if (currentTool === 'eraser') {
      if (toolSettings.eraser.mode === 'stroke') {
        const hit = elements.slice().reverse().find((el) => isPointInsideElement(worldPos, el));
        if (hit) {
          const next = elements.filter((el) => el.id !== hit.id);
          pushToHistory(next);
          networkManagerRef.current?.broadcast({ type: 'element_delete', id: hit.id });
        }
      } else {
        setIsDrawing(true);
        setCurrentStroke([worldPos]);
        applyPixelEraser(worldPos);
      }
      return;
    }

    // 7. Laser Pointer Tool
    if (currentTool === 'laser') {
      setIsDrawing(true);
      const lp: LaserPoint = {
        x: worldPos.x,
        y: worldPos.y,
        timestamp: Date.now(),
        color: toolSettings.laser.color,
        size: toolSettings.laser.size,
        duration: toolSettings.laser.duration,
      };
      laserTrailsRef.current.push(lp);
      networkManagerRef.current?.broadcast({ type: 'laser_stroke', points: [lp] });
      return;
    }

    // 8. Drawing Tools (Pen, Highlighter, Shape)
    setIsDrawing(true);
    setCurrentStroke([worldPos]);
    setSnappedShape(null);
    lastAnchorRef.current = worldPos;

    // Start auto-shape hold timer
    if (autoShapeEnabled && (currentTool === 'pen' || currentTool === 'highlighter')) {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      holdTimerRef.current = window.setTimeout(() => {
        triggerAutoShapeSnap();
      }, 400);
    }
  };

  // Pointer Move Handler
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { screenPos, worldPos } = getCanvasPoint(e);

    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, screenPos);
    }

    // Broadcast cursor position
    const now = Date.now();
    if (now - lastLaserBroadcastRef.current > 60) {
      lastLaserBroadcastRef.current = now;
      networkManagerRef.current?.broadcast({
        type: 'cursor_move',
        cursor: {
          userId: networkManagerRef.current?.getUserId() || 'me',
          userName: 'Użytkownik',
          color: toolSettings.pen.color,
          x: worldPos.x,
          y: worldPos.y,
          lastActive: now,
        },
      });
    }

    // Right Mouse Button Panning
    if (isRightClickPanning.current && dragStart) {
      const dx = screenPos.x - dragStart.x;
      const dy = screenPos.y - dragStart.y;
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setDragStart(screenPos);
      return;
    }

    // Multi-touch pinch & pan
    if (activePointers.current.size === 2 && initialPinchDist.current !== null) {
      const pts = Array.from(activePointers.current.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const factor = currentDist / initialPinchDist.current;
      const newScale = Math.min(6, Math.max(0.12, initialScale.current * factor));

      const centerScreen = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };

      setTransform((prev) => ({
        scale: newScale,
        x: centerScreen.x - (centerScreen.x - prev.x) * (newScale / prev.scale),
        y: centerScreen.y - (centerScreen.y - prev.y) * (newScale / prev.scale),
      }));
      return;
    }

    // Palm rejection or Hand tool drag
    if (dragStart && ((boardSettings.palmRejection && e.pointerType === 'touch') || isSpacePressed.current || currentTool === 'hand' || e.buttons === 4)) {
      const dx = screenPos.x - dragStart.x;
      const dy = screenPos.y - dragStart.y;
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setDragStart(screenPos);
      return;
    }

    // Rescaling / Free Rotating selected element
    if (currentTool === 'select' && selectedElementId && activeResizeHandle && dragStart && initialBBox) {
      const dx = worldPos.x - dragStart.x;
      const dy = worldPos.y - dragStart.y;

      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== selectedElementId) return el;

          // Free rotation by ANY angle!
          if (activeResizeHandle === 'rotate') {
            const cx = initialBBox.x + initialBBox.width / 2;
            const cy = initialBBox.y + initialBBox.height / 2;
            const rad = Math.atan2(worldPos.y - cy, worldPos.x - cx);
            let deg = Math.round((rad * 180) / Math.PI + 90);
            if (deg < 0) deg += 360;
            setActiveRotationAngle(deg);
            return { ...el, rotation: deg };
          }

          if (el.type === 'shape' || el.type === 'image') {
            let newX = initialBBox.x;
            let newY = initialBBox.y;
            let newW = initialBBox.width;
            let newH = initialBBox.height;

            if (activeResizeHandle.includes('r')) newW = Math.max(20, initialBBox.width + dx);
            if (activeResizeHandle.includes('b')) newH = Math.max(20, initialBBox.height + dy);
            if (activeResizeHandle.includes('l')) {
              const proposedW = initialBBox.width - dx;
              if (proposedW > 20) {
                newX = initialBBox.x + dx;
                newW = proposedW;
              }
            }
            if (activeResizeHandle.includes('t')) {
              const proposedH = initialBBox.height - dy;
              if (proposedH > 20) {
                newY = initialBBox.y + dy;
                newH = proposedH;
              }
            }

            return { ...el, x: newX, y: newY, width: newW, height: newH };
          }
          return el;
        })
      );
      return;
    }

    // Move selected element
    if (currentTool === 'select' && selectedElementId && dragStart && elementInitialPos && !activeResizeHandle) {
      const dx = worldPos.x - dragStart.x;
      const dy = worldPos.y - dragStart.y;

      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== selectedElementId) return el;
          if (el.type === 'shape' || el.type === 'image') {
            return {
              ...el,
              x: elementInitialPos.x + dx,
              y: elementInitialPos.y + dy,
            };
          } else if (el.type === 'stroke') {
            return {
              ...el,
              points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            };
          }
          return el;
        })
      );
      return;
    }

    // Eraser on drag (Brush Mode)
    if (currentTool === 'eraser' && (e.buttons === 1 || e.pointerType === 'pen' || isDrawing)) {
      if (toolSettings.eraser.mode === 'stroke') {
        const hit = elements.slice().reverse().find((el) => isPointInsideElement(worldPos, el));
        if (hit) {
          const next = elements.filter((el) => el.id !== hit.id);
          pushToHistory(next);
          networkManagerRef.current?.broadcast({ type: 'element_delete', id: hit.id });
        }
      } else {
        setCurrentStroke((prev) => [...prev, worldPos]);
        applyPixelEraser(worldPos);
      }
      return;
    }

    // Laser pointer drag
    if (currentTool === 'laser' && isDrawing) {
      const lp: LaserPoint = {
        x: worldPos.x,
        y: worldPos.y,
        timestamp: Date.now(),
        color: toolSettings.laser.color,
        size: toolSettings.laser.size,
        duration: toolSettings.laser.duration,
      };
      laserTrailsRef.current.push(lp);
      networkManagerRef.current?.broadcast({ type: 'laser_stroke', points: [lp] });
      return;
    }

    // Freehand stroke / shape drawing
    if (isDrawing) {
      setCurrentStroke((prev) => [...prev, worldPos]);

      // Tablet-friendly Auto-shape hold detection:
      if (autoShapeEnabled && (currentTool === 'pen' || currentTool === 'highlighter')) {
        if (lastAnchorRef.current) {
          const distFromAnchor = Math.hypot(worldPos.x - lastAnchorRef.current.x, worldPos.y - lastAnchorRef.current.y);
          if (distFromAnchor > 16) {
            lastAnchorRef.current = worldPos;
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
            holdTimerRef.current = window.setTimeout(() => {
              triggerAutoShapeSnap();
            }, 400);
          }
        } else {
          lastAnchorRef.current = worldPos;
        }
      }
    }
  };

  // Brush Eraser logic (Continuous vector path trimming)
  const applyPixelEraser = (erasePoint: Point) => {
    const eraserRadius = toolSettings.eraser.size;
    let changed = false;
    let nextElements: CanvasElement[] = [];

    for (const el of elements) {
      if (el.type === 'stroke') {
        const result = eraseStrokePixels(el, erasePoint, eraserRadius);
        if (result.length !== 1 || result[0].points.length !== el.points.length) {
          changed = true;
          nextElements.push(...result);
        } else {
          nextElements.push(el);
        }
      } else {
        if (isPointInsideElement(erasePoint, el)) {
          changed = true;
        } else {
          nextElements.push(el);
        }
      }
    }

    if (changed) {
      setElements(nextElements);
    }
  };

  // Auto Shape Detection
  const triggerAutoShapeSnap = () => {
    setCurrentStroke((latestPoints) => {
      if (latestPoints.length < 5) return latestPoints;
      const detected = detectShape(latestPoints);
      if (detected) {
        const activeColor = currentTool === 'pen' ? toolSettings.pen.color : toolSettings.highlighter.color;
        const activeSize = currentTool === 'pen' ? toolSettings.pen.size : toolSettings.highlighter.size;
        const shapeEl: ShapeElement = {
          id: 'shape_' + Math.random().toString(36).substring(2, 9),
          type: 'shape',
          shapeType: detected.shapeType,
          x: detected.x,
          y: detected.y,
          width: detected.width,
          height: detected.height,
          points: detected.points,
          color: activeColor,
          strokeWidth: activeSize,
          timestamp: Date.now(),
        };
        setSnappedShape(shapeEl);
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(35);
          }
        } catch (e) {}
      }
      return latestPoints;
    });
  };

  // Pointer Up Handler
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}

    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      initialPinchDist.current = null;
    }

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    lastAnchorRef.current = null;

    if (isRightClickPanning.current) {
      isRightClickPanning.current = false;
      setDragStart(null);
      return;
    }

    setDragStart(null);
    setElementInitialPos(null);
    setActiveResizeHandle(null);
    setInitialBBox(null);
    setActiveRotationAngle(null);

    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentTool === 'eraser') {
      setCurrentStroke([]);
      pushToHistory(elements);
      networkManagerRef.current?.broadcast({
        type: 'board_sync',
        elements: elements,
        settings: boardSettings,
      });
      return;
    }

    if (snappedShape) {
      pushToHistory([...elements, snappedShape]);
      networkManagerRef.current?.broadcast({ type: 'element_add', element: snappedShape });
      setSnappedShape(null);
      setCurrentStroke([]);
      return;
    }

    if (currentTool === 'shape' && currentStroke.length >= 2) {
      const p0 = currentStroke[0];
      const pn = currentStroke[currentStroke.length - 1];
      const newShape: ShapeElement = {
        id: 'shape_' + Math.random().toString(36).substring(2, 9),
        type: 'shape',
        shapeType: currentShape,
        x: Math.min(p0.x, pn.x),
        y: Math.min(p0.y, pn.y),
        width: Math.abs(pn.x - p0.x),
        height: Math.abs(pn.y - p0.y),
        points: currentShape === 'line' || currentShape === 'arrow' || currentShape === 'double_arrow' ? [p0, pn] : undefined,
        color: toolSettings.shape.color,
        strokeWidth: toolSettings.shape.size,
        timestamp: Date.now(),
      };
      pushToHistory([...elements, newShape]);
      networkManagerRef.current?.broadcast({ type: 'element_add', element: newShape });
      setCurrentStroke([]);
      return;
    }

    if ((currentTool === 'pen' || currentTool === 'highlighter') && currentStroke.length > 0) {
      const activeColor = currentTool === 'pen' ? toolSettings.pen.color : toolSettings.highlighter.color;
      const activeSize = currentTool === 'pen' ? toolSettings.pen.size : toolSettings.highlighter.size;
      const newStroke: StrokeElement = {
        id: 'stroke_' + Math.random().toString(36).substring(2, 9),
        type: 'stroke',
        tool: currentTool,
        points: currentStroke,
        color: activeColor,
        size: activeSize,
        opacity: currentTool === 'highlighter' ? 0.40 : 1,
        timestamp: Date.now(),
      };
      pushToHistory([...elements, newStroke]);
      networkManagerRef.current?.broadcast({ type: 'element_add', element: newStroke });
      setCurrentStroke([]);
    }
  };

  // PC Wheel Zoom (Towards mouse cursor)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.min(6, Math.max(0.12, transform.scale * zoomFactor));

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    setTransform((prev) => ({
      scale: newScale,
      x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
      y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
    }));
  };

  // Zoom control buttons
  const handleZoomIn = () => {
    setTransform((prev) => {
      const newScale = Math.min(6, prev.scale * 1.25);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      return {
        scale: newScale,
        x: cx - (cx - prev.x) * (newScale / prev.scale),
        y: cy - (cy - prev.y) * (newScale / prev.scale),
      };
    });
  };

  const handleZoomOut = () => {
    setTransform((prev) => {
      const newScale = Math.max(0.12, prev.scale * 0.8);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      return {
        scale: newScale,
        x: cx - (cx - prev.x) * (newScale / prev.scale),
        y: cy - (cy - prev.y) * (newScale / prev.scale),
      };
    });
  };

  const handleResetZoom = () => {
    setTransform({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      scale: 1,
    });
  };

  // Transformation actions
  const handleDuplicateSelected = () => {
    if (!selectedElementId) return;
    const target = elements.find((el) => el.id === selectedElementId);
    if (!target) return;

    const offset = 30;
    let cloned: CanvasElement;

    if (target.type === 'shape') {
      cloned = {
        ...target,
        id: 'shape_' + Math.random().toString(36).substring(2, 9),
        x: target.x + offset,
        y: target.y + offset,
      };
    } else if (target.type === 'image') {
      cloned = {
        ...target,
        id: 'img_' + Math.random().toString(36).substring(2, 9),
        x: target.x + offset,
        y: target.y + offset,
      };
      if (imageCacheRef.current.has(target.id)) {
        imageCacheRef.current.set(cloned.id, imageCacheRef.current.get(target.id)!);
      }
    } else {
      cloned = {
        ...target,
        id: 'stroke_' + Math.random().toString(36).substring(2, 9),
        points: target.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
      };
    }

    pushToHistory([...elements, cloned]);
    setSelectedElementId(cloned.id);
  };

  const handleRotateSelected = () => {
    if (!selectedElementId) return;
    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== selectedElementId) return el;
        const currentRot = (el as any).rotation || 0;
        return { ...el, rotation: (currentRot + 90) % 360 };
      })
    );
  };

  const handleDeleteSelected = () => {
    if (!selectedElementId) return;
    const next = elements.filter((el) => el.id !== selectedElementId);
    pushToHistory(next);
    setSelectedElementId(null);
    networkManagerRef.current?.broadcast({ type: 'element_delete', id: selectedElementId });
  };

  const handleBringToFront = () => {
    if (!selectedElementId) return;
    const target = elements.find((el) => el.id === selectedElementId);
    if (!target) return;
    const next = [...elements.filter((el) => el.id !== selectedElementId), target];
    pushToHistory(next);
  };

  const handleSendToBack = () => {
    if (!selectedElementId) return;
    const target = elements.find((el) => el.id === selectedElementId);
    if (!target) return;
    const next = [target, ...elements.filter((el) => el.id !== selectedElementId)];
    pushToHistory(next);
  };

  // Image insertion with automatic compression to keep WebRTC fast & reliable!
  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Compress & scale to max 800px for instant WebRTC sync
        const maxDimension = 800;
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }

        const compCanvas = document.createElement('canvas');
        compCanvas.width = width;
        compCanvas.height = height;
        const compCtx = compCanvas.getContext('2d');
        if (compCtx) {
          compCtx.drawImage(img, 0, 0, width, height);
        }
        const compressedSrc = compCanvas.toDataURL('image/jpeg', 0.82);

        const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, transform);
        const displayW = Math.min(360, width);
        const displayH = Math.round((displayW / width) * height);

        const imgElement: ImageElement = {
          id: 'img_' + Math.random().toString(36).substring(2, 9),
          type: 'image',
          x: center.x - displayW / 2,
          y: center.y - displayH / 2,
          width: displayW,
          height: displayH,
          src: compressedSrc,
          aspectRatio: width / height,
          rotation: 0,
          timestamp: Date.now(),
        };

        const cached = new Image();
        cached.src = compressedSrc;
        imageCacheRef.current.set(imgElement.id, cached);

        pushToHistory([...elements, imgElement]);
        setSelectedElementId(imgElement.id);
        networkManagerRef.current?.broadcast({ type: 'element_add', element: imgElement });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleClearCanvas = () => {
    if (elements.length === 0) return;
    if (confirm('Czy na pewno chcesz wyczyścić całą tablicę?')) {
      pushToHistory([]);
      setSelectedElementId(null);
      networkManagerRef.current?.broadcast({
        type: 'board_sync',
        elements: [],
        settings: boardSettings,
      });
    }
  };

  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${boardSettings.title || 'tablica'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleExportSVG = () => {
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${window.innerWidth}" height="${window.innerHeight}">\n`;
    svgContent += `<rect width="100%" height="100%" fill="${boardSettings.backgroundColor}" />\n`;
    svgContent += `<g transform="translate(${transform.x}, ${transform.y}) scale(${transform.scale})">\n`;

    for (const el of elements) {
      if (el.type === 'stroke') {
        const d = el.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        svgContent += `<path d="${d}" fill="none" stroke="${el.color}" stroke-width="${el.size}" stroke-linecap="round" stroke-linejoin="round" opacity="${el.opacity || 1}" />\n`;
      } else if (el.type === 'shape') {
        if (el.shapeType === 'rectangle') {
          svgContent += `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="none" stroke="${el.color}" stroke-width="${el.strokeWidth}" />\n`;
        } else if (el.shapeType === 'circle') {
          svgContent += `<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="none" stroke="${el.color}" stroke-width="${el.strokeWidth}" />\n`;
        }
      }
    }

    svgContent += `</g>\n</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${boardSettings.title || 'tablica'}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = {
      version: 2,
      settings: boardSettings,
      elements: elements,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${boardSettings.title || 'tablica'}-projekt.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (importedElements: CanvasElement[]) => {
    pushToHistory(importedElements);
    networkManagerRef.current?.broadcast({
      type: 'board_sync',
      elements: importedElements,
      settings: boardSettings,
    });
  };

  const handlePasswordSubmit = (password: string) => {
    networkManagerRef.current?.connect(boardSettings.roomCode, password);
  };

  const updateToolSetting = <T extends keyof ToolSettings>(tool: T, settings: Partial<ToolSettings[T]>) => {
    setToolSettings((prev) => ({
      ...prev,
      [tool]: {
        ...prev[tool],
        ...settings,
      },
    }));
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'relative', width: '100vw', height: '100dvh', overflow: 'hidden' }}
    >
      <canvas
        ref={canvasRef}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor:
            isRightClickPanning.current || currentTool === 'hand' || isSpacePressed.current
              ? 'grab'
              : activeResizeHandle
              ? 'crosshair'
              : currentTool === 'laser'
              ? 'crosshair'
              : currentTool === 'eraser'
              ? 'crosshair'
              : 'crosshair',
          touchAction: 'none',
        }}
      />

      {/* Rotation Angle Tooltip */}
      {activeRotationAngle !== null && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 14px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            color: '#38bdf8',
            zIndex: 50,
          }}
        >
          Kąt obrotu: {activeRotationAngle}°
        </div>
      )}

      <Toolbar
        currentTool={currentTool}
        currentShape={currentShape}
        toolSettings={toolSettings}
        autoShapeEnabled={autoShapeEnabled}
        scale={transform.scale}
        canUndo={history.length > 0}
        canRedo={redoStack.length > 0}
        boardSettings={boardSettings}
        connectedCount={connectedCount}
        selectedElementId={selectedElementId}
        onToolChange={setCurrentTool}
        onShapeChange={setCurrentShape}
        onUpdateToolSetting={updateToolSetting}
        onToggleAutoShape={() => setAutoShapeEnabled((prev) => !prev)}
        onTogglePalmRejection={() =>
          setBoardSettings((prev) => ({ ...prev, palmRejection: !prev.palmRejection }))
        }
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onImageUpload={handleImageUpload}
        onClearCanvas={handleClearCanvas}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onDuplicateSelected={handleDuplicateSelected}
        onRotateSelected={handleRotateSelected}
        onDeleteSelected={handleDeleteSelected}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        boardSettings={boardSettings}
        onUpdateSettings={(newSettings) => {
          setBoardSettings((prev) => ({ ...prev, ...newSettings }));
          networkManagerRef.current?.broadcast({
            type: 'board_settings_update',
            settings: newSettings,
          });
        }}
        connectedCount={connectedCount}
        connectionStatus={connectionStatus}
        onJoinRoomByCode={handleJoinRoomByCode}
        onReconnect={() => initNetworking(boardSettings.roomCode)}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        boardSettings={boardSettings}
        onUpdateSettings={(newSettings) => setBoardSettings((prev) => ({ ...prev, ...newSettings }))}
        onExportPNG={handleExportPNG}
        onExportSVG={handleExportSVG}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportJSON}
      />

      <PasswordPromptModal
        isOpen={isPasswordModalOpen}
        errorMessage={passwordErrorMessage}
        onSubmit={handlePasswordSubmit}
      />
    </div>
  );
};

export default App;

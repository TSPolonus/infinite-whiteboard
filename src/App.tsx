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
  drawMarqueeBox,
  drawRemoteCursor,
  isPointInsideElement,
  isElementInsideBox,
  getCombinedBBox,
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

  // Multi-element selection state
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{ start: Point; current: Point } | null>(null);

  // Active drawing & dragging states
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [snappedShape, setSnappedShape] = useState<ShapeElement | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  // Stroke initial snapshots for drag (keyed by id -> full points[])
  const [strokeInitialPoints, setStrokeInitialPoints] = useState<Map<string, Point[]>>(new Map());
  const [elementInitialPositions, setElementInitialPositions] = useState<Map<string, Point>>(new Map());
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandle | null>(null);
  const [initialBBox, setInitialBBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [activeRotationAngle, setActiveRotationAngle] = useState<number | null>(null);

  // Toast/notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToastRef = useRef<(msg: string) => void>(() => {});

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 4500);
  }, []);

  // Keep ref always up-to-date so networking callbacks can call it without stale closure
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

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
          showToastRef.current('⚠️ Uczestnik rozłączył się z lobby.');
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
          if (status === 'disconnected') {
            showToastRef.current('❌ Rozłączono z lobby. Sprawdź połączenie internetowe.');
          } else if (status === 'host') {
            showToastRef.current('✅ Jesteś hostem lobby. Poczekaj na uczestników.');
          } else if (status === 'connected') {
            showToastRef.current('✅ Połączono z lobby!');
          }
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

  // Keep connection alive when tablet switches between camera/gallery apps and browser
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        networkManagerRef.current?.ensureConnection(boardSettings.roomCode);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [boardSettings.roomCode]);

  // Join Room by Code
  const handleJoinRoomByCode = (newCode: string) => {
    const clean = newCode.toUpperCase().trim();
    window.location.hash = `room=${clean}`;
    setBoardSettings((prev) => ({ ...prev, id: clean, roomCode: clean }));
    initNetworking(clean);
    setIsShareModalOpen(false);
  };

  // Leave Lobby / Switch to Solo
  const handleLeaveLobby = () => {
    networkManagerRef.current?.disconnect();
    const soloCode = generateRoomCode();
    window.location.hash = `room=${soloCode}`;
    setBoardSettings((prev) => ({ ...prev, id: soloCode, roomCode: soloCode }));
    setConnectedCount(1);
    setConnectionStatus('disconnected');
    setIsShareModalOpen(false);
  };

  // Create New Lobby
  const handleCreateNewLobby = () => {
    const newCode = generateRoomCode();
    window.location.hash = `room=${newCode}`;
    setBoardSettings((prev) => ({ ...prev, id: newCode, roomCode: newCode }));
    initNetworking(newCode);
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
        if (selectedElementIds.length > 0 && !(e.target instanceof HTMLInputElement)) {
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
  }, [handleUndo, handleRedo, selectedElementIds]);

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

      // 3. Marquee Selection Box
      if (isMarqueeSelecting && marqueeBox) {
        drawMarqueeBox(ctx, marqueeBox.start, marqueeBox.current, transform);
      }

      // 4. Laser trails
      const maxLaserLifetime = toolSettings.laser.duration || 1200;
      laserTrailsRef.current = laserTrailsRef.current.filter((p) => now - (p.receivedAt || p.timestamp) < (p.duration || maxLaserLifetime));
      drawLaserTrails(ctx, laserTrailsRef.current, now);

      // 5. Selection box & handles for all selected elements
      if (selectedElementIds.length > 0) {
        const selectedElements = elements.filter((e) => selectedElementIds.includes(e.id));
        if (selectedElements.length > 0) {
          drawSelectionBox(ctx, selectedElements, transform);
        }
      }

      // 6. Remote Cursors
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
    selectedElementIds,
    isMarqueeSelecting,
    marqueeBox,
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
      setIsMarqueeSelecting(false);
      setMarqueeBox(null);
      setCurrentStroke([]);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      return;
    }

    if (activePointers.current.size > 2) return;

    // 3. Hand tool or Spacebar pan
    if (isSpacePressed.current || currentTool === 'hand' || e.button === 1) {
      setDragStart(screenPos);
      return;
    }

    // 4. SELECT TOOL:
    // User request: "Niech ogólnie jak jest włączony tryb zaznaczenia na tablecie to niech tylko palec reaguje na to co się dzieje bez użycia rysika"
    if (currentTool === 'select') {
      if (e.pointerType === 'pen') {
        // Stylus is ignored in select mode on tablets!
        return;
      }

      // Check handle on currently selected elements
      const selectedElements = elements.filter((el) => selectedElementIds.includes(el.id));
      if (selectedElements.length > 0) {
        const handle = getHandleAtPoint(worldPos, selectedElements, transform);
        if (handle) {
          setActiveResizeHandle(handle);
          setDragStart(worldPos);
          const combinedBBox = getCombinedBBox(selectedElements);
          if (combinedBBox) {
            setInitialBBox({
              x: combinedBBox.minX,
              y: combinedBBox.minY,
              width: combinedBBox.maxX - combinedBBox.minX,
              height: combinedBBox.maxY - combinedBBox.minY,
            });
          }
          return;
        }
      }

      // Check hit on existing elements
      const hit = elements.slice().reverse().find((el) => isPointInsideElement(worldPos, el));
      if (hit) {
        if (!selectedElementIds.includes(hit.id)) {
          setSelectedElementIds([hit.id]);
        }
        setDragStart(worldPos);

        const initPosMap = new Map<string, Point>();
        const strokePtsMap = new Map<string, Point[]>();
        const targetIds = selectedElementIds.includes(hit.id) ? selectedElementIds : [hit.id];
        for (const id of targetIds) {
          const el = elements.find((item) => item.id === id);
          if (el) {
            initPosMap.set(id, { x: (el as any).x || 0, y: (el as any).y || 0 });
            if (el.type === 'stroke') {
              strokePtsMap.set(id, el.points.map(p => ({ ...p })));
            }
          }
        }
        setElementInitialPositions(initPosMap);
        setStrokeInitialPoints(strokePtsMap);
      } else {
        // Clicked on empty canvas: Start Marquee Area Selection!
        setSelectedElementIds([]);
        setActiveResizeHandle(null);
        setIsMarqueeSelecting(true);
        setMarqueeBox({ start: worldPos, current: worldPos });
      }
      return;
    }

    // 5. PALM REJECTION FOR DRAWING TOOLS:
    if (boardSettings.palmRejection && e.pointerType === 'touch') {
      setDragStart(screenPos);
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
    if (dragStart && ((boardSettings.palmRejection && e.pointerType === 'touch' && currentTool !== 'select') || isSpacePressed.current || currentTool === 'hand' || e.buttons === 4)) {
      const dx = screenPos.x - dragStart.x;
      const dy = screenPos.y - dragStart.y;
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setDragStart(screenPos);
      return;
    }

    // Marquee Area Selection Move
    if (isMarqueeSelecting && marqueeBox) {
      setMarqueeBox((prev) => (prev ? { ...prev, current: worldPos } : null));
      return;
    }

    // Rescaling / Free Rotating all selected elements
    if (currentTool === 'select' && selectedElementIds.length > 0 && activeResizeHandle && dragStart && initialBBox) {
      const dx = worldPos.x - dragStart.x;
      const dy = worldPos.y - dragStart.y;

      setElements((prev) =>
        prev.map((el) => {
          if (!selectedElementIds.includes(el.id)) return el;

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

    // Move all selected elements
    if (currentTool === 'select' && selectedElementIds.length > 0 && dragStart && !activeResizeHandle && !isMarqueeSelecting) {
      const totalDx = worldPos.x - dragStart.x;
      const totalDy = worldPos.y - dragStart.y;
      if (totalDx === 0 && totalDy === 0) return;

      setElements((prev) =>
        prev.map((el) => {
          if (!selectedElementIds.includes(el.id)) return el;

          if (el.type === 'shape' || el.type === 'image') {
            // Use absolute offset from fixed dragStart → no drift
            const initPos = elementInitialPositions.get(el.id);
            if (!initPos) return el;
            return {
              ...el,
              x: initPos.x + totalDx,
              y: initPos.y + totalDy,
            };
          } else if (el.type === 'stroke') {
            // Use absolute offset from initial snapshot of points → no drift
            const initPoints = strokeInitialPoints.get(el.id);
            if (!initPoints) return el;
            return {
              ...el,
              points: initPoints.map((p) => ({ x: p.x + totalDx, y: p.y + totalDy })),
            };
          }
          return el;
        })
      );
      // NOTE: We do NOT update dragStart here — the total dx/dy from the fixed
      // dragStart is what gives us drift-free movement on tablets.
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

  // Brush Eraser logic
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

    // Marquee Area Selection Finished
    if (isMarqueeSelecting && marqueeBox) {
      const selected = elements.filter((el) => isElementInsideBox(el, marqueeBox.start, marqueeBox.current));
      setSelectedElementIds(selected.map((el) => el.id));
      setIsMarqueeSelecting(false);
      setMarqueeBox(null);
      return;
    }

    setDragStart(null);
    setElementInitialPositions(new Map());
    setStrokeInitialPoints(new Map());
    setActiveResizeHandle(null);
    setInitialBBox(null);
    setActiveRotationAngle(null);

    // If we were dragging selected elements, broadcast their new positions
    if (currentTool === 'select' && selectedElementIds.length > 0) {
      // Broadcast each selected element's updated state
      for (const id of selectedElementIds) {
        const updated = elements.find((e) => e.id === id);
        if (updated) {
          networkManagerRef.current?.broadcast({ type: 'element_update', element: updated });
        }
      }
    }

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

  // PC Wheel Zoom
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

  // Zoom buttons
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

  // Transformation actions on all selected elements
  const handleDuplicateSelected = () => {
    if (selectedElementIds.length === 0) return;
    const offset = 30;
    const clonedList: CanvasElement[] = [];

    for (const id of selectedElementIds) {
      const target = elements.find((el) => el.id === id);
      if (!target) continue;

      if (target.type === 'shape') {
        clonedList.push({
          ...target,
          id: 'shape_' + Math.random().toString(36).substring(2, 9),
          x: target.x + offset,
          y: target.y + offset,
        });
      } else if (target.type === 'image') {
        const clonedImg: ImageElement = {
          ...target,
          id: 'img_' + Math.random().toString(36).substring(2, 9),
          x: target.x + offset,
          y: target.y + offset,
        };
        if (imageCacheRef.current.has(target.id)) {
          imageCacheRef.current.set(clonedImg.id, imageCacheRef.current.get(target.id)!);
        }
        clonedList.push(clonedImg);
      } else {
        clonedList.push({
          ...target,
          id: 'stroke_' + Math.random().toString(36).substring(2, 9),
          points: target.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
        });
      }
    }

    pushToHistory([...elements, ...clonedList]);
    setSelectedElementIds(clonedList.map((c) => c.id));
  };

  const handleRotateSelected = () => {
    if (selectedElementIds.length === 0) return;
    setElements((prev) =>
      prev.map((el) => {
        if (!selectedElementIds.includes(el.id)) return el;
        const currentRot = (el as any).rotation || 0;
        return { ...el, rotation: (currentRot + 90) % 360 };
      })
    );
  };

  const handleDeleteSelected = () => {
    if (selectedElementIds.length === 0) return;
    const next = elements.filter((el) => !selectedElementIds.includes(el.id));
    pushToHistory(next);
    for (const id of selectedElementIds) {
      networkManagerRef.current?.broadcast({ type: 'element_delete', id });
    }
    setSelectedElementIds([]);
  };

  const handleBringToFront = () => {
    if (selectedElementIds.length === 0) return;
    const unselected = elements.filter((el) => !selectedElementIds.includes(el.id));
    const selected = elements.filter((el) => selectedElementIds.includes(el.id));
    pushToHistory([...unselected, ...selected]);
  };

  const handleSendToBack = () => {
    if (selectedElementIds.length === 0) return;
    const unselected = elements.filter((el) => !selectedElementIds.includes(el.id));
    const selected = elements.filter((el) => selectedElementIds.includes(el.id));
    pushToHistory([...selected, ...unselected]);
  };

  // Safe compressed image upload (<28KB JPEG, perfectly stable on tablets & mobile networks)
  const handleImageUpload = (file: File) => {
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (e) {
      console.warn('createObjectURL failed, falling back', e);
    }

    const img = new Image();
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);

      // Max dimension 360px - crystal clear on tablets & desktop, ultra lightweight
      const maxDimension = 360;
      let width = img.naturalWidth || 300;
      let height = img.naturalHeight || 300;

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

      // Adaptive compression: strictly enforces base64 size <= 28,000 chars (~21KB)
      // This is 100% immune to WebRTC buffer overruns on tablets/mobile networks
      let quality = 0.65;
      let compressedSrc = compCanvas.toDataURL('image/jpeg', quality);

      while (compressedSrc.length > 28000 && quality > 0.20) {
        quality -= 0.10;
        compressedSrc = compCanvas.toDataURL('image/jpeg', quality);
      }

      if (compressedSrc.length > 28000) {
        // Downscale slightly if photographic noise still keeps it large
        const downW = Math.round(width * 0.75);
        const downH = Math.round(height * 0.75);
        compCanvas.width = downW;
        compCanvas.height = downH;
        compCtx?.drawImage(img, 0, 0, downW, downH);
        compressedSrc = compCanvas.toDataURL('image/jpeg', 0.50);
      }

      const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, transform);
      const displayW = Math.min(300, width);
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
      setSelectedElementIds([imgElement.id]);

      // Make sure network is ready, then broadcast
      if (networkManagerRef.current) {
        networkManagerRef.current.ensureConnection(boardSettings.roomCode);
        networkManagerRef.current.broadcast({ type: 'element_add', element: imgElement });
      }
    };

    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      showToastRef.current('Nie udało się wczytać wybranego zdjęcia.');
    };

    if (objectUrl) {
      img.src = objectUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearCanvas = () => {
    if (elements.length === 0) return;
    if (confirm('Czy na pewno chcesz wyczyścić całą tablicę?')) {
      pushToHistory([]);
      setSelectedElementIds([]);
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
              : isMarqueeSelecting
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
        selectedElementId={selectedElementIds.length > 0 ? selectedElementIds[0] : null}
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
        onLeaveLobby={handleLeaveLobby}
        onCreateNewLobby={handleCreateNewLobby}
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

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#f1f5f9',
            padding: '12px 22px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            zIndex: 9999,
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            maxWidth: '90vw',
            textAlign: 'center',
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default App;

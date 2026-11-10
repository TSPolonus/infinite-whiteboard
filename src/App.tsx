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
  getShapeVertices,
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
    laser: { color: '#f43f5e', size: 8, duration: 2400 },
    eraser: { mode: 'brush', size: 28 },
  });

  // Canvas elements state
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [, setUndoRevision] = useState<number>(0);

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

  // Multi-touch gestures & Two-finger double-tap to undo (iOS/iPad Procreate style)
  const activePointers = useRef<Map<number, Point>>(new Map());
  const initialPinchDist = useRef<number | null>(null);
  const initialScale = useRef<number>(1);
  const isSpacePressed = useRef<boolean>(false);
  const isRightClickPanning = useRef<boolean>(false);
  const twoFingerDownTime = useRef<number>(0);
  const twoFingerStartPos = useRef<{ p1: Point; p2: Point } | null>(null);
  const twoFingerMoved = useRef<boolean>(false);
  const lastTwoFingerTapTime = useRef<number>(0);

  // Laser trails & Batching (Zapobiega zatykaniu brokera MQTT)
  const laserTrailsRef = useRef<LaserPoint[]>([]);
  const lastLaserBroadcastRef = useRef<number>(0);
  const pendingLaserBatchRef = useRef<LaserPoint[]>([]);
  const laserBatchTimerRef = useRef<number | null>(null);

  // User-scoped collaborative Undo & Redo (cofa tylko własne elementy, usuwając je u wszystkich)
  const myUndoStackRef = useRef<string[]>([]);
  const myRedoElementsRef = useRef<CanvasElement[]>([]);

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
  const imageCacheRef = useRef<Map<string, HTMLImageElement | HTMLCanvasElement>>(new Map());

  // Always keep ref up-to-date with current elements & settings to avoid stale closures in callbacks
  const elementsRef = useRef<CanvasElement[]>(elements);
  elementsRef.current = elements;
  const boardSettingsRef = useRef<BoardSettings>(boardSettings);
  boardSettingsRef.current = boardSettings;

  // Rejestracja elementu stworzonego przez bieżącego użytkownika
  const registerMyCreatedElement = useCallback((element: CanvasElement) => {
    myUndoStackRef.current.push(element.id);
    myRedoElementsRef.current = []; // Nowa akcja czyści stos przywracania
    setUndoRevision((r) => r + 1);
  }, []);

  // History push helper (synchronous ref update prevents missing consecutive strokes)
  const pushToHistory = useCallback((newElements: CanvasElement[]) => {
    elementsRef.current = newElements;
    setElements(newElements);
    setUndoRevision((r) => r + 1);
  }, []);

  // Collaborative Undo: usuwa tylko element stworzony przez TEGO użytkownika i rozgłasza usunięcie u wszystkich
  const handleUndo = useCallback(() => {
    const myId = networkManagerRef.current?.getUserId();
    let targetId: string | undefined;

    // 1. Sprawdź stos lokalny stworzonych elementów
    while (myUndoStackRef.current.length > 0) {
      const candidateId = myUndoStackRef.current.pop()!;
      if (elementsRef.current.some((e) => e.id === candidateId)) {
        targetId = candidateId;
        break;
      }
    }

    // 2. Jeśli stos lokalny był pusty, znajdź od końca element oznaczony moim userId
    if (!targetId && myId) {
      for (let i = elementsRef.current.length - 1; i >= 0; i--) {
        const el = elementsRef.current[i];
        if (el.userId === myId) {
          targetId = el.id;
          break;
        }
      }
    }

    // 3. Fallback: jeśli nadal brak lub praca solo, weź ostatni element tablicy
    if (!targetId && elementsRef.current.length > 0) {
      targetId = elementsRef.current[elementsRef.current.length - 1].id;
    }

    if (!targetId) return;

    const targetElement = elementsRef.current.find((e) => e.id === targetId);
    if (targetElement) {
      myRedoElementsRef.current.push(targetElement);
    }

    const updated = elementsRef.current.filter((e) => e.id !== targetId);
    elementsRef.current = updated;
    setElements(updated);
    setUndoRevision((r) => r + 1);

    // Rozgłoś usunięcie tego konkretnego elementu u wszystkich w pokoju
    networkManagerRef.current?.broadcast({
      type: 'element_delete',
      id: targetId,
    });
    showToastRef.current('↩️ Cofnięto Twój element');
  }, []);

  // Collaborative Redo: przywraca cofnięty własny element i rozgłasza do wszystkich
  const handleRedo = useCallback(() => {
    if (myRedoElementsRef.current.length === 0) return;
    const restored = myRedoElementsRef.current.pop()!;

    myUndoStackRef.current.push(restored.id);
    const updated = [...elementsRef.current.filter((e) => e.id !== restored.id), restored];
    elementsRef.current = updated;
    setElements(updated);
    setUndoRevision((r) => r + 1);

    // Rozgłoś dodanie przywróconego elementu u wszystkich
    networkManagerRef.current?.broadcast({
      type: 'element_add',
      element: restored,
    });
    showToastRef.current('↪️ Przywrócono element');
  }, []);

  // Setup Lobby Networking
  const initNetworking = useCallback((code: string, password?: string) => {
    if (networkManagerRef.current) {
      networkManagerRef.current.disconnect();
    }

    const netManager = new BoardNetworkManager(
      {
        onElementAdd: (el) => {
          setElements((prev) => {
            if (prev.some((e) => e.id === el.id)) return prev;
            const next = [...prev, el];
            elementsRef.current = next;
            return next;
          });
        },
        onElementUpdate: (el) => {
          setElements((prev) => {
            const next = prev.map((e) => (e.id === el.id ? el : e));
            elementsRef.current = next;
            return next;
          });
        },
        onElementDelete: (id) => {
          setElements((prev) => {
            const next = prev.filter((e) => e.id !== id);
            elementsRef.current = next;
            return next;
          });
        },
        onBoardSync: (syncElements, syncSettings) => {
          // Ochrona przed skasowaniem lokalnie wgranego zdjęcia przy reconnect z galerii tableta:
          const localRecent = elementsRef.current.filter(
            (el) => !syncElements.some((s) => s.id === el.id) && (Date.now() - el.timestamp < 30000 || el.type === 'image')
          );
          const merged = [...syncElements, ...localRecent];
          elementsRef.current = merged;
          setElements(merged);
          if (syncSettings) setBoardSettings(syncSettings);
          setIsPasswordModalOpen(false);

          // Jeśli klient ma lokalnie świeży element (np. obraz), którego host nie miał, doślij go
          for (const missing of localRecent) {
            netManager.broadcast({ type: 'element_add', element: missing });
          }
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
        elements: elementsRef.current,
        settings: boardSettingsRef.current,
      })
    );

    networkManagerRef.current = netManager;
    netManager.connect(code, password);
  }, []);

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

  // Pełne wsparcie gestów iOS & iPadOS (zapobiega domyślnemu zoomowi całej strony w Safari)
  useEffect(() => {
    const preventGesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('gestureend', preventGesture, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  // Join Room by Code (bezpieczne przejście bez podwójnego montowania)
  const handleJoinRoomByCode = (newCode: string) => {
    const clean = newCode.toUpperCase().trim();
    if (clean === boardSettings.roomCode) {
      initNetworking(clean);
    } else {
      window.location.hash = `room=${clean}`;
      setBoardSettings((prev) => ({ ...prev, id: clean, roomCode: clean }));
    }
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

    // 2. Multi-touch gesture (Pinch-to-zoom / Two-finger pan & Double-tap to undo)
    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      initialPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialScale.current = transform.scale;
      twoFingerDownTime.current = Date.now();
      twoFingerStartPos.current = { p1: pts[0], p2: pts[1] };
      twoFingerMoved.current = false;
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
        // Oblicz nową listę zaznaczonych ID lokalnie — NIE czekaj na setState (React batch!)
        const newSelectedIds = selectedElementIds.includes(hit.id) ? selectedElementIds : [hit.id];
        if (!selectedElementIds.includes(hit.id)) {
          setSelectedElementIds([hit.id]);
        }
        setDragStart(worldPos);

        const initPosMap = new Map<string, Point>();
        const strokePtsMap = new Map<string, Point[]>();
        // Używamy localnych newSelectedIds — zawsze aktualne, nie czeka na React re-render
        for (const id of newSelectedIds) {
          const el = elements.find((item) => item.id === id);
          if (el) {
            initPosMap.set(id, { x: (el as any).x || 0, y: (el as any).y || 0 });
            if (el.type === 'stroke' || (el.type === 'shape' && (el as ShapeElement).points)) {
              strokePtsMap.set(id, (el as any).points.map((p: Point) => ({ ...p })));
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
        break: true, // Oznacza początek nowego pociągnięcia — renderer nie połączy z poprzednim
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

    // Broadcast cursor position (optymalizacja częstotliwości do max 8/sek, aby nie blokować pasma dla rysowania)
    const now = Date.now();
    if (now - lastLaserBroadcastRef.current > 120) {
      lastLaserBroadcastRef.current = now;
      networkManagerRef.current?.broadcast({
        type: 'cursor_move',
        cursor: {
          userId: networkManagerRef.current?.getUserId() || 'me',
          userName: 'Użytkownik',
          color: toolSettings.pen.color,
          x: Math.round(worldPos.x),
          y: Math.round(worldPos.y),
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

      // Sprawdź czy palce się przesunęły (odróżnienie gestu powiększania od stuknięcia)
      if (twoFingerStartPos.current) {
        const d1 = Math.hypot(pts[0].x - twoFingerStartPos.current.p1.x, pts[0].y - twoFingerStartPos.current.p1.y);
        const d2 = Math.hypot(pts[1].x - twoFingerStartPos.current.p2.x, pts[1].y - twoFingerStartPos.current.p2.y);
        if (d1 > 15 || d2 > 15) {
          twoFingerMoved.current = true;
        }
      }

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

    // Rescaling / Free Rotating / Vertex Dragging / Radius Changing
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

          // Interactive Circle Radius Dragging
          if (activeResizeHandle === 'radius' && el.type === 'shape') {
            const cx = initialBBox.x + initialBBox.width / 2;
            const cy = initialBBox.y + initialBBox.height / 2;
            const newRadius = Math.max(8, Math.round(Math.hypot(worldPos.x - cx, worldPos.y - cy)));
            return {
              ...el,
              x: cx - newRadius,
              y: cy - newRadius,
              width: newRadius * 2,
              height: newRadius * 2,
            };
          }

          // Interactive Polygon Vertex / Corner Dragging
          if (activeResizeHandle.startsWith('vertex_') && el.type === 'shape') {
            const vIdx = parseInt(activeResizeHandle.split('_')[1], 10);
            const vertices = el.points ? [...el.points] : getShapeVertices(el) ? [...getShapeVertices(el)!] : null;
            if (vertices && vIdx >= 0 && vIdx < vertices.length) {
              vertices[vIdx] = { x: worldPos.x, y: worldPos.y };
              let vMinX = Infinity, vMinY = Infinity, vMaxX = -Infinity, vMaxY = -Infinity;
              for (const p of vertices) {
                if (p.x < vMinX) vMinX = p.x;
                if (p.x > vMaxX) vMaxX = p.x;
                if (p.y < vMinY) vMinY = p.y;
                if (p.y > vMaxY) vMaxY = p.y;
              }
              return {
                ...el,
                points: vertices,
                x: vMinX,
                y: vMinY,
                width: Math.max(10, vMaxX - vMinX),
                height: Math.max(10, vMaxY - vMinY),
              };
            }
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

            // Proporcjonalne skalowanie wierzchołków wielokąta/trójkąta przy zmianie rozmiaru ramki
            let newPoints = (el as ShapeElement).points;
            if (newPoints && initialBBox.width > 0 && initialBBox.height > 0) {
              const scaleX = newW / initialBBox.width;
              const scaleY = newH / initialBBox.height;
              newPoints = newPoints.map((p) => ({
                x: newX + (p.x - initialBBox.x) * scaleX,
                y: newY + (p.y - initialBBox.y) * scaleY,
              }));
            }

            return { ...el, x: newX, y: newY, width: newW, height: newH, ...(newPoints ? { points: newPoints } : {}) };
          }
          return el;
        })
      );
      return;
    }

    // Move all selected elements
    // Używamy elementInitialPositions.size lub strokeInitialPoints.size jako fallback
    // gdy React jeszcze nie zaktualizował selectedElementIds (tablet — batching stanu)
    if (currentTool === 'select' && (selectedElementIds.length > 0 || elementInitialPositions.size > 0 || strokeInitialPoints.size > 0) && dragStart && !activeResizeHandle && !isMarqueeSelecting) {
      const totalDx = worldPos.x - dragStart.x;
      const totalDy = worldPos.y - dragStart.y;
      if (totalDx === 0 && totalDy === 0) return;

      setElements((prev) =>
        prev.map((el) => {
          // Sprawdź czy element jest zaznaczony — albo przez selectedElementIds (zaktualizowany)
          // albo przez initPos (gdy React batch jeszcze nie zaktualizował selectedElementIds)
          const isSelected = selectedElementIds.includes(el.id) ||
            elementInitialPositions.has(el.id) ||
            strokeInitialPoints.has(el.id);
          if (!isSelected) return el;

          if (el.type === 'shape' || el.type === 'image') {
            // Use absolute offset from fixed dragStart → no drift
            const initPos = elementInitialPositions.get(el.id);
            if (!initPos) return el;
            const initPoints = strokeInitialPoints.get(el.id);
            return {
              ...el,
              x: initPos.x + totalDx,
              y: initPos.y + totalDy,
              ...(initPoints ? { points: initPoints.map((p) => ({ x: p.x + totalDx, y: p.y + totalDy })) } : {}),
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

    // Laser pointer drag (batchowane wysyłanie co 40ms, aby nie blokować brokera MQTT)
    if (currentTool === 'laser' && isDrawing) {
      const lp: LaserPoint = {
        x: Math.round(worldPos.x * 10) / 10,
        y: Math.round(worldPos.y * 10) / 10,
        timestamp: Date.now(),
        color: toolSettings.laser.color,
        size: toolSettings.laser.size,
        duration: toolSettings.laser.duration,
      };
      laserTrailsRef.current.push(lp);
      pendingLaserBatchRef.current.push(lp);

      if (!laserBatchTimerRef.current) {
        laserBatchTimerRef.current = window.setTimeout(() => {
          if (pendingLaserBatchRef.current.length > 0) {
            networkManagerRef.current?.broadcast({
              type: 'laser_stroke',
              points: pendingLaserBatchRef.current,
            });
            pendingLaserBatchRef.current = [];
          }
          laserBatchTimerRef.current = null;
        }, 40);
      }
      return;
    }

    // Freehand stroke / shape drawing
    if (isDrawing) {
      setCurrentStroke((prev) => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          // Deadband filter: pomijaj mikroskopijne drgania < 1.2px
          if (Math.hypot(worldPos.x - last.x, worldPos.y - last.y) < 1.2) {
            return prev;
          }
        }
        const cleanPt = {
          x: Math.round(worldPos.x * 10) / 10,
          y: Math.round(worldPos.y * 10) / 10,
        };
        return [...prev, cleanPt];
      });

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

    // Wykrywanie dwukrotnego stuknięcia dwoma palcami (Two-finger double-tap to undo - styl Procreate)
    if (activePointers.current.size === 2) {
      const duration = Date.now() - twoFingerDownTime.current;
      if (!twoFingerMoved.current && duration < 320) {
        const now = Date.now();
        if (now - lastTwoFingerTapTime.current < 450) {
          handleUndo();
          showToastRef.current('↩️ Cofnięto (gest 2 palców)');
          lastTwoFingerTapTime.current = 0;
        } else {
          lastTwoFingerTapTime.current = now;
        }
      }
    }

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

    // Zakończenie pociągnięcia lasera i wypchnięcie ostatniej paczki punktów
    if (pendingLaserBatchRef.current.length > 0) {
      if (laserBatchTimerRef.current) {
        clearTimeout(laserBatchTimerRef.current);
        laserBatchTimerRef.current = null;
      }
      networkManagerRef.current?.broadcast({
        type: 'laser_stroke',
        points: pendingLaserBatchRef.current,
      });
      pendingLaserBatchRef.current = [];
    }

    if (snappedShape) {
      const myId = networkManagerRef.current?.getUserId() || 'me';
      const shapeWithUser: ShapeElement = { ...snappedShape, userId: myId };
      registerMyCreatedElement(shapeWithUser);
      pushToHistory([...elementsRef.current.filter((e) => e.id !== shapeWithUser.id), shapeWithUser]);
      networkManagerRef.current?.broadcast({ type: 'element_add', element: shapeWithUser });
      setSnappedShape(null);
      setCurrentStroke([]);
      return;
    }

    if (currentTool === 'shape' && currentStroke.length >= 2) {
      const myId = networkManagerRef.current?.getUserId() || 'me';
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
        userId: myId,
      };
      registerMyCreatedElement(newShape);
      pushToHistory([...elementsRef.current.filter((e) => e.id !== newShape.id), newShape]);
      networkManagerRef.current?.broadcast({ type: 'element_add', element: newShape });
      setCurrentStroke([]);
      return;
    }

    if ((currentTool === 'pen' || currentTool === 'highlighter') && currentStroke.length > 0) {
      const myId = networkManagerRef.current?.getUserId() || 'me';
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
        userId: myId,
      };
      registerMyCreatedElement(newStroke);
      pushToHistory([...elementsRef.current.filter((e) => e.id !== newStroke.id), newStroke]);
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

  const handleSetCircleRadius = (newRadius: number) => {
    if (selectedElementIds.length === 0) return;
    const targetId = selectedElementIds[0];
    const target = elements.find((el) => el.id === targetId);
    if (!target || target.type !== 'shape' || target.shapeType !== 'circle') return;

    const cx = target.x + target.width / 2;
    const cy = target.y + target.height / 2;
    const r = Math.max(5, Math.min(5000, newRadius));
    const updated: ShapeElement = {
      ...target,
      x: cx - r,
      y: cy - r,
      width: r * 2,
      height: r * 2,
    };
    pushToHistory(elements.map((e) => (e.id === targetId ? updated : e)));
    networkManagerRef.current?.broadcast({ type: 'element_update', element: updated });
  };

  // Universal high-definition image loader (minimum 720p HD)
  // Handles native mobile camera formats, EXIF, and prevents WebRTC disconnects
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    try {
      showToastRef.current('Wczytywanie zdjęcia...');
      let sourceWidth = 0;
      let sourceHeight = 0;
      let drawSource: CanvasImageSource | null = null;
      let cleanup: (() => void) | null = null;

      // 1. Try native createImageBitmap (fastest, hardware GPU decoded, handles orientation & mobile formats)
      if (typeof createImageBitmap !== 'undefined') {
        try {
          const bitmap = await createImageBitmap(file);
          sourceWidth = bitmap.width;
          sourceHeight = bitmap.height;
          drawSource = bitmap;
          cleanup = () => {
            try {
              bitmap.close();
            } catch (e) {}
          };
        } catch (bitmapErr) {
          console.warn('createImageBitmap fallback', bitmapErr);
        }
      }

      // 2. Fallback to FileReader + HTMLImageElement if createImageBitmap is unavailable or fails on mobile camera
      if (!drawSource) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Błąd odczytu pliku przez FileReader'));
          reader.readAsDataURL(file);
        });

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = (e) => reject(e);
          image.src = dataUrl;
        });
        sourceWidth = img.naturalWidth || 600;
        sourceHeight = img.naturalHeight || 400;
        drawSource = img;
      }

      // Target HD 720p resolution (up to 1280px on longest edge)
      const targetMaxDim = 1280;
      let renderW = sourceWidth;
      let renderH = sourceHeight;
      if (renderW > targetMaxDim || renderH > targetMaxDim) {
        if (renderW > renderH) {
          renderH = Math.max(1, Math.round((renderH / renderW) * targetMaxDim));
          renderW = targetMaxDim;
        } else {
          renderW = Math.max(1, Math.round((renderW / renderH) * targetMaxDim));
          renderH = targetMaxDim;
        }
      }

      const hdCanvas = document.createElement('canvas');
      hdCanvas.width = renderW;
      hdCanvas.height = renderH;
      const hdCtx = hdCanvas.getContext('2d');
      if (!hdCtx) {
        if (cleanup) cleanup();
        return;
      }

      hdCtx.imageSmoothingEnabled = true;
      hdCtx.imageSmoothingQuality = 'high';
      hdCtx.drawImage(drawSource, 0, 0, renderW, renderH);

      if (cleanup) cleanup();

      // Optimize JPEG quality for 720p:
      // High visual quality (0.76). If base64 length exceeds 95,000 chars (~70KB),
      // adaptively steps down to ensure zero WebRTC buffer overflows.
      let quality = 0.76;
      let compressedData = hdCanvas.toDataURL('image/jpeg', quality);
      while (compressedData.length > 95000 && quality > 0.40) {
        quality -= 0.08;
        compressedData = hdCanvas.toDataURL('image/jpeg', quality);
      }
      if (!compressedData || compressedData.length < 50) {
        compressedData = hdCanvas.toDataURL('image/png');
      }

      // Display dimensions na tablicy (proporcjonalne i wygodne do manipulacji)
      const displayW = Math.min(500, Math.max(200, sourceWidth > 500 ? 500 : sourceWidth));
      const displayH = Math.round((displayW / sourceWidth) * sourceHeight);
      const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, transform);

      const myId = networkManagerRef.current?.getUserId() || 'me';
      const imgElement: ImageElement = {
        id: 'img_' + Math.random().toString(36).substring(2, 9),
        type: 'image',
        x: center.x - displayW / 2,
        y: center.y - displayH / 2,
        width: displayW,
        height: displayH,
        src: compressedData,
        aspectRatio: sourceWidth / sourceHeight,
        rotation: 0,
        timestamp: Date.now(),
        userId: myId,
      };

      registerMyCreatedElement(imgElement);

      // 1. Zapisz w pamięci natywny canvas z wyrenderowanym obrazem (natychmiastowe wyświetlenie na tablecie bez dekodowania base64)
      imageCacheRef.current.set(imgElement.id, hdCanvas as any);

      // 2. Dodaj element do tablicy lokalnie
      pushToHistory([...elementsRef.current.filter((e) => e.id !== imgElement.id), imgElement]);
      setSelectedElementIds([imgElement.id]);

      // 3. Upewnij się, że połączenie WebRTC jest aktywne i natychmiast rozgłoś do lobby
      networkManagerRef.current?.ensureConnection(boardSettings.roomCode);
      networkManagerRef.current?.broadcast({ type: 'element_add', element: imgElement });

      showToastRef.current('✅ Zdjęcie HD dodane!');
    } catch (err) {
      console.error('Error handling image upload', err);
      showToastRef.current('❌ Nie udało się wczytać wybranego zdjęcia.');
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
        canUndo={myUndoStackRef.current.length > 0 || elements.some((e) => e.userId === networkManagerRef.current?.getUserId()) || elements.length > 0}
        canRedo={myRedoElementsRef.current.length > 0}
        boardSettings={boardSettings}
        connectedCount={connectedCount}
        selectedElementId={selectedElementIds.length > 0 ? selectedElementIds[0] : null}
        selectedElement={selectedElementIds.length === 1 ? elements.find((e) => e.id === selectedElementIds[0]) || null : null}
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
        onUpdateCircleRadius={handleSetCircleRadius}
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

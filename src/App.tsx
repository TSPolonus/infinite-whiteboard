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
  EraserMode,
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
import { BoardNetworkManager } from './utils/webrtc';
import { Toolbar } from './components/Toolbar';
import { ShareModal } from './components/ShareModal';
import { SettingsModal } from './components/SettingsModal';
import { PasswordPromptModal } from './components/PasswordPromptModal';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Board settings & room
  const [boardSettings, setBoardSettings] = useState<BoardSettings>(() => {
    const hash = window.location.hash.replace('#room=', '');
    const roomId = hash || 'room-' + Math.random().toString(36).substring(2, 8);
    if (!hash) {
      window.location.hash = `room=${roomId}`;
    }
    return {
      id: roomId,
      title: 'Moja Tablica',
      isPasswordProtected: false,
      backgroundColor: '#0f172a',
      gridType: 'dots',
      gridSize: 40,
      palmRejection: true, // Default to true for tablets
      eraserMode: 'stroke',
      laserColor: '#f43f5e',
    };
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

  // Tool settings
  const [currentTool, setCurrentTool] = useState<Tool>('pen');
  const [currentShape, setCurrentShape] = useState<ShapeType>('rectangle');
  const [color, setColor] = useState<string>('#38bdf8');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
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

  // Multi-touch gestures
  const activePointers = useRef<Map<number, Point>>(new Map());
  const initialPinchDist = useRef<number | null>(null);
  const initialScale = useRef<number>(1);
  const isSpacePressed = useRef<boolean>(false);

  // Auto-shape hold detection timer
  const holdTimerRef = useRef<number | null>(null);

  // Laser pointer trails
  const laserTrailsRef = useRef<LaserPoint[]>([]);
  const lastLaserBroadcastRef = useRef<number>(0);

  // Remote collaboration
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [connectedCount, setConnectedCount] = useState<number>(1);
  const networkManagerRef = useRef<BoardNetworkManager | null>(null);

  // Modals
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<string>('');

  // Image cache
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Push history helper
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

  // Setup PeerJS Networking
  useEffect(() => {
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
        onConnectionStatusChange: () => {
          setConnectedCount(netManager.getConnectedCount());
        },
      },
      () => ({
        elements,
        settings: boardSettings,
      })
    );

    networkManagerRef.current = netManager;
    netManager.connect(boardSettings.id);

    return () => {
      netManager.disconnect();
    };
  }, [boardSettings.id]);

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

  // Image Paste Listener (Ctrl+V)
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

  // Resize canvas with devicePixelRatio for ultra-sharp stylus tracking
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

  // Accurate Stylus & Touch Coordinate Calculation
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

      // 1. Elements
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
            color: color,
            strokeWidth: strokeWidth,
            points: currentShape === 'line' || currentShape === 'arrow' || currentShape === 'double_arrow' ? [p0, pn] : undefined,
            timestamp: now,
          };
          drawShape(ctx, tempShape);
        } else if (currentTool === 'pen' || currentTool === 'highlighter') {
          const tempStroke: StrokeElement = {
            id: 'temp',
            type: 'stroke',
            tool: currentTool,
            points: currentStroke,
            color: color,
            size: strokeWidth,
            opacity: currentTool === 'highlighter' ? 0.45 : 1,
            timestamp: now,
          };
          drawStroke(ctx, tempStroke);
        }
      }

      // 3. Laser trails
      laserTrailsRef.current = laserTrailsRef.current.filter((p) => now - p.timestamp < 1600);
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
    isDrawing,
    currentStroke,
    snappedShape,
    currentTool,
    currentShape,
    color,
    strokeWidth,
    selectedElementId,
    remoteCursors,
  ]);

  // Pointer Down Handler
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const { screenPos, worldPos } = getCanvasPoint(e);
    activePointers.current.set(e.pointerId, screenPos);

    // 1. Multi-touch gesture (Pinch-to-zoom / Two-finger pan)
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

    // 2. PALM REJECTION MODE:
    // If enabled, fingers / palm ONLY pan the canvas, while stylus draws!
    if (boardSettings.palmRejection && e.pointerType === 'touch') {
      setDragStart(screenPos);
      return;
    }

    // 3. Manual Pan (Hand tool, spacebar, or middle click)
    if (isSpacePressed.current || currentTool === 'hand' || e.button === 1) {
      setDragStart(screenPos);
      return;
    }

    // 4. Select Tool: Check resize handles first, then element hit
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

      // Hit test elements
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

    // 5. Eraser Tool: object vs pixel erase
    if (currentTool === 'eraser') {
      if (boardSettings.eraserMode === 'stroke') {
        const hit = elements.slice().reverse().find((el) => isPointInsideElement(worldPos, el));
        if (hit) {
          const next = elements.filter((el) => el.id !== hit.id);
          pushToHistory(next);
          networkManagerRef.current?.broadcast({ type: 'element_delete', id: hit.id });
        }
      } else {
        // Pixel eraser start
        applyPixelEraser(worldPos);
      }
      return;
    }

    // 6. Laser Pointer Tool
    if (currentTool === 'laser') {
      setIsDrawing(true);
      const lp: LaserPoint = {
        x: worldPos.x,
        y: worldPos.y,
        timestamp: Date.now(),
        color: boardSettings.laserColor,
        size: 10,
      };
      laserTrailsRef.current.push(lp);
      networkManagerRef.current?.broadcast({ type: 'laser_stroke', points: [lp] });
      return;
    }

    // 7. Drawing Tools (Pen, Highlighter, Shape)
    setIsDrawing(true);
    setCurrentStroke([worldPos]);
    setSnappedShape(null);

    // Auto-shape hold timer
    if (autoShapeEnabled && (currentTool === 'pen' || currentTool === 'highlighter')) {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      holdTimerRef.current = window.setTimeout(() => {
        triggerAutoShapeSnap();
      }, 420);
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
    if (now - lastLaserBroadcastRef.current > 50) {
      lastLaserBroadcastRef.current = now;
      networkManagerRef.current?.broadcast({
        type: 'cursor_move',
        cursor: {
          userId: networkManagerRef.current?.getUserId() || 'me',
          userName: 'Użytkownik',
          color: color,
          x: worldPos.x,
          y: worldPos.y,
          lastActive: now,
        },
      });
    }

    // Multi-touch pinch & pan
    if (activePointers.current.size === 2 && initialPinchDist.current !== null) {
      const pts = Array.from(activePointers.current.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const factor = currentDist / initialPinchDist.current;
      const newScale = Math.min(5, Math.max(0.15, initialScale.current * factor));

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

    // Rescaling selected element via handle
    if (currentTool === 'select' && selectedElementId && activeResizeHandle && dragStart && initialBBox) {
      const dx = worldPos.x - dragStart.x;
      const dy = worldPos.y - dragStart.y;

      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== selectedElementId) return el;

          if (activeResizeHandle === 'rotate') {
            const cx = initialBBox.x + initialBBox.width / 2;
            const cy = initialBBox.y + initialBBox.height / 2;
            const rad = Math.atan2(worldPos.y - cy, worldPos.x - cx);
            const deg = (rad * 180) / Math.PI + 90;
            return { ...el, rotation: Math.round(deg) };
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

    // Eraser on drag
    if (currentTool === 'eraser' && (e.buttons === 1 || e.pointerType === 'pen')) {
      if (boardSettings.eraserMode === 'stroke') {
        const hit = elements.slice().reverse().find((el) => isPointInsideElement(worldPos, el));
        if (hit) {
          const next = elements.filter((el) => el.id !== hit.id);
          pushToHistory(next);
          networkManagerRef.current?.broadcast({ type: 'element_delete', id: hit.id });
        }
      } else {
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
        color: boardSettings.laserColor,
        size: 10,
      };
      laserTrailsRef.current.push(lp);
      networkManagerRef.current?.broadcast({ type: 'laser_stroke', points: [lp] });
      return;
    }

    // Freehand stroke / shape drawing
    if (isDrawing) {
      setCurrentStroke((prev) => [...prev, worldPos]);

      if (autoShapeEnabled && (currentTool === 'pen' || currentTool === 'highlighter')) {
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        holdTimerRef.current = window.setTimeout(() => {
          triggerAutoShapeSnap();
        }, 420);
      }
    }
  };

  // Pixel Eraser logic
  const applyPixelEraser = (erasePoint: Point) => {
    const eraserRadius = Math.max(16, strokeWidth * 2.5);
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
      pushToHistory(nextElements);
    }
  };

  // Auto Shape Detection
  const triggerAutoShapeSnap = () => {
    setCurrentStroke((latestPoints) => {
      if (latestPoints.length < 6) return latestPoints;
      const detected = detectShape(latestPoints);
      if (detected) {
        const shapeEl: ShapeElement = {
          id: 'shape_' + Math.random().toString(36).substring(2, 9),
          type: 'shape',
          shapeType: detected.shapeType,
          x: detected.x,
          y: detected.y,
          width: detected.width,
          height: detected.height,
          points: detected.points,
          color: color,
          strokeWidth: strokeWidth,
          timestamp: Date.now(),
        };
        setSnappedShape(shapeEl);
      }
      return latestPoints;
    });
  };

  // Pointer Up Handler
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      initialPinchDist.current = null;
    }

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    setDragStart(null);
    setElementInitialPos(null);
    setActiveResizeHandle(null);
    setInitialBBox(null);

    if (!isDrawing) return;
    setIsDrawing(false);

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
        color: color,
        strokeWidth: strokeWidth,
        timestamp: Date.now(),
      };
      pushToHistory([...elements, newShape]);
      networkManagerRef.current?.broadcast({ type: 'element_add', element: newShape });
      setCurrentStroke([]);
      return;
    }

    if ((currentTool === 'pen' || currentTool === 'highlighter') && currentStroke.length > 0) {
      const newStroke: StrokeElement = {
        id: 'stroke_' + Math.random().toString(36).substring(2, 9),
        type: 'stroke',
        tool: currentTool,
        points: currentStroke,
        color: color,
        size: strokeWidth,
        opacity: currentTool === 'highlighter' ? 0.45 : 1,
        timestamp: Date.now(),
      };
      pushToHistory([...elements, newStroke]);
      networkManagerRef.current?.broadcast({ type: 'element_add', element: newStroke });
      setCurrentStroke([]);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      const newScale = Math.min(5, Math.max(0.12, transform.scale * zoomFactor));

      const mouseX = e.clientX;
      const mouseY = e.clientY;

      setTransform((prev) => ({
        scale: newScale,
        x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
        y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
      }));
    } else {
      setTransform((prev) => ({
        ...prev,
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Zoom control buttons
  const handleZoomIn = () => {
    setTransform((prev) => {
      const newScale = Math.min(5, prev.scale * 1.25);
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
      const newScale = Math.max(0.15, prev.scale * 0.8);
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

  // Selected Element Transformation Handlers
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

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, transform);
        const maxDim = 400;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = (h / w) * maxDim;
            w = maxDim;
          } else {
            w = (w / h) * maxDim;
            h = maxDim;
          }
        }

        const imgElement: ImageElement = {
          id: 'img_' + Math.random().toString(36).substring(2, 9),
          type: 'image',
          x: center.x - w / 2,
          y: center.y - h / 2,
          width: w,
          height: h,
          src: src,
          aspectRatio: img.naturalWidth / img.naturalHeight,
          rotation: 0,
          timestamp: Date.now(),
        };

        imageCacheRef.current.set(imgElement.id, img);
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
    networkManagerRef.current?.connect(boardSettings.id, password);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
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
            activeResizeHandle
              ? 'crosshair'
              : currentTool === 'hand' || isSpacePressed.current
              ? 'grab'
              : currentTool === 'laser'
              ? 'crosshair'
              : currentTool === 'eraser'
              ? 'cell'
              : 'crosshair',
          touchAction: 'none',
        }}
      />

      <Toolbar
        currentTool={currentTool}
        currentShape={currentShape}
        color={color}
        strokeWidth={strokeWidth}
        autoShapeEnabled={autoShapeEnabled}
        scale={transform.scale}
        canUndo={history.length > 0}
        canRedo={redoStack.length > 0}
        boardSettings={boardSettings}
        connectedCount={connectedCount}
        selectedElementId={selectedElementId}
        onToolChange={setCurrentTool}
        onShapeChange={setCurrentShape}
        onColorChange={setColor}
        onStrokeWidthChange={setStrokeWidth}
        onToggleAutoShape={() => setAutoShapeEnabled((prev) => !prev)}
        onTogglePalmRejection={() =>
          setBoardSettings((prev) => ({ ...prev, palmRejection: !prev.palmRejection }))
        }
        onEraserModeChange={(mode: EraserMode) =>
          setBoardSettings((prev) => ({ ...prev, eraserMode: mode }))
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

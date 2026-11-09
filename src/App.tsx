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
} from './utils/canvasRenderer';
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
    };
  });

  // Canvas elements state
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [redoStack, setRedoStack] = useState<CanvasElement[][]>([]);

  // Viewport transform (infinite canvas pan & zoom)
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

  // Multi-touch gestures (pinch-to-zoom & two-finger pan)
  const activePointers = useRef<Map<number, Point>>(new Map());
  const initialPinchDist = useRef<number | null>(null);
  const initialScale = useRef<number>(1);
  const isSpacePressed = useRef<boolean>(false);

  // Auto-shape hold detection timer
  const holdTimerRef = useRef<number | null>(null);
  const lastMoveTimeRef = useRef<number>(0);

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

  // Keyboard shortcuts (Undo, Redo, Space to Pan)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.code === 'Space' && !isSpacePressed.current) {
        isSpacePressed.current = true;
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
  }, [handleUndo, handleRedo]);

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

  // Resize canvas to full window
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Main Render Loop (Canvas Animation Frame)
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const now = Date.now();

      ctx.fillStyle = boardSettings.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const isDark = boardSettings.backgroundColor !== '#ffffff' && boardSettings.backgroundColor !== '#f8fafc';
      drawGrid(
        ctx,
        canvas.width,
        canvas.height,
        transform,
        boardSettings.gridType,
        boardSettings.gridSize,
        isDark
      );

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.scale, transform.scale);

      for (const el of elements) {
        if (el.type === 'stroke') {
          drawStroke(ctx, el);
        } else if (el.type === 'shape') {
          drawShape(ctx, el);
        } else if (el.type === 'image') {
          drawImageElement(ctx, el, imageCacheRef.current);
        }
      }

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
            points: currentShape === 'line' || currentShape === 'arrow' ? [p0, pn] : undefined,
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

      laserTrailsRef.current = laserTrailsRef.current.filter((p) => now - p.timestamp < 1400);
      drawLaserTrails(ctx, laserTrailsRef.current, now);

      if (selectedElementId) {
        const selected = elements.find((e) => e.id === selectedElementId);
        if (selected) {
          drawSelectionBox(ctx, selected, transform);
        }
      }

      for (const [, cursor] of remoteCursors) {
        if (now - cursor.lastActive < 10000) {
          drawRemoteCursor(ctx, cursor);
        }
      }

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

  // Pointer Event Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const screenPos = { x: e.clientX, y: e.clientY };
    const worldPos = screenToWorld(e.clientX, e.clientY, transform);

    activePointers.current.set(e.pointerId, screenPos);

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

    if (isSpacePressed.current || currentTool === 'hand' || e.button === 1) {
      setDragStart(screenPos);
      return;
    }

    if (currentTool === 'select') {
      const hit = elements.slice().reverse().find((el) => isPointInsideElement(worldPos, el));
      if (hit) {
        setSelectedElementId(hit.id);
        setDragStart(worldPos);
        setElementInitialPos({ x: (hit as any).x || 0, y: (hit as any).y || 0 });
      } else {
        setSelectedElementId(null);
      }
      return;
    }

    if (currentTool === 'eraser') {
      const hit = elements.slice().reverse().find((el) => isPointInsideElement(worldPos, el));
      if (hit) {
        const next = elements.filter((el) => el.id !== hit.id);
        pushToHistory(next);
        networkManagerRef.current?.broadcast({ type: 'element_delete', id: hit.id });
      }
      return;
    }

    if (currentTool === 'laser') {
      setIsDrawing(true);
      const lp: LaserPoint = {
        x: worldPos.x,
        y: worldPos.y,
        timestamp: Date.now(),
        color: '#f43f5e',
        size: 8,
      };
      laserTrailsRef.current.push(lp);
      networkManagerRef.current?.broadcast({ type: 'laser_stroke', points: [lp] });
      return;
    }

    setIsDrawing(true);
    setCurrentStroke([worldPos]);
    setSnappedShape(null);
    lastMoveTimeRef.current = Date.now();

    if (autoShapeEnabled && (currentTool === 'pen' || currentTool === 'highlighter')) {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      holdTimerRef.current = window.setTimeout(() => {
        triggerAutoShapeSnap();
      }, 450);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screenPos = { x: e.clientX, y: e.clientY };
    const worldPos = screenToWorld(e.clientX, e.clientY, transform);

    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, screenPos);
    }

    const now = Date.now();
    if (now - lastLaserBroadcastRef.current > 60) {
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

    if (dragStart && (isSpacePressed.current || currentTool === 'hand' || e.buttons === 4)) {
      const dx = screenPos.x - dragStart.x;
      const dy = screenPos.y - dragStart.y;
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setDragStart(screenPos);
      return;
    }

    if (currentTool === 'select' && selectedElementId && dragStart && elementInitialPos) {
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

    if (currentTool === 'eraser' && e.buttons === 1) {
      const hit = elements.slice().reverse().find((el) => isPointInsideElement(worldPos, el));
      if (hit) {
        const next = elements.filter((el) => el.id !== hit.id);
        pushToHistory(next);
        networkManagerRef.current?.broadcast({ type: 'element_delete', id: hit.id });
      }
      return;
    }

    if (currentTool === 'laser' && isDrawing) {
      const lp: LaserPoint = {
        x: worldPos.x,
        y: worldPos.y,
        timestamp: Date.now(),
        color: '#f43f5e',
        size: 8,
      };
      laserTrailsRef.current.push(lp);
      networkManagerRef.current?.broadcast({ type: 'laser_stroke', points: [lp] });
      return;
    }

    if (isDrawing) {
      setCurrentStroke((prev) => [...prev, worldPos]);
      lastMoveTimeRef.current = Date.now();

      if (autoShapeEnabled && (currentTool === 'pen' || currentTool === 'highlighter')) {
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        holdTimerRef.current = window.setTimeout(() => {
          triggerAutoShapeSnap();
        }, 420);
      }
    }
  };

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
        points: currentShape === 'line' || currentShape === 'arrow' ? [p0, pn] : undefined,
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
          timestamp: Date.now(),
        };

        imageCacheRef.current.set(imgElement.id, img);
        pushToHistory([...elements, imgElement]);
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
      version: 1,
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
            currentTool === 'hand' || isSpacePressed.current
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
        onToolChange={setCurrentTool}
        onShapeChange={setCurrentShape}
        onColorChange={setColor}
        onStrokeWidthChange={setStrokeWidth}
        onToggleAutoShape={() => setAutoShapeEnabled((prev) => !prev)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onImageUpload={handleImageUpload}
        onClearCanvas={handleClearCanvas}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
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

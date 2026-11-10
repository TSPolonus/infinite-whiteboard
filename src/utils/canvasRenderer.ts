import type {
  CanvasElement,
  StrokeElement,
  ShapeElement,
  ImageElement,
  ViewportTransform,
  LaserPoint,
  RemoteCursor,
  Point,
} from '../types';

export type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'rotate';

export function screenToWorld(
  screenX: number,
  screenY: number,
  transform: ViewportTransform
): Point {
  return {
    x: (screenX - transform.x) / transform.scale,
    y: (screenY - transform.y) / transform.scale,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  transform: ViewportTransform
): Point {
  return {
    x: worldX * transform.scale + transform.x,
    y: worldY * transform.scale + transform.y,
  };
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  transform: ViewportTransform,
  gridType: 'dots' | 'lines' | 'none',
  gridSize: number = 32,
  isDark: boolean = false
) {
  if (gridType === 'none') return;

  ctx.save();
  const scaledGrid = gridSize * transform.scale;

  if (scaledGrid < 10) {
    ctx.restore();
    return;
  }

  const offsetX = ((transform.x % scaledGrid) + scaledGrid) % scaledGrid;
  const offsetY = ((transform.y % scaledGrid) + scaledGrid) % scaledGrid;

  const color = isDark
    ? gridType === 'dots'
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(255, 255, 255, 0.08)'
    : gridType === 'dots'
    ? 'rgba(0, 0, 0, 0.12)'
    : 'rgba(0, 0, 0, 0.07)';

  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  if (gridType === 'dots') {
    const dotRadius = Math.max(1, Math.min(2.5, 1.2 * transform.scale));
    for (let x = offsetX; x < width; x += scaledGrid) {
      for (let y = offsetY; y < height; y += scaledGrid) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (gridType === 'lines') {
    ctx.beginPath();
    for (let x = offsetX; x < width; x += scaledGrid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += scaledGrid) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeElement
) {
  if (stroke.points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;

  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = stroke.opacity || 0.40;
    ctx.lineWidth = stroke.size * 1.6;
  } else {
    ctx.globalAlpha = stroke.opacity || 1.0;
    ctx.lineWidth = stroke.size;
  }

  const points = stroke.points;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = stroke.color;
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  ctx.stroke();
  ctx.restore();
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeElement) {
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (shape.fillColor) {
    ctx.fillStyle = shape.fillColor;
  }

  const { x, y, width, height, shapeType, rotation = 0 } = shape;

  if (rotation !== 0) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.beginPath();

  switch (shapeType) {
    case 'rectangle': {
      ctx.rect(x, y, width, height);
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'circle': {
      ctx.beginPath();
      const rx = Math.abs(width) / 2;
      const ry = Math.abs(height) / 2;
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'triangle': {
      if (shape.points && shape.points.length >= 3) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        ctx.lineTo(shape.points[1].x, shape.points[1].y);
        ctx.lineTo(shape.points[2].x, shape.points[2].y);
        ctx.closePath();
      } else {
        ctx.moveTo(x + width / 2, y);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x, y + height);
        ctx.closePath();
      }
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'diamond': {
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width, y + height / 2);
      ctx.lineTo(x + width / 2, y + height);
      ctx.lineTo(x, y + height / 2);
      ctx.closePath();
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'hexagon': {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const rx = Math.abs(width) / 2;
      const ry = Math.abs(height) / 2;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + rx * Math.cos(angle);
        const py = cy + ry * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'star': {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const outerR = Math.min(Math.abs(width), Math.abs(height)) / 2;
      const innerR = outerR * 0.42;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'heart': {
      const topCurveHeight = height * 0.3;
      ctx.moveTo(x + width / 2, y + topCurveHeight);
      ctx.bezierCurveTo(x + width / 2, y, x, y, x, y + topCurveHeight);
      ctx.bezierCurveTo(
        x, y + (height + topCurveHeight) / 2,
        x + width / 2, y + (height + topCurveHeight) / 1.5,
        x + width / 2, y + height
      );
      ctx.bezierCurveTo(
        x + width / 2, y + (height + topCurveHeight) / 1.5,
        x + width, y + (height + topCurveHeight) / 2,
        x + width, y + topCurveHeight
      );
      ctx.bezierCurveTo(x + width, y, x + width / 2, y, x + width / 2, y + topCurveHeight);
      ctx.closePath();
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'speech_bubble': {
      const r = Math.min(16, Math.abs(width) / 5, Math.abs(height) / 5);
      const bubbleH = height * 0.8;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + bubbleH - r);
      ctx.quadraticCurveTo(x + width, y + bubbleH, x + width - r, y + bubbleH);
      ctx.lineTo(x + width * 0.45, y + bubbleH);
      ctx.lineTo(x + width * 0.3, y + height);
      ctx.lineTo(x + width * 0.25, y + bubbleH);
      ctx.lineTo(x + r, y + bubbleH);
      ctx.quadraticCurveTo(x, y + bubbleH, x, y + bubbleH - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'line': {
      if (shape.points && shape.points.length >= 2) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        ctx.lineTo(shape.points[1].x, shape.points[1].y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y + height);
      }
      ctx.stroke();
      break;
    }
    case 'arrow': {
      const p1 = shape.points && shape.points[0] ? shape.points[0] : { x, y };
      const p2 =
        shape.points && shape.points[1] ? shape.points[1] : { x: x + width, y: y + height };
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const headLen = Math.max(14, shape.strokeWidth * 3.5);
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - headLen * Math.cos(angle - Math.PI / 6),
        p2.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - headLen * Math.cos(angle + Math.PI / 6),
        p2.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      break;
    }
    case 'double_arrow': {
      const p1 = shape.points && shape.points[0] ? shape.points[0] : { x, y };
      const p2 =
        shape.points && shape.points[1] ? shape.points[1] : { x: x + width, y: y + height };
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const headLen = Math.max(14, shape.strokeWidth * 3.5);

      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - headLen * Math.cos(angle - Math.PI / 6),
        p2.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - headLen * Math.cos(angle + Math.PI / 6),
        p2.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(
        p1.x + headLen * Math.cos(angle - Math.PI / 6),
        p1.y + headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(
        p1.x + headLen * Math.cos(angle + Math.PI / 6),
        p1.y + headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

export function drawImageElement(
  ctx: CanvasRenderingContext2D,
  imgElem: ImageElement,
  imageCache: Map<string, HTMLImageElement>
) {
  let img = imageCache.get(imgElem.id);
  if (!img) {
    img = new Image();
    img.src = imgElem.src;
    imageCache.set(imgElem.id, img);
  }

  ctx.save();
  const rotation = imgElem.rotation || 0;
  if (rotation !== 0) {
    const cx = imgElem.x + imgElem.width / 2;
    const cy = imgElem.y + imgElem.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, imgElem.x, imgElem.y, imgElem.width, imgElem.height);
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(imgElem.x, imgElem.y, imgElem.width, imgElem.height);
    ctx.fillRect(imgElem.x, imgElem.y, imgElem.width, imgElem.height);
  }
  ctx.restore();
}

// Synchronized, Smooth, Zero-Lag Laser Beam
export function drawLaserTrails(
  ctx: CanvasRenderingContext2D,
  laserPoints: LaserPoint[],
  now: number
) {
  if (laserPoints.length < 2) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const defaultDuration = 1500;

  // Pass 1: Semi-transparent outer beam
  for (let i = 1; i < laserPoints.length; i++) {
    const p1 = laserPoints[i - 1];
    const p2 = laserPoints[i];
    const duration = p2.duration || defaultDuration;
    // Compute age using receivedAt if present to eliminate cross-screen clock skew!
    const age = now - (p2.receivedAt || p2.timestamp);
    if (age >= duration || age < 0) continue;

    const progress = 1 - age / duration;
    const alpha = Math.pow(progress, 1.3);
    const laserColor = p2.color || '#f43f5e';
    const lineWidth = Math.max(2, (p2.size || 6) * 1.5 * progress);

    ctx.beginPath();
    ctx.strokeStyle = laserColor;
    ctx.globalAlpha = alpha * 0.35;
    ctx.lineWidth = lineWidth * 2.2;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // Pass 2: Bright core
  for (let i = 1; i < laserPoints.length; i++) {
    const p1 = laserPoints[i - 1];
    const p2 = laserPoints[i];
    const duration = p2.duration || defaultDuration;
    const age = now - (p2.receivedAt || p2.timestamp);
    if (age >= duration || age < 0) continue;

    const progress = 1 - age / duration;
    const alpha = Math.pow(progress, 1.2);
    const laserColor = p2.color || '#f43f5e';
    const coreWidth = Math.max(1.5, (p2.size || 6) * 0.7 * progress);

    ctx.beginPath();
    ctx.strokeStyle = laserColor;
    ctx.globalAlpha = alpha * 0.9;
    ctx.lineWidth = coreWidth;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(1, coreWidth * 0.45);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // Pulse tip
  const last = laserPoints[laserPoints.length - 1];
  const lastDuration = last.duration || defaultDuration;
  const lastAge = now - (last.receivedAt || last.timestamp);
  if (lastAge < lastDuration && lastAge >= 0) {
    const laserColor = last.color || '#f43f5e';
    const pulseAlpha = 1 - lastAge / lastDuration;
    const dotSize = Math.max(3, (last.size || 6) * 0.85);

    ctx.beginPath();
    ctx.arc(last.x, last.y, dotSize * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = laserColor;
    ctx.globalAlpha = pulseAlpha * 0.5;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(last.x, last.y, dotSize * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = pulseAlpha;
    ctx.fill();
  }

  ctx.restore();
}

// Marquee Selection Box (Multi-selection on PC & Tablet)
export function drawMarqueeBox(
  ctx: CanvasRenderingContext2D,
  p1: Point,
  p2: Point,
  transform: ViewportTransform
) {
  const minX = Math.min(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const width = Math.abs(p2.x - p1.x);
  const height = Math.abs(p2.y - p1.y);

  ctx.save();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.fillRect(minX, minY, width, height);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5 / transform.scale;
  ctx.setLineDash([4 / transform.scale, 4 / transform.scale]);
  ctx.strokeRect(minX, minY, width, height);
  ctx.restore();
}

// Multi-element or single-element selection box
export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  transform: ViewportTransform
) {
  if (elements.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of elements) {
    const bbox = getElementBBox(el);
    if (bbox) {
      if (bbox.minX < minX) minX = bbox.minX;
      if (bbox.minY < minY) minY = bbox.minY;
      if (bbox.maxX > maxX) maxX = bbox.maxX;
      if (bbox.maxY > maxY) maxY = bbox.maxY;
    }
  }

  if (minX === Infinity) return;

  const pad = 8;
  const x = minX - pad;
  const y = minY - pad;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;

  ctx.save();

  // If exactly one element has rotation
  const singleRotation = elements.length === 1 ? (elements[0] as any).rotation || 0 : 0;
  if (singleRotation !== 0) {
    const cx = minX + (maxX - minX) / 2;
    const cy = minY + (maxY - minY) / 2;
    ctx.translate(cx, cy);
    ctx.rotate((singleRotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5 / transform.scale;
  ctx.setLineDash([4 / transform.scale, 4 / transform.scale]);
  ctx.strokeRect(x, y, w, h);

  // Resize handles
  const handleSize = 10 / transform.scale;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0284c7';
  ctx.setLineDash([]);
  ctx.lineWidth = 2 / transform.scale;

  const handles = [
    { x: x, y: y },
    { x: x + w / 2, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h / 2 },
    { x: x + w, y: y + h },
    { x: x + w / 2, y: y + h },
    { x: x, y: y + h },
    { x: x, y: y + h / 2 },
  ];

  for (const hPos of handles) {
    ctx.fillRect(hPos.x - handleSize / 2, hPos.y - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(hPos.x - handleSize / 2, hPos.y - handleSize / 2, handleSize, handleSize);
  }

  // Top Rotation Handle
  const rotDist = 26 / transform.scale;
  const rotX = x + w / 2;
  const rotY = y - rotDist;

  ctx.beginPath();
  ctx.setLineDash([2 / transform.scale, 2 / transform.scale]);
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(rotX, rotY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(rotX, rotY, handleSize * 0.7, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

export function getCombinedBBox(elements: CanvasElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (elements.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const bbox = getElementBBox(el);
    if (bbox) {
      if (bbox.minX < minX) minX = bbox.minX;
      if (bbox.minY < minY) minY = bbox.minY;
      if (bbox.maxX > maxX) maxX = bbox.maxX;
      if (bbox.maxY > maxY) maxY = bbox.maxY;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

export function getHandleAtPoint(
  worldPos: Point,
  elements: CanvasElement[],
  transform: ViewportTransform
): ResizeHandle | null {
  const bbox = getCombinedBBox(elements);
  if (!bbox) return null;

  const pad = 8;
  const x = bbox.minX - pad;
  const y = bbox.minY - pad;
  const w = bbox.maxX - bbox.minX + pad * 2;
  const h = bbox.maxY - bbox.minY + pad * 2;
  const threshold = 16 / transform.scale;

  let testPos = worldPos;
  const rotation = elements.length === 1 ? (elements[0] as any).rotation || 0 : 0;
  if (rotation !== 0) {
    const cx = bbox.minX + (bbox.maxX - bbox.minX) / 2;
    const cy = bbox.minY + (bbox.maxY - bbox.minY) / 2;
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = worldPos.x - cx;
    const dy = worldPos.y - cy;
    testPos = {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  }

  const rotDist = 26 / transform.scale;
  const rotX = x + w / 2;
  const rotY = y - rotDist;
  if (Math.hypot(testPos.x - rotX, testPos.y - rotY) <= threshold) {
    return 'rotate';
  }

  const handles: { handle: ResizeHandle; x: number; y: number }[] = [
    { handle: 'tl', x: x, y: y },
    { handle: 't', x: x + w / 2, y: y },
    { handle: 'tr', x: x + w, y: y },
    { handle: 'r', x: x + w, y: y + h / 2 },
    { handle: 'br', x: x + w, y: y + h },
    { handle: 'b', x: x + w / 2, y: y + h },
    { handle: 'bl', x: x, y: y + h },
    { handle: 'l', x: x, y: y + h / 2 },
  ];

  for (const hPos of handles) {
    if (Math.hypot(testPos.x - hPos.x, testPos.y - hPos.y) <= threshold) {
      return hPos.handle;
    }
  }

  return null;
}

export function drawRemoteCursor(
  ctx: CanvasRenderingContext2D,
  cursor: RemoteCursor
) {
  ctx.save();
  ctx.fillStyle = cursor.color || '#3b82f6';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(cursor.x, cursor.y);
  ctx.lineTo(cursor.x + 14, cursor.y + 14);
  ctx.lineTo(cursor.x + 6, cursor.y + 15);
  ctx.lineTo(cursor.x, cursor.y + 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = '12px sans-serif';
  const tagPad = 4;
  const metrics = ctx.measureText(cursor.userName);
  const tagW = metrics.width + tagPad * 2;
  const tagH = 18;

  ctx.fillStyle = cursor.color || '#3b82f6';
  ctx.beginPath();
  ctx.roundRect(cursor.x + 14, cursor.y + 14, tagW, tagH, 4);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(cursor.userName, cursor.x + 14 + tagPad, cursor.y + 14 + 13);

  ctx.restore();
}

export function getElementBBox(element: CanvasElement): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (element.type === 'stroke') {
    if (element.points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of element.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  } else if (element.type === 'shape') {
    return {
      minX: Math.min(element.x, element.x + element.width),
      minY: Math.min(element.y, element.y + element.height),
      maxX: Math.max(element.x, element.x + element.width),
      maxY: Math.max(element.y, element.y + element.height),
    };
  } else if (element.type === 'image') {
    return {
      minX: element.x,
      minY: element.y,
      maxX: element.x + element.width,
      maxY: element.y + element.height,
    };
  }
  return null;
}

export function isPointInsideElement(point: Point, element: CanvasElement): boolean {
  const bbox = getElementBBox(element);
  if (!bbox) return false;
  const margin = 14;
  if (
    point.x < bbox.minX - margin ||
    point.x > bbox.maxX + margin ||
    point.y < bbox.minY - margin ||
    point.y > bbox.maxY + margin
  ) {
    return false;
  }

  if (element.type === 'image' || element.type === 'shape') {
    return true;
  }

  for (let i = 0; i < element.points.length - 1; i++) {
    const p1 = element.points[i];
    const p2 = element.points[i + 1];
    const d = distToSegment(point, p1, p2);
    if (d <= Math.max(14, element.size / 2 + 8)) {
      return true;
    }
  }

  return false;
}

export function isElementInsideBox(
  element: CanvasElement,
  p1: Point,
  p2: Point
): boolean {
  const bbox = getElementBBox(element);
  if (!bbox) return false;

  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  // Check intersection
  return (
    bbox.minX <= maxX &&
    bbox.maxX >= minX &&
    bbox.minY <= maxY &&
    bbox.maxY >= minY
  );
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

// Continuous Freehand Brush Eraser
export function eraseStrokePixels(
  stroke: StrokeElement,
  erasePoint: Point,
  radius: number
): StrokeElement[] {
  const newStrokes: StrokeElement[] = [];
  let currentSegment: Point[] = [];

  for (const p of stroke.points) {
    const d = Math.hypot(p.x - erasePoint.x, p.y - erasePoint.y);
    if (d > radius) {
      currentSegment.push(p);
    } else {
      if (currentSegment.length >= 2) {
        newStrokes.push({
          ...stroke,
          id: 'stroke_' + Math.random().toString(36).substring(2, 9),
          points: currentSegment,
        });
      }
      currentSegment = [];
    }
  }

  if (currentSegment.length >= 2) {
    newStrokes.push({
      ...stroke,
      id: 'stroke_' + Math.random().toString(36).substring(2, 9),
      points: currentSegment,
    });
  }

  return newStrokes;
}

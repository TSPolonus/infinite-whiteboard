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
  gridSize: number = 40,
  isDark: boolean = true
) {
  if (gridType === 'none') return;

  ctx.save();
  const scaledGrid = gridSize * transform.scale;

  if (scaledGrid < 12) {
    ctx.restore();
    return;
  }

  const offsetX = ((transform.x % scaledGrid) + scaledGrid) % scaledGrid;
  const offsetY = ((transform.y % scaledGrid) + scaledGrid) % scaledGrid;

  const color = isDark
    ? gridType === 'dots'
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(255, 255, 255, 0.07)'
    : gridType === 'dots'
    ? 'rgba(0, 0, 0, 0.15)'
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
  ctx.lineWidth = stroke.size;

  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = stroke.opacity || 0.45;
    ctx.lineWidth = stroke.size * 2.2;
    ctx.lineCap = 'square';
  } else {
    ctx.globalAlpha = stroke.opacity || 1.0;
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

  const { x, y, width, height, shapeType } = shape;

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
      const headLen = Math.max(12, shape.strokeWidth * 3.5);
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

  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, imgElem.x, imgElem.y, imgElem.width, imgElem.height);
  } else {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(imgElem.x, imgElem.y, imgElem.width, imgElem.height);
    ctx.fillRect(imgElem.x, imgElem.y, imgElem.width, imgElem.height);
    ctx.restore();
  }
}

export function drawLaserTrails(
  ctx: CanvasRenderingContext2D,
  laserPoints: LaserPoint[],
  now: number
) {
  if (laserPoints.length < 2) return;

  const MAX_AGE = 1400;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < laserPoints.length; i++) {
    const p1 = laserPoints[i - 1];
    const p2 = laserPoints[i];
    const age = now - p2.timestamp;
    if (age >= MAX_AGE) continue;

    const progress = 1 - age / MAX_AGE;
    const alpha = progress * 0.9;
    const width = p2.size * progress;

    ctx.beginPath();
    ctx.strokeStyle = p2.color || '#ff0055';
    ctx.globalAlpha = alpha * 0.35;
    ctx.lineWidth = width * 3;
    ctx.shadowColor = p2.color || '#ff0055';
    ctx.shadowBlur = 12;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(2, width * 0.6);
    ctx.shadowBlur = 0;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  const last = laserPoints[laserPoints.length - 1];
  const lastAge = now - last.timestamp;
  if (lastAge < MAX_AGE) {
    const pulseAlpha = 1 - lastAge / MAX_AGE;
    ctx.beginPath();
    ctx.arc(last.x, last.y, last.size * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = last.color || '#ff0055';
    ctx.globalAlpha = pulseAlpha * 0.8;
    ctx.shadowColor = last.color || '#ff0055';
    ctx.shadowBlur = 16;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(last.x, last.y, last.size * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = pulseAlpha;
    ctx.fill();
  }

  ctx.restore();
}

export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
  transform: ViewportTransform
) {
  const bbox = getElementBBox(element);
  if (!bbox) return;

  const pad = 6;
  const x = bbox.minX - pad;
  const y = bbox.minY - pad;
  const w = bbox.maxX - bbox.minX + pad * 2;
  const h = bbox.maxY - bbox.minY + pad * 2;

  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5 / transform.scale;
  ctx.setLineDash([4 / transform.scale, 4 / transform.scale]);
  ctx.strokeRect(x, y, w, h);

  const handleSize = 8 / transform.scale;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3b82f6';
  ctx.setLineDash([]);
  ctx.lineWidth = 2 / transform.scale;

  const corners = [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x, y: y + h },
    { x: x + w, y: y + h },
  ];

  for (const c of corners) {
    ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
  }

  ctx.restore();
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
  const margin = 12;
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
    if (d <= Math.max(12, element.size / 2 + 6)) {
      return true;
    }
  }

  return false;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

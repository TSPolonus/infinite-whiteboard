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

export type ResizeHandle =
  | 'tl'
  | 'tr'
  | 'bl'
  | 'br'
  | 't'
  | 'b'
  | 'l'
  | 'r'
  | 'rotate'
  | 'radius'
  | string;

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

export function getShapeVertices(shape: ShapeElement): Point[] | null {
  if (shape.points && shape.points.length >= 3) {
    return shape.points;
  }
  const { x, y, width, height, shapeType } = shape;
  if (shapeType === 'triangle') {
    return [
      { x: x + width / 2, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }
  if (shapeType === 'rectangle' || shapeType === 'square') {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }
  if (shapeType === 'diamond') {
    return [
      { x: x + width / 2, y },
      { x: x + width, y: y + height / 2 },
      { x: x + width / 2, y: y + height },
      { x, y: y + height / 2 },
    ];
  }
  if (shapeType === 'trapezoid') {
    return [
      { x: x + width * 0.2, y },
      { x: x + width * 0.8, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }
  if (shapeType === 'parallelogram') {
    return [
      { x: x + width * 0.25, y },
      { x: x + width, y },
      { x: x + width * 0.75, y: y + height },
      { x, y: y + height },
    ];
  }
  if (shapeType === 'hexagon') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = Math.abs(width) / 2;
    const ry = Math.abs(height) / 2;
    const pts: Point[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      pts.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
    }
    return pts;
  }
  return null;
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

  // If shape has custom polygon vertices (triangle, square, rect, trapezoid, parallelogram, polygon, etc.)
  if (
    shape.points &&
    shape.points.length >= 3 &&
    shapeType !== 'line' &&
    shapeType !== 'arrow' &&
    shapeType !== 'double_arrow' &&
    shapeType !== 'circle' &&
    shapeType !== 'ellipse'
  ) {
    ctx.beginPath();
    ctx.moveTo(shape.points[0].x, shape.points[0].y);
    for (let i = 1; i < shape.points.length; i++) {
      ctx.lineTo(shape.points[i].x, shape.points[i].y);
    }
    ctx.closePath();
    if (shape.fillColor) ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();

  switch (shapeType) {
    case 'square': {
      const size = Math.min(Math.abs(width), Math.abs(height));
      ctx.rect(x, y, size, size);
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'rectangle': {
      ctx.rect(x, y, width, height);
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'circle':
    case 'ellipse': {
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
    case 'trapezoid': {
      ctx.moveTo(x + width * 0.2, y);
      ctx.lineTo(x + width * 0.8, y);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'parallelogram': {
      ctx.moveTo(x + width * 0.25, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width * 0.75, y + height);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      if (shape.fillColor) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'polygon': {
      if (shape.points && shape.points.length >= 3) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        ctx.closePath();
        if (shape.fillColor) ctx.fill();
        ctx.stroke();
      }
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

// Cache offscreen canvases for pixel-grid rendered images
const pixelCanvasCache = new Map<string, HTMLCanvasElement>();

export function drawImageElement(
  ctx: CanvasRenderingContext2D,
  imgElem: ImageElement,
  imageCache: Map<string, HTMLImageElement | HTMLCanvasElement>
) {
  ctx.save();
  const rotation = imgElem.rotation || 0;
  if (rotation !== 0) {
    const cx = imgElem.x + imgElem.width / 2;
    const cy = imgElem.y + imgElem.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  // 1. Direct In-Memory HTMLCanvasElement (fastest, zero lag, immune to base64 decoding on tablets!)
  const cachedSource = imageCache.get(imgElem.id);
  if (cachedSource instanceof HTMLCanvasElement) {
    ctx.drawImage(cachedSource, imgElem.x, imgElem.y, imgElem.width, imgElem.height);
    ctx.restore();
    return;
  }

  // 1. Pixel-by-pixel drawn image (100% data-safe, immune to WebRTC buffer & image loading issues)
  if (imgElem.pixels) {
    let offscreen = pixelCanvasCache.get(imgElem.id);
    if (!offscreen) {
      // Decode "W,H,data" (obsługuje zarówno nowszy, ostry format Base64 RGB jak i format Hex)
      const firstComma = imgElem.pixels.indexOf(',');
      const secondComma = imgElem.pixels.indexOf(',', firstComma + 1);
      if (firstComma !== -1 && secondComma !== -1) {
        const gridW = parseInt(imgElem.pixels.substring(0, firstComma), 10);
        const gridH = parseInt(imgElem.pixels.substring(firstComma + 1, secondComma), 10);
        const rawPayload = imgElem.pixels.substring(secondComma + 1);

        offscreen = document.createElement('canvas');
        offscreen.width = gridW;
        offscreen.height = gridH;
        const offCtx = offscreen.getContext('2d');
        if (offCtx) {
          const imgData = offCtx.createImageData(gridW, gridH);
          const data = imgData.data;

          // Sprawdzenie czy format to Base64 czy Hex
          const isBase64 = !/^[0-9a-fA-F]+$/.test(rawPayload) || rawPayload.includes('=') || rawPayload.length === Math.ceil((gridW * gridH * 3) / 3) * 4;

          if (isBase64) {
            try {
              const binStr = atob(rawPayload);
              let byteIdx = 0;
              const totalPixels = gridW * gridH;
              for (let p = 0; p < totalPixels && byteIdx + 2 < binStr.length; p++) {
                const dIdx = p * 4;
                data[dIdx] = binStr.charCodeAt(byteIdx++);     // R
                data[dIdx + 1] = binStr.charCodeAt(byteIdx++); // G
                data[dIdx + 2] = binStr.charCodeAt(byteIdx++); // B
                data[dIdx + 3] = 255;
              }
            } catch (err) {
              console.warn('Błąd dekodowania pikseli base64:', err);
            }
          } else {
            // Hex fallback
            let hexIdx = 0;
            const totalPixels = gridW * gridH;
            for (let p = 0; p < totalPixels && hexIdx + 5 < rawPayload.length; p++) {
              const r = parseInt(rawPayload.substring(hexIdx, hexIdx + 2), 16) || 0;
              const g = parseInt(rawPayload.substring(hexIdx + 2, hexIdx + 4), 16) || 0;
              const b = parseInt(rawPayload.substring(hexIdx + 4, hexIdx + 6), 16) || 0;
              const dIdx = p * 4;
              data[dIdx] = r;
              data[dIdx + 1] = g;
              data[dIdx + 2] = b;
              data[dIdx + 3] = 255;
              hexIdx += 6;
            }
          }

          offCtx.putImageData(imgData, 0, 0);
          pixelCanvasCache.set(imgElem.id, offscreen);
        }
      }
    }

    if (offscreen) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, imgElem.x, imgElem.y, imgElem.width, imgElem.height);
      ctx.restore();
      return;
    }
  }

  // 2. Fallback to classic src Image
  if (imgElem.src) {
    let img = imageCache.get(imgElem.id);
    if (!img) {
      img = new Image();
      img.src = imgElem.src;
      imageCache.set(imgElem.id, img);
    }

    if (img instanceof HTMLImageElement) {
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, imgElem.x, imgElem.y, imgElem.width, imgElem.height);
        ctx.restore();
        return;
      }
    } else if (img instanceof HTMLCanvasElement) {
      ctx.drawImage(img, imgElem.x, imgElem.y, imgElem.width, imgElem.height);
      ctx.restore();
      return;
    }
  }

  // Placeholder while loading
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(imgElem.x, imgElem.y, imgElem.width, imgElem.height);
  ctx.fillRect(imgElem.x, imgElem.y, imgElem.width, imgElem.height);
  ctx.restore();
}

// Synchronized, Smooth, Ultra-Vivid Laser Beam (Widoczny i wyrazisty u wszystkich uczestników)
export function drawLaserTrails(
  ctx: CanvasRenderingContext2D,
  laserPoints: LaserPoint[],
  now: number
) {
  if (laserPoints.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const defaultDuration = 2400;

  // Rysowanie segmentów linii
  for (let i = 1; i < laserPoints.length; i++) {
    const p1 = laserPoints[i - 1];
    const p2 = laserPoints[i];
    if (p2.break) continue;

    const duration = p2.duration || defaultDuration;
    const age = now - (p2.receivedAt || p2.timestamp);
    if (age >= duration || age < 0) continue;

    const progress = 1 - age / duration;
    const alpha = Math.pow(progress, 1.1);
    const laserColor = p2.color || '#f43f5e';
    const baseSize = Math.max(4, p2.size || 8);
    const outerWidth = baseSize * 2.6 * progress;
    const innerWidth = Math.max(2, baseSize * 1.1 * progress);
    const coreWidth = Math.max(1.5, baseSize * 0.5 * progress);

    // Warstwa 1: Szeroka neonowa poświata (zewnętrzna aura)
    ctx.beginPath();
    ctx.strokeStyle = laserColor;
    ctx.globalAlpha = alpha * 0.45;
    ctx.lineWidth = outerWidth;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Warstwa 2: Nasycony rdzeń koloru lasera
    ctx.beginPath();
    ctx.strokeStyle = laserColor;
    ctx.globalAlpha = alpha * 0.95;
    ctx.lineWidth = innerWidth;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Warstwa 3: Biały gorący środek (dający efekt prawdziwego lasera)
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = alpha * 0.95;
    ctx.lineWidth = coreWidth;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // Rysowanie świecących głowic / punktów (wyraźna kropka lasera)
  for (let i = 0; i < laserPoints.length; i++) {
    const pt = laserPoints[i];
    // Rysuj kropkę na początku pociągnięcia lub na końcu
    const isHead = i === laserPoints.length - 1;
    if (!pt.break && !isHead && i % 4 !== 0) continue;

    const duration = pt.duration || defaultDuration;
    const age = now - (pt.receivedAt || pt.timestamp);
    if (age >= duration || age < 0) continue;

    const progress = 1 - age / duration;
    const alpha = Math.pow(progress, 1.1);
    const laserColor = pt.color || '#f43f5e';
    const dotRadius = Math.max(3, (pt.size || 8) * (isHead ? 1.4 : 0.8) * progress);

    // Poświata punktu
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, dotRadius * 2, 0, Math.PI * 2);
    ctx.fillStyle = laserColor;
    ctx.globalAlpha = alpha * 0.4;
    ctx.fill();

    // Kolorowy środek
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = laserColor;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fill();

    // Biały rdzeń
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, dotRadius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha;
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

  // SPECIAL INTERACTIVE HANDLES & ANNOTATIONS FOR SINGLE SHAPE
  if (elements.length === 1 && elements[0].type === 'shape') {
    const shape = elements[0] as ShapeElement;

    // A) Okrąg: Interactive Radius Handle & Dimension Label
    if (shape.shapeType === 'circle') {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const r = shape.width / 2;
      const hx = cx + r;
      const hy = cy;

      // Radius line
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5 / transform.scale;
      ctx.setLineDash([3 / transform.scale, 3 / transform.scale]);
      ctx.moveTo(cx, cy);
      ctx.lineTo(hx, hy);
      ctx.stroke();

      // Center point
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.arc(cx, cy, 3.5 / transform.scale, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();

      // Interactive Radius Handle (punkt kontrolny promienia)
      const radHandleSize = 8.5 / transform.scale;
      ctx.beginPath();
      ctx.arc(hx, hy, radHandleSize, 0, Math.PI * 2);
      ctx.fillStyle = '#0284c7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / transform.scale;
      ctx.stroke();

      // Text "R" inside handle
      ctx.font = `bold ${Math.max(8, Math.round(9 / transform.scale))}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('R', hx, hy);

      // Radius dimension badge above line
      const badgeText = `R = ${Math.round(r)} px`;
      const badgeX = cx + r / 2;
      const badgeY = cy - 13 / transform.scale;
      ctx.font = `bold ${Math.max(9, Math.round(11 / transform.scale))}px sans-serif`;
      const textWidth = ctx.measureText(badgeText).width;
      const padH = 5 / transform.scale;
      const padV = 2.5 / transform.scale;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1 / transform.scale;
      ctx.beginPath();
      ctx.rect(badgeX - textWidth / 2 - padH, badgeY - 7 / transform.scale - padV, textWidth + padH * 2, 14 / transform.scale + padV * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(badgeText, badgeX, badgeY);
    }

    // B) Wielokąty: Punkty zaczepu na każdy róg i informacje o kątach między bokami!
    const vertices = getShapeVertices(shape);
    if (vertices && vertices.length >= 3 && shape.shapeType !== 'circle' && shape.shapeType !== 'ellipse') {
      const N = vertices.length;
      const handleR = 7.5 / transform.scale;

      for (let i = 0; i < N; i++) {
        const pCurr = vertices[i];
        const pPrev = vertices[(i - 1 + N) % N];
        const pNext = vertices[(i + 1) % N];

        // Oblicz kąt przy tym wierzchołku
        const a1 = Math.atan2(pPrev.y - pCurr.y, pPrev.x - pCurr.x);
        const a2 = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
        let angleDeg = Math.round(Math.abs(a1 - a2) * (180 / Math.PI));
        if (angleDeg > 180) angleDeg = 360 - angleDeg;

        // Łuk kąta przy narożniku
        const arcR = 15 / transform.scale;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = 1.5 / transform.scale;
        ctx.setLineDash([2 / transform.scale, 2 / transform.scale]);
        ctx.arc(pCurr.x, pCurr.y, arcR, Math.min(a1, a2), Math.max(a1, a2));
        ctx.stroke();
        ctx.setLineDash([]);

        // Etykieta kąta w stopniach (np. 90°, 60°, 120°)
        const angleText = `${angleDeg}°`;
        ctx.font = `bold ${Math.max(9, Math.round(10 / transform.scale))}px sans-serif`;
        const tWidth = ctx.measureText(angleText).width;

        let bisect = (a1 + a2) / 2;
        if (Math.abs(a1 - a2) > Math.PI) bisect += Math.PI;
        const badgeDist = 24 / transform.scale;
        const bx = pCurr.x + Math.cos(bisect) * badgeDist;
        const by = pCurr.y + Math.sin(bisect) * badgeDist;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1 / transform.scale;
        ctx.beginPath();
        ctx.rect(bx - tWidth / 2 - 3 / transform.scale, by - 6 / transform.scale, tWidth + 6 / transform.scale, 13 / transform.scale);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(angleText, bx, by);

        // Punkt zaczepu na róg (Corner Anchor Point)
        ctx.beginPath();
        ctx.arc(pCurr.x, pCurr.y, handleR, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2.5 / transform.scale;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pCurr.x, pCurr.y, handleR * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
      }
    }
  }

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
  const threshold = 16 / transform.scale;

  // 1. Sprawdź punkt zaczepu promienia dla pojedynczego okręgu
  if (elements.length === 1 && elements[0].type === 'shape') {
    const shape = elements[0] as ShapeElement;
    if (shape.shapeType === 'circle') {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const r = shape.width / 2;
      if (Math.hypot(worldPos.x - (cx + r), worldPos.y - cy) <= threshold * 1.35) {
        return 'radius';
      }
    }

    // 2. Sprawdź punkty zaczepu na rogi dla wielokątów
    const vertices = getShapeVertices(shape);
    if (vertices && vertices.length >= 3 && shape.shapeType !== 'circle' && shape.shapeType !== 'ellipse') {
      for (let i = 0; i < vertices.length; i++) {
        if (Math.hypot(worldPos.x - vertices[i].x, worldPos.y - vertices[i].y) <= threshold * 1.35) {
          return `vertex_${i}`;
        }
      }
    }
  }

  const bbox = getCombinedBBox(elements);
  if (!bbox) return null;

  const pad = 8;
  const x = bbox.minX - pad;
  const y = bbox.minY - pad;
  const w = bbox.maxX - bbox.minX + pad * 2;
  const h = bbox.maxY - bbox.minY + pad * 2;

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

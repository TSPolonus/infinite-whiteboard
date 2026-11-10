import type { Point, ShapeType } from '../types';

function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += distance(points[i - 1], points[i]);
  }
  return len;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return distance(p, proj);
}

function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [start, end];
  }
}

// Obliczenie kąta w wierzchołku p2 między (p1->p2) a (p2->p3) w stopniach (0 do 180)
export function getVertexAngle(p1: Point, p2: Point, p3: Point): number {
  const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
  const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
  let angle = Math.abs(a1 - a2) * (180 / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

// Precyzyjne wykrywanie rzeczywistych narożników (ostrych skrętów) w narysowanym kształcie
function detectRealCorners(points: Point[], bboxDiag: number): { idx: number; pt: Point; angle: number }[] {
  const n = points.length;
  if (n < 8) return [];
  const stepDist = Math.max(10, Math.min(35, bboxDiag * 0.075));

  function findIndexAtDist(startIdx: number, dir: number): number {
    let d = 0;
    let curr = startIdx;
    while (d < stepDist) {
      const next = (curr + dir + n) % n;
      if (next === startIdx) break;
      d += Math.hypot(points[next].x - points[curr].x, points[next].y - points[curr].y);
      curr = next;
    }
    return curr;
  }

  const angles: number[] = [];
  for (let i = 0; i < n; i++) {
    const prevIdx = findIndexAtDist(i, -1);
    const nextIdx = findIndexAtDist(i, 1);
    const pPrev = points[prevIdx];
    const pCurr = points[i];
    const pNext = points[nextIdx];

    const a1 = Math.atan2(pPrev.y - pCurr.y, pPrev.x - pCurr.x);
    const a2 = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
    let angle = Math.abs(a1 - a2) * (180 / Math.PI);
    if (angle > 180) angle = 360 - angle;
    angles.push(angle);
  }

  const corners: { idx: number; pt: Point; angle: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = angles[i];
    if (a < 132) {
      let isMin = true;
      for (let j = -4; j <= 4; j++) {
        if (j !== 0 && angles[(i + j + n) % n] < a) {
          isMin = false;
          break;
        }
      }
      if (isMin) {
        if (!corners.some((c) => Math.hypot(points[i].x - c.pt.x, points[i].y - c.pt.y) < stepDist * 1.4)) {
          corners.push({ idx: i, pt: points[i], angle: Math.round(a) });
        }
      }
    }
  }
  return corners;
}

export interface DetectedShapeResult {
  shapeType: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Point[];
}

export function detectShape(rawPoints: Point[]): DetectedShapeResult | null {
  if (rawPoints.length < 5) return null;

  // 1. Filtrowanie mikroskopijnych drgań rysika / palca
  const points: Point[] = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length; i++) {
    if (distance(rawPoints[i], points[points.length - 1]) >= 3) {
      points.push(rawPoints[i]);
    }
  }

  if (points.length < 5) return null;

  const totalLen = pathLength(points);
  if (totalLen < 25) return null;

  const p0 = points[0];
  const pn = points[points.length - 1];
  const startEndDist = distance(p0, pn);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let sumX = 0, sumY = 0;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    sumX += p.x;
    sumY += p.y;
  }

  const width = Math.max(maxX - minX, 12);
  const height = Math.max(maxY - minY, 12);
  const bboxDiagonal = Math.sqrt(width * width + height * height);
  const cx = sumX / points.length;
  const cy = sumY / points.length;

  // Warunek zamknięcia ścieżki
  const isClosed = startEndDist < Math.max(50, bboxDiagonal * 0.38, totalLen * 0.32);

  // 2. ŚCIEŻKA OTWARTA: Prosta Linia lub Strzałka
  if (!isClosed) {
    let maxLineDist = 0;
    for (const p of points) {
      const d = distanceToSegment(p, p0, pn);
      if (d > maxLineDist) maxLineDist = d;
    }

    if (maxLineDist < Math.max(16, startEndDist * 0.18)) {
      return {
        shapeType: 'line',
        x: Math.min(p0.x, pn.x),
        y: Math.min(p0.y, pn.y),
        width: Math.abs(pn.x - p0.x),
        height: Math.abs(pn.y - p0.y),
        points: [p0, pn],
      };
    }

    // Sprawdź grot strzałki
    const simp = rdp(points, bboxDiagonal * 0.08);
    if (simp.length >= 3 && simp.length <= 6) {
      const pStemStart = simp[0];
      const pTip = simp[simp.length - 2];
      const pWing = simp[simp.length - 1];
      const stemDist = distance(pStemStart, pTip);
      const wingDist = distance(pTip, pWing);
      if (stemDist > wingDist * 1.5 && wingDist < bboxDiagonal * 0.45) {
        return {
          shapeType: 'arrow',
          x: Math.min(pStemStart.x, pTip.x),
          y: Math.min(pStemStart.y, pTip.y),
          width: Math.abs(pTip.x - pStemStart.x),
          height: Math.abs(pTip.y - pStemStart.y),
          points: [pStemStart, pTip],
        };
      }
    }

    return null;
  }

  // 3. ŚCIEŻKA ZAMKNIĘTA: Oblicz cechy okrągłości i wykryj rzeczywiste wierzchołki
  const radii = points.map((p) => distance(p, { x: cx, y: cy }));
  const avgRadius = radii.reduce((acc, r) => acc + r, 0) / radii.length;
  const radiusVariance = radii.reduce((acc, r) => acc + Math.abs(r - avgRadius), 0) / radii.length;
  const circleRatio = radiusVariance / (avgRadius || 1);
  const aspect = width / height;

  // Sprawdź odchylenie od elipsy
  const a = Math.max(width / 2, 1);
  const b = Math.max(height / 2, 1);
  let ellipseDev = 0;
  for (const p of points) {
    const normDist = ((p.x - cx) ** 2) / (a * a) + ((p.y - cy) ** 2) / (b * b);
    ellipseDev += Math.abs(normDist - 1);
  }
  const avgEllipseDev = ellipseDev / points.length;

  // Wykryj rzeczywiste ostre rogi (wierzchołki)
  const realCorners = detectRealCorners(points, bboxDiagonal);

  // 4. OKRĄG (CIRCLE): brak ostrych narożników (0 lub 1) i niska wariancja promienia
  // Użytkownik: "Okrąg nie ma kątów. Jeżeli coś nie ma kątów, to nie rób mi z tego trójkąta ani kwadratu"
  if (realCorners.length <= 1) {
    if (aspect >= 0.70 && aspect <= 1.42 && circleRatio < 0.18) {
      const r = (width + height) / 4;
      return {
        shapeType: 'circle',
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        points: [
          { x: cx, y: cy },
          { x: cx + r, y: cy },
        ],
      };
    }
    // Owal / Elipsa
    if (avgEllipseDev < 0.28 || circleRatio < 0.26) {
      return {
        shapeType: 'ellipse',
        x: minX,
        y: minY,
        width,
        height,
      };
    }
  }

  // 5. TRÓJKĄT (TRIANGLE): dokładnie 3 wierzchołki (kąty)
  if (realCorners.length === 3) {
    const triPoints = realCorners.map((c) => c.pt);
    return {
      shapeType: 'triangle',
      x: minX,
      y: minY,
      width,
      height,
      points: triPoints,
    };
  }

  // 6. CZWOROKĄT (QUADRILATERAL: Kwadrat, Prostokąt, Romb, Równoległobok, Trapez)
  if (realCorners.length === 4) {
    const quad = realCorners.map((c) => c.pt);

    const angles = quad.map((curr, idx) => {
      const prev = quad[(idx - 1 + 4) % 4];
      const next = quad[(idx + 1) % 4];
      return getVertexAngle(prev, curr, next);
    });

    const isRectangular = angles.every((ang) => ang >= 65 && ang <= 118);

    // Kwadrat (Square)
    if (isRectangular && aspect >= 0.80 && aspect <= 1.25) {
      const size = Math.round((width + height) / 2);
      return {
        shapeType: 'square',
        x: cx - size / 2,
        y: cy - size / 2,
        width: size,
        height: size,
        points: [
          { x: cx - size / 2, y: cy - size / 2 },
          { x: cx + size / 2, y: cy - size / 2 },
          { x: cx + size / 2, y: cy + size / 2 },
          { x: cx - size / 2, y: cy + size / 2 },
        ],
      };
    }

    // Prostokąt (Rectangle)
    if (isRectangular) {
      return {
        shapeType: 'rectangle',
        x: minX,
        y: minY,
        width,
        height,
        points: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
      };
    }

    // Romb (Diamond)
    const midX = minX + width / 2;
    const midY = minY + height / 2;
    let nearMidCount = 0;
    for (const v of quad) {
      if (Math.abs(v.x - midX) < width * 0.22 || Math.abs(v.y - midY) < height * 0.22) {
        nearMidCount++;
      }
    }
    if (nearMidCount >= 3) {
      return {
        shapeType: 'diamond',
        x: minX,
        y: minY,
        width,
        height,
        points: [
          { x: midX, y: minY },
          { x: maxX, y: midY },
          { x: midX, y: maxY },
          { x: minX, y: midY },
        ],
      };
    }

    // Równoległobok lub Trapez
    return {
      shapeType: 'polygon',
      x: minX,
      y: minY,
      width,
      height,
      points: quad,
    };
  }

  // 7. PIĘCIOKĄT (PENTAGON): dokładnie 5 wierzchołków
  if (realCorners.length === 5) {
    return {
      shapeType: 'polygon',
      x: minX,
      y: minY,
      width,
      height,
      points: realCorners.map((c) => c.pt),
    };
  }

  // 8. SZEŚCIOKĄT (HEXAGON): dokładnie 6 wierzchołków
  if (realCorners.length === 6) {
    return {
      shapeType: 'hexagon',
      x: minX,
      y: minY,
      width,
      height,
      points: realCorners.map((c) => c.pt),
    };
  }

  // 9. GWIAZDA (STAR): 5 do 10 naprzemiennych wierzchołków
  if (realCorners.length >= 7 && realCorners.length <= 10) {
    const dFromCenter = realCorners.map((c) => distance(c.pt, { x: cx, y: cy }));
    const maxR = Math.max(...dFromCenter);
    const minR = Math.min(...dFromCenter);
    if (minR / (maxR || 1) < 0.65) {
      return {
        shapeType: 'star',
        x: minX,
        y: minY,
        width,
        height,
      };
    }
  }

  // 10. BEZPIECZNY FALLBACK: Jeśli kształt ma małe odchylenie radialne -> to okrąg!
  if (circleRatio < 0.18 && aspect >= 0.70 && aspect <= 1.40) {
    const r = (width + height) / 4;
    return {
      shapeType: 'circle',
      x: cx - r,
      y: cy - r,
      width: r * 2,
      height: r * 2,
      points: [
        { x: cx, y: cy },
        { x: cx + r, y: cy },
      ],
    };
  }

  // Jeśli ma wykryte narożniki >= 3 -> wielokąt
  if (realCorners.length >= 3) {
    return {
      shapeType: 'polygon',
      x: minX,
      y: minY,
      width,
      height,
      points: realCorners.map((c) => c.pt),
    };
  }

  // W przeciwnym razie okrąg lub owal
  if (circleRatio < 0.28) {
    const r = (width + height) / 4;
    return {
      shapeType: 'circle',
      x: cx - r,
      y: cy - r,
      width: r * 2,
      height: r * 2,
      points: [
        { x: cx, y: cy },
        { x: cx + r, y: cy },
      ],
    };
  }

  return null;
}

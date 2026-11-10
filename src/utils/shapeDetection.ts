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

// Calculate angle at vertex p2 between (p1->p2) and (p2->p3) in degrees (0 to 180)
export function getVertexAngle(p1: Point, p2: Point, p3: Point): number {
  const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
  const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
  let angle = Math.abs(a1 - a2) * (180 / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
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

  // 1. Filter out micro-jitter from finger/stylus
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

  // Closed threshold: start is close to end
  const isClosed = startEndDist < Math.max(50, bboxDiagonal * 0.38, totalLen * 0.32);

  // 2. OPEN PATH: Straight Line or Arrow
  if (!isClosed) {
    let maxLineDist = 0;
    for (const p of points) {
      const d = distanceToSegment(p, p0, pn);
      if (d > maxLineDist) maxLineDist = d;
    }

    if (maxLineDist < Math.max(16, startEndDist * 0.18)) {
      return {
        shapeType: 'line',
        x: p0.x,
        y: p0.y,
        width: pn.x - p0.x,
        height: pn.y - p0.y,
        points: [p0, pn],
      };
    }

    // Check for arrow tip
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
          x: pStemStart.x,
          y: pStemStart.y,
          width: pTip.x - pStemStart.x,
          height: pTip.y - pStemStart.y,
          points: [pStemStart, pTip],
        };
      }
    }

    return null;
  }

  // 3. CORNER DETECTION VIA ADAPTIVE RDP SIMPLIFICATION
  const epsilon = Math.max(9, bboxDiagonal * 0.068);
  const simplified = rdp(points, epsilon);

  // Clean vertices that are too close to each other
  const vertices: Point[] = [simplified[0]];
  for (let i = 1; i < simplified.length; i++) {
    if (distance(simplified[i], vertices[vertices.length - 1]) > bboxDiagonal * 0.085) {
      vertices.push(simplified[i]);
    }
  }

  // If last vertex is close to first, merge
  if (vertices.length > 2 && distance(vertices[0], vertices[vertices.length - 1]) < bboxDiagonal * 0.15) {
    vertices.pop();
  }

  // Count sharp corners (angle < 128 deg)
  const sharpCorners: { pt: Point; angle: number; index: number }[] = [];
  const vCount = vertices.length;
  if (vCount >= 3) {
    for (let i = 0; i < vCount; i++) {
      const pPrev = vertices[(i - 1 + vCount) % vCount];
      const pCurr = vertices[i];
      const pNext = vertices[(i + 1) % vCount];
      const angle = getVertexAngle(pPrev, pCurr, pNext);
      if (angle < 128) {
        sharpCorners.push({ pt: pCurr, angle, index: i });
      }
    }
  }

  // 4. TRÓJKĄT (TRIANGLE): Exactly 3 sharp corners or 3 simplified vertices
  if (sharpCorners.length === 3 || (vCount === 3 && isClosed)) {
    const triPoints = sharpCorners.length === 3 ? sharpCorners.map((c) => c.pt) : vertices.slice(0, 3);
    return {
      shapeType: 'triangle',
      x: minX,
      y: minY,
      width,
      height,
      points: triPoints,
    };
  }

  // 5. CZWOROKĄTY (QUADRILATERALS: Kwadrat, Prostokąt, Romb, Trapez, Równoległobok)
  if (sharpCorners.length === 4 || (vCount === 4 && isClosed)) {
    const quad = sharpCorners.length === 4 ? sharpCorners.map((c) => c.pt) : vertices.slice(0, 4);

    // Compute 4 corner angles
    const angles = quad.map((curr, idx) => {
      const prev = quad[(idx - 1 + 4) % 4];
      const next = quad[(idx + 1) % 4];
      return getVertexAngle(prev, curr, next);
    });

    const isRectangular = angles.every((a) => a >= 65 && a <= 115);
    const aspect = width / height;

    // Kwadrat (Square): rectangular + aspect ratio roughly 1:1
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

    // Prostokąt (Rectangle): rectangular angles
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

    // Romb (Diamond): vertices near midpoints of bounding box
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

    // Vectors of 4 sides: s0 (0->1), s1 (1->2), s2 (2->3), s3 (3->0)
    const s0 = { x: quad[1].x - quad[0].x, y: quad[1].y - quad[0].y };
    const s1 = { x: quad[2].x - quad[1].x, y: quad[2].y - quad[1].y };
    const s2 = { x: quad[3].x - quad[2].x, y: quad[3].y - quad[2].y };
    const s3 = { x: quad[0].x - quad[3].x, y: quad[0].y - quad[3].y };

    const angleBetweenVectors = (v1: Point, v2: Point) => {
      const mag1 = Math.hypot(v1.x, v1.y) || 1;
      const mag2 = Math.hypot(v2.x, v2.y) || 1;
      const dot = v1.x * v2.x + v1.y * v2.y;
      const cos = Math.max(-1, Math.min(1, Math.abs(dot) / (mag1 * mag2)));
      return Math.acos(cos) * (180 / Math.PI);
    };

    const s0_s2_parallel = angleBetweenVectors(s0, s2) < 24;
    const s1_s3_parallel = angleBetweenVectors(s1, s3) < 24;

    // Równoległobok (Parallelogram): both opposite pairs parallel
    if (s0_s2_parallel && s1_s3_parallel) {
      return {
        shapeType: 'parallelogram',
        x: minX,
        y: minY,
        width,
        height,
        points: quad,
      };
    }

    // Trapez (Trapezoid): exactly ONE pair parallel
    if (s0_s2_parallel || s1_s3_parallel) {
      return {
        shapeType: 'trapezoid',
        x: minX,
        y: minY,
        width,
        height,
        points: quad,
      };
    }

    // General 4-gon
    return {
      shapeType: 'polygon',
      x: minX,
      y: minY,
      width,
      height,
      points: quad,
    };
  }

  // 6. GWIAZDA (STAR): alternating inner/outer points (5 to 10 sharp corners)
  if (sharpCorners.length >= 5 && sharpCorners.length <= 10) {
    const dFromCenter = sharpCorners.map((c) => distance(c.pt, { x: cx, y: cy }));
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

  // 7. SZEŚCIOKĄT (HEXAGON): exactly 6 corners
  if (sharpCorners.length === 6 || vCount === 6) {
    return {
      shapeType: 'hexagon',
      x: minX,
      y: minY,
      width,
      height,
      points: vertices.length >= 6 ? vertices.slice(0, 6) : undefined,
    };
  }

  // 8. OKRĄG (CIRCLE) & OWAL / ELIPSA (ELLIPSE)
  // Only classified if there are no 3+ sharp polygon corners!
  const a = Math.max(width / 2, 1);
  const b = Math.max(height / 2, 1);
  let ellipseDev = 0;
  for (const p of points) {
    const normDist = ((p.x - cx) ** 2) / (a * a) + ((p.y - cy) ** 2) / (b * b);
    ellipseDev += Math.abs(normDist - 1);
  }
  const avgEllipseDev = ellipseDev / points.length;

  const radii = points.map((p) => distance(p, { x: cx, y: cy }));
  const avgRadius = radii.reduce((acc, r) => acc + r, 0) / radii.length;
  const radiusVariance = radii.reduce((acc, r) => acc + Math.abs(r - avgRadius), 0) / radii.length;
  const circleRatio = radiusVariance / (avgRadius || 1);

  if (isClosed && sharpCorners.length <= 2) {
    const aspect = width / height;
    if (aspect >= 0.76 && aspect <= 1.32 && circleRatio < 0.16) {
      // Okrąg (Circle)
      const r = (width + height) / 4;
      return {
        shapeType: 'circle',
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
      };
    }
    if (avgEllipseDev < 0.28 || circleRatio < 0.25) {
      // Owal / Elipsa (Ellipse)
      return {
        shapeType: 'ellipse',
        x: minX,
        y: minY,
        width,
        height,
      };
    }
  }

  // 9. INNY WIELOKĄT (General Polygon with 5+ corners)
  if (isClosed && vertices.length >= 5) {
    return {
      shapeType: 'polygon',
      x: minX,
      y: minY,
      width,
      height,
      points: vertices,
    };
  }

  // 10. FALLBACK FOR CLOSED SHAPES
  if (isClosed) {
    if (circleRatio < 0.18) {
      const r = (width + height) / 4;
      return {
        shapeType: 'circle',
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
      };
    }
    return {
      shapeType: 'polygon',
      x: minX,
      y: minY,
      width,
      height,
      points: vertices,
    };
  }

  return null;
}

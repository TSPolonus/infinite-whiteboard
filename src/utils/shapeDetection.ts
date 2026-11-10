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

// Calculate angle at vertex p2 between (p1->p2) and (p2->p3) in degrees
function getVertexAngle(p1: Point, p2: Point, p3: Point): number {
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

  // Filter out micro-jitter
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

  // Closed threshold
  const isClosed = startEndDist < Math.max(50, totalLen * 0.35);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const width = Math.max(maxX - minX, 12);
  const height = Math.max(maxY - minY, 12);
  const bboxDiagonal = Math.sqrt(width * width + height * height);

  // 1. OPEN PATH: Straight Line
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
  }

  // 2. CLOSED PATH: Detect sharp corners via RDP
  // Try simplification with adaptive epsilon
  const simplified = rdp(points, bboxDiagonal * 0.08);

  // Clean vertices that are too close to each other
  const vertices: Point[] = [simplified[0]];
  for (let i = 1; i < simplified.length; i++) {
    if (distance(simplified[i], vertices[vertices.length - 1]) > bboxDiagonal * 0.07) {
      vertices.push(simplified[i]);
    }
  }
  // If last vertex is close to first, merge
  if (vertices.length > 3 && distance(vertices[0], vertices[vertices.length - 1]) < bboxDiagonal * 0.15) {
    vertices.pop();
  }

  // Count sharp corners (angle < 135 deg)
  const sharpCorners: Point[] = [];
  const vCount = vertices.length;
  if (vCount >= 3) {
    for (let i = 0; i < vCount; i++) {
      const pPrev = vertices[(i - 1 + vCount) % vCount];
      const pCurr = vertices[i];
      const pNext = vertices[(i + 1) % vCount];
      const angle = getVertexAngle(pPrev, pCurr, pNext);
      if (angle < 138) {
        sharpCorners.push(pCurr);
      }
    }
  }

  // A) TRIANGLE: Exactly 3 sharp corners or 3-4 simplified vertices
  if (sharpCorners.length === 3 || (vCount === 3 && isClosed)) {
    let triPoints = sharpCorners.length === 3 ? sharpCorners : vertices.slice(0, 3);
    return {
      shapeType: 'triangle',
      x: minX,
      y: minY,
      width: width,
      height: height,
      points: triPoints,
    };
  }

  // B) DIAMOND or RECTANGLE: 4 sharp corners
  if (sharpCorners.length === 4 || vCount === 4) {
    const quad = sharpCorners.length === 4 ? sharpCorners : vertices;
    // Check if diamond (vertices near midpoints of bounding box)
    const midX = minX + width / 2;
    const midY = minY + height / 2;
    let diamondMatchCount = 0;
    for (const v of quad) {
      const nearMidX = Math.abs(v.x - midX) < width * 0.25;
      const nearMidY = Math.abs(v.y - midY) < height * 0.25;
      if (nearMidX || nearMidY) diamondMatchCount++;
    }

    if (diamondMatchCount >= 3 && Math.abs(width - height) < bboxDiagonal * 0.3) {
      return {
        shapeType: 'diamond',
        x: minX,
        y: minY,
        width: width,
        height: height,
      };
    }

    return {
      shapeType: 'rectangle',
      x: minX,
      y: minY,
      width: width,
      height: height,
    };
  }

  // C) STAR or HEXAGON: 5 to 8 corners
  if (sharpCorners.length === 5 || sharpCorners.length === 6) {
    if (sharpCorners.length === 6) {
      return {
        shapeType: 'hexagon',
        x: minX,
        y: minY,
        width: width,
        height: height,
      };
    } else {
      return {
        shapeType: 'star',
        x: minX,
        y: minY,
        width: width,
        height: height,
      };
    }
  }

  // D) CIRCLE / ELLIPSE:
  // Compute centroid and check radius variance.
  // A hand-drawn circle typically has circleRatio < 0.22 and few sharp corners.
  let sumX = 0, sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const cx = sumX / points.length;
  const cy = sumY / points.length;

  const radii = points.map((p) => distance(p, { x: cx, y: cy }));
  const avgRadius = radii.reduce((acc, r) => acc + r, 0) / radii.length;
  const radiusVariance =
    radii.reduce((acc, r) => acc + Math.abs(r - avgRadius), 0) / radii.length;
  const circleRatio = radiusVariance / avgRadius;

  // Also check that the path is reasonably closed (end close to start)
  // A circle should close back on itself
  const closedEnoughForCircle = startEndDist < Math.max(60, totalLen * 0.40);

  // Liberal circle condition: ratio < 0.22, isClosed, few sharp corners
  if (circleRatio < 0.22 && closedEnoughForCircle && sharpCorners.length < 3) {
    const aspect = width / height;
    if (aspect >= 0.65 && aspect <= 1.55) {
      // Roughly round → circle
      const r = (width + height) / 4;
      return {
        shapeType: 'circle',
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
      };
    } else {
      // Elongated → ellipse (still use 'circle' type but preserve aspect)
      return {
        shapeType: 'circle',
        x: minX,
        y: minY,
        width: width,
        height: height,
      };
    }
  }

  // E) Fallback for closed shapes:
  if (isClosed) {
    // If few corners and somewhat round → try circle as last resort
    if (sharpCorners.length < 3 && circleRatio < 0.35) {
      const r = (width + height) / 4;
      return {
        shapeType: 'circle',
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
      };
    } else if (sharpCorners.length <= 3 && vCount <= 4) {
      return {
        shapeType: 'triangle',
        x: minX,
        y: minY,
        width,
        height,
        points: [
          { x: minX + width / 2, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
      };
    } else {
      return {
        shapeType: 'rectangle',
        x: minX,
        y: minY,
        width,
        height,
      };
    }
  }

  return null;
}

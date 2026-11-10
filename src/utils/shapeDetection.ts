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

export interface DetectedShapeResult {
  shapeType: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Point[];
}

export function detectShape(rawPoints: Point[]): DetectedShapeResult | null {
  if (rawPoints.length < 4) return null;

  // Filter out micro-jitter points (points too close to previous)
  const points: Point[] = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length; i++) {
    if (distance(rawPoints[i], points[points.length - 1]) >= 3) {
      points.push(rawPoints[i]);
    }
  }

  if (points.length < 4) return null;

  const totalLen = pathLength(points);
  if (totalLen < 20) return null;

  const p0 = points[0];
  const pn = points[points.length - 1];
  const startEndDist = distance(p0, pn);

  // Closed stroke detection with tablet-friendly tolerance
  const isClosed = startEndDist < Math.max(50, totalLen * 0.32);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const width = Math.max(maxX - minX, 10);
  const height = Math.max(maxY - minY, 10);
  const bboxDiagonal = Math.sqrt(width * width + height * height);

  // 1. OPEN STROKES: Line or Arrow
  if (!isClosed) {
    let maxLineDist = 0;
    for (const p of points) {
      const d = distanceToSegment(p, p0, pn);
      if (d > maxLineDist) maxLineDist = d;
    }

    if (maxLineDist < Math.max(16, startEndDist * 0.20)) {
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

  // 2. CLOSED STROKES: Circle / Ellipse
  let sumX = 0;
  let sumY = 0;
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

  if (circleRatio < 0.24) {
    const aspect = width / height;
    if (aspect >= 0.70 && aspect <= 1.40) {
      const r = (width + height) / 4;
      return {
        shapeType: 'circle',
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
      };
    } else {
      return {
        shapeType: 'circle',
        x: minX,
        y: minY,
        width: width,
        height: height,
      };
    }
  }

  // 3. POLYGON SIMPLIFICATION (Triangle, Rectangle, Diamond)
  const simplified = rdp(points, bboxDiagonal * 0.09);

  const cleanSimpl: Point[] = [simplified[0]];
  for (let i = 1; i < simplified.length; i++) {
    if (distance(simplified[i], cleanSimpl[cleanSimpl.length - 1]) > bboxDiagonal * 0.06) {
      cleanSimpl.push(simplified[i]);
    }
  }
  if (cleanSimpl.length > 3 && distance(cleanSimpl[0], cleanSimpl[cleanSimpl.length - 1]) < bboxDiagonal * 0.15) {
    cleanSimpl.pop();
  }

  const vertexCount = cleanSimpl.length;

  // Triangle
  if (vertexCount === 3 || (vertexCount === 4 && isClosed)) {
    let triPoints = cleanSimpl;
    if (vertexCount > 3) {
      const triSimpl = rdp(points, bboxDiagonal * 0.14);
      if (triSimpl.length >= 3) {
        triPoints = triSimpl.slice(0, 3);
      }
    }

    if (triPoints.length === 3) {
      return {
        shapeType: 'triangle',
        x: minX,
        y: minY,
        width: width,
        height: height,
        points: triPoints,
      };
    }
  }

  // Diamond or Rectangle
  if (isClosed) {
    // If aspect is roughly 1:1 and points fit diamond
    let distToBboxSum = 0;
    for (const p of points) {
      const dLeft = Math.abs(p.x - minX);
      const dRight = Math.abs(p.x - maxX);
      const dTop = Math.abs(p.y - minY);
      const dBottom = Math.abs(p.y - maxY);
      distToBboxSum += Math.min(dLeft, dRight, dTop, dBottom);
    }
    const avgDistToBbox = distToBboxSum / points.length;
    const bboxFitRatio = avgDistToBbox / bboxDiagonal;

    if (bboxFitRatio < 0.16) {
      return {
        shapeType: 'rectangle',
        x: minX,
        y: minY,
        width: width,
        height: height,
      };
    }

    // Default to clean rectangle or triangle based on vertex count
    if (vertexCount <= 3) {
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

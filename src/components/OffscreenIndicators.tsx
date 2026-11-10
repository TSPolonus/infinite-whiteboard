import React, { useState, useEffect } from 'react';
import { Navigation, Edit3 } from 'lucide-react';
import type { RemoteCursor, ViewportTransform } from '../types';

interface OffscreenIndicatorsProps {
  remoteCursors: Map<string, RemoteCursor>;
  transform: ViewportTransform;
  myUserId: string;
  onNavigateTo: (worldX: number, worldY: number, userName: string) => void;
}

export const OffscreenIndicators: React.FC<OffscreenIndicatorsProps> = ({
  remoteCursors,
  transform,
  myUserId,
  onNavigateTo,
}) => {
  const [, setTick] = useState(0);

  // Odświeżaj pozycję wskaźników co 150ms podczas ruchu lub pisania
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();
  const W = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const H = typeof window !== 'undefined' ? window.innerHeight : 1080;

  // Bezpieczne marginesy od krawędzi ekranu (aby wskaźniki nie zasłaniały paska narzędzi i nagłówka)
  const padLeft = 45;
  const padRight = 45;
  const padTop = 68;
  const padBottom = 80;

  const indicators = [];

  for (const [, cursor] of remoteCursors) {
    if (cursor.userId === myUserId) continue;
    // Wskaźnik wyświetlany, jeśli użytkownik był aktywny w ciągu ostatnich 15 sekund
    if (now - cursor.lastActive > 15000) continue;

    const screenX = cursor.x * transform.scale + transform.x;
    const screenY = cursor.y * transform.scale + transform.y;

    const isOnScreen =
      screenX >= padLeft &&
      screenX <= W - padRight &&
      screenY >= padTop &&
      screenY <= H - padBottom;

    if (!isOnScreen) {
      const cx = W / 2;
      const cy = H / 2;
      const dx = screenX - cx;
      const dy = screenY - cy;

      const minX = padLeft;
      const maxX = W - padRight;
      const minY = padTop;
      const maxY = H - padBottom;

      let tx = Infinity;
      if (dx > 0) tx = (maxX - cx) / dx;
      else if (dx < 0) tx = (minX - cx) / dx;

      let ty = Infinity;
      if (dy > 0) ty = (maxY - cy) / dy;
      else if (dy < 0) ty = (minY - cy) / dy;

      const t = Math.min(tx, ty);
      const edgeX = Math.max(minX, Math.min(maxX, cx + t * dx));
      const edgeY = Math.max(minY, Math.min(maxY, cy + t * dy));
      const angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      const distPx = Math.round(Math.hypot(dx, dy));

      indicators.push({
        cursor,
        edgeX,
        edgeY,
        angleDeg,
        distPx,
      });
    }
  }

  if (indicators.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 42,
        overflow: 'hidden',
      }}
    >
      {indicators.map(({ cursor, edgeX, edgeY, angleDeg, distPx }) => {
        const isDrawing = !!cursor.isDrawing;
        const color = cursor.color || '#38bdf8';

        return (
          <div
            key={cursor.userId}
            onClick={() => onNavigateTo(cursor.x, cursor.y, cursor.userName)}
            title={`Kliknij, aby przejść do ${cursor.userName} (${distPx}px)`}
            style={{
              position: 'absolute',
              left: edgeX,
              top: edgeY,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 12px',
              borderRadius: 20,
              background: 'rgba(15, 23, 42, 0.94)',
              border: `1.5px solid ${color}`,
              boxShadow: `0 4px 20px ${color}66, 0 2px 10px rgba(0, 0, 0, 0.6)`,
              backdropFilter: 'blur(10px)',
              color: '#f8fafc',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              userSelect: 'none',
              animation: isDrawing ? 'pulse 1.4s infinite' : 'none',
            }}
          >
            {/* Strzałka kierunkowa w stronę pozycji użytkownika na nieskończonej tablicy */}
            <Navigation
              size={14}
              style={{
                transform: `rotate(${angleDeg - 45}deg)`,
                color: color,
                flexShrink: 0,
                filter: `drop-shadow(0 0 4px ${color})`,
              }}
            />

            {/* Stan pisania / rysowania lub nazwa użytkownika */}
            {isDrawing ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#facc15' }}>
                <Edit3 size={13} style={{ animation: 'bounce 1s infinite' }} />
                <span>{cursor.userName} pisze...</span>
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: color,
                    display: 'inline-block',
                  }}
                />
                <span>{cursor.userName}</span>
              </span>
            )}

            {/* Odległość do użytkownika */}
            <span
              style={{
                fontSize: 10,
                color: '#94a3b8',
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '1px 5px',
                borderRadius: 6,
              }}
            >
              {distPx > 1000 ? `${(distPx / 1000).toFixed(1)}k` : `${distPx}`}px
            </span>
          </div>
        );
      })}
    </div>
  );
};

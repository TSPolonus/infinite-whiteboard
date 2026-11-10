import React, { useRef, useState } from 'react';
import {
  Pen,
  Highlighter,
  Eraser,
  Sparkles,
  Square,
  Circle,
  Triangle,
  Minus,
  MoveRight,
  ArrowLeftRight,
  Diamond,
  Star,
  Hexagon,
  Heart,
  MessageSquare,
  Image as ImageIcon,
  Hand,
  MousePointer,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Share2,
  Settings,
  Trash2,
  Lock,
  Globe,
  Wand2,
  Scissors,
  Check,
} from 'lucide-react';
import type { Tool, ShapeType, BoardSettings, ToolSettings } from '../types';

interface ToolbarProps {
  currentTool: Tool;
  currentShape: ShapeType;
  toolSettings: ToolSettings;
  autoShapeEnabled: boolean;
  scale: number;
  canUndo: boolean;
  canRedo: boolean;
  boardSettings: BoardSettings;
  connectedCount: number;
  selectedElementId: string | null;
  onToolChange: (tool: Tool) => void;
  onShapeChange: (shape: ShapeType) => void;
  onUpdateToolSetting: <T extends keyof ToolSettings>(tool: T, settings: Partial<ToolSettings[T]>) => void;
  onToggleAutoShape: () => void;
  onTogglePalmRejection: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onImageUpload: (file: File) => void;
  onClearCanvas: () => void;
  onOpenShareModal: () => void;
  onOpenSettingsModal: () => void;
  onDuplicateSelected: () => void;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

const PEN_COLORS = [
  '#0f172a', // Ciemny (idealny na białą tablicę)
  '#2563eb', // Niebieski
  '#dc2626', // Czerwony
  '#16a34a', // Zielony
  '#9333ea', // Fioletowy
  '#ea580c', // Pomarańczowy
  '#ffffff', // Biały
  '#38bdf8', // Neon błękit
];

const HIGHLIGHTER_COLORS = [
  '#facc15', // Neon Żółty (klasyczny)
  '#4ade80', // Neon Zielony
  '#38bdf8', // Neon Błękit
  '#f43f5e', // Neon Róż
  '#c084fc', // Neon Fiolet
  '#fb923c', // Neon Pomarańcz
];

const LASER_COLORS = [
  { name: 'Czerwony', value: '#f43f5e' },
  { name: 'Błękitny', value: '#38bdf8' },
  { name: 'Zielony', value: '#22c55e' },
  { name: 'Fioletowy', value: '#c084fc' },
];

const SHAPES_LIST: { type: ShapeType; label: string; icon: React.ReactNode }[] = [
  { type: 'rectangle', label: 'Prostokąt', icon: <Square size={17} /> },
  { type: 'circle', label: 'Koło / Elipsa', icon: <Circle size={17} /> },
  { type: 'triangle', label: 'Trójkąt', icon: <Triangle size={17} /> },
  { type: 'diamond', label: 'Romb', icon: <Diamond size={17} /> },
  { type: 'star', label: 'Gwiazda', icon: <Star size={17} /> },
  { type: 'hexagon', label: 'Sześciokąt', icon: <Hexagon size={17} /> },
  { type: 'heart', label: 'Serce', icon: <Heart size={17} /> },
  { type: 'speech_bubble', label: 'Dymek', icon: <MessageSquare size={17} /> },
  { type: 'line', label: 'Linia prosta', icon: <Minus size={17} /> },
  { type: 'arrow', label: 'Strzałka', icon: <MoveRight size={17} /> },
  { type: 'double_arrow', label: 'Strzałka obustronna', icon: <ArrowLeftRight size={17} /> },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  currentShape,
  toolSettings,
  autoShapeEnabled,
  scale,
  canUndo,
  canRedo,
  boardSettings,
  connectedCount,
  selectedElementId,
  onToolChange,
  onShapeChange,
  onUpdateToolSetting,
  onToggleAutoShape,
  onTogglePalmRejection,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onImageUpload,
  onClearCanvas,
  onOpenShareModal,
  onOpenSettingsModal,
  onDuplicateSelected,
  onRotateSelected,
  onDeleteSelected,
  onBringToFront,
  onSendToBack,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSubMenu, setShowSubMenu] = useState<Tool | null>('pen');

  const handleToolClick = (tool: Tool) => {
    if (currentTool === tool) {
      // Tapping the already active tool toggles its specific sub-menu
      setShowSubMenu(showSubMenu === tool ? null : tool);
    } else {
      onToolChange(tool);
      // Automatically show settings popover for customizable tools
      if (['pen', 'highlighter', 'shape', 'eraser', 'laser'].includes(tool)) {
        setShowSubMenu(tool);
      } else {
        setShowSubMenu(null);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  return (
    <>
      {/* Top Bar: Logo, Lobby Code, Palm Rejection & Share */}
      <header
        style={{
          position: 'absolute',
          top: 'max(8px, env(safe-area-inset-top))',
          left: 'max(8px, env(safe-area-inset-left))',
          right: 'max(8px, env(safe-area-inset-right))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 35,
          gap: 6,
        }}
      >
        {/* Left: App Logo & Lobby Info */}
        <div
          className="glass-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 14,
            pointerEvents: 'auto',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: '#0f172a',
              fontSize: 15,
            }}
          >
            ∞
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>
                Lobby:
              </span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 13,
                  color: '#38bdf8',
                  letterSpacing: 1.5,
                  background: 'rgba(56, 189, 248, 0.15)',
                  padding: '1px 6px',
                  borderRadius: 6,
                }}
              >
                {boardSettings.roomCode}
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: boardSettings.isPasswordProtected ? '#fbbf24' : '#4ade80',
              }}
            >
              {boardSettings.isPasswordProtected ? <Lock size={10} /> : <Globe size={10} />}
              <span>{boardSettings.isPasswordProtected ? 'Hasło' : 'Publiczne'}</span>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#94a3b8' }}>
                {connectedCount > 1 ? `${connectedCount} os. online` : 'Solo'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Tablet Palm Rejection Indicator Button */}
        <button
          className={`glass-panel glass-btn ${boardSettings.palmRejection ? 'active' : ''}`}
          onClick={onTogglePalmRejection}
          title={
            boardSettings.palmRejection
              ? 'Ochrona przed dłonią: WŁĄCZONA (Tylko rysik rysuje, dłoń przesuwa)'
              : 'Ochrona przed dłonią: WYŁĄCZONA (Dotyk i rysik rysują)'
          }
          style={{
            pointerEvents: 'auto',
            padding: '6px 12px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            gap: 6,
            display: 'flex',
            alignItems: 'center',
            color: boardSettings.palmRejection ? '#38bdf8' : '#94a3b8',
          }}
        >
          <span>✍️</span>
          <span className="hidden-mobile">
            {boardSettings.palmRejection ? 'Rysik rysuje / Dłoń przesuwa' : 'Tryb dotyku'}
          </span>
        </button>

        {/* Right: Actions */}
        <div
          className="glass-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 4,
            borderRadius: 14,
            pointerEvents: 'auto',
            flexShrink: 0,
          }}
        >
          <button
            className="glass-btn"
            onClick={onOpenShareModal}
            title="Zaproś do lobby (kod, link)"
            style={{
              padding: '6px 11px',
              gap: 5,
              background: 'rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            <Share2 size={15} />
            <span className="hidden-mobile">Lobby / Kod</span>
          </button>

          <button
            className="glass-btn"
            onClick={onOpenSettingsModal}
            title="Ustawienia tablicy"
            style={{ padding: 6 }}
          >
            <Settings size={17} />
          </button>

          <button
            className="glass-btn"
            onClick={onClearCanvas}
            title="Wyczyść tablicę"
            style={{ padding: 6, color: '#f87171' }}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </header>

      {/* Floating Selection Controls (when an object is selected) */}
      {selectedElementId && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            top: 70,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 14,
            zIndex: 40,
            animation: 'fadeIn 0.15s ease-out',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600, marginRight: 4 }}>
            Wybrany obiekt:
          </span>
          <button
            className="glass-btn"
            onClick={onRotateSelected}
            title="Obróć o 90°"
            style={{ padding: '6px 10px', fontSize: 12, gap: 5 }}
          >
            🔄 <span>Obróć 90°</span>
          </button>
          <button
            className="glass-btn"
            onClick={onDuplicateSelected}
            title="Duplikuj element"
            style={{ padding: '6px 10px', fontSize: 12, gap: 5 }}
          >
            📋 <span>Duplikuj</span>
          </button>
          <button
            className="glass-btn"
            onClick={onBringToFront}
            title="Przesuń na wierzch"
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            ⬆️ Na wierzch
          </button>
          <button
            className="glass-btn"
            onClick={onSendToBack}
            title="Przesuń pod spód"
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            ⬇️ Pod spód
          </button>
          <button
            className="glass-btn"
            onClick={onDeleteSelected}
            title="Usuń obiekt"
            style={{ padding: '6px 10px', fontSize: 12, color: '#f87171' }}
          >
            🗑️ Usuń
          </button>
        </div>
      )}

      {/* Main Bottom Floating Dock */}
      <div
        style={{
          position: 'absolute',
          bottom: 'max(12px, env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          zIndex: 35,
          maxWidth: '96vw',
        }}
      >
        {/* Specific Popover according to current tool */}

        {/* 1. PEN SETTINGS POPOVER */}
        {showSubMenu === 'pen' && currentTool === 'pen' && (
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>Długopis:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {PEN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onUpdateToolSetting('pen', { color: c })}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: toolSettings.pen.color === c ? '2px solid #38bdf8' : '2px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    transform: toolSettings.pen.color === c ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                  title={c}
                />
              ))}

              <label
                style={{
                  position: 'relative',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                  cursor: 'pointer',
                  border: '2px solid rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Własny kolor"
              >
                <input
                  type="color"
                  value={toolSettings.pen.color}
                  onChange={(e) => onUpdateToolSetting('pen', { color: e.target.value })}
                  style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                />
              </label>
            </div>

            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Grubość:</span>
              <input
                type="range"
                min="1"
                max="36"
                value={toolSettings.pen.size}
                onChange={(e) => onUpdateToolSetting('pen', { size: Number(e.target.value) })}
                style={{ width: 65, cursor: 'pointer', accentColor: '#38bdf8' }}
              />
              <span style={{ fontSize: 11, color: '#f8fafc', minWidth: 24 }}>
                {toolSettings.pen.size}px
              </span>
            </div>
          </div>
        )}

        {/* 2. HIGHLIGHTER SETTINGS POPOVER */}
        {showSubMenu === 'highlighter' && currentTool === 'highlighter' && (
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 11, color: '#facc15', fontWeight: 700 }}>Zakreślacz:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {HIGHLIGHTER_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onUpdateToolSetting('highlighter', { color: c })}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: toolSettings.highlighter.color === c ? '2px solid #ffffff' : '2px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    transform: toolSettings.highlighter.color === c ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                  title={c}
                />
              ))}
            </div>

            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Szerokość:</span>
              <input
                type="range"
                min="8"
                max="60"
                value={toolSettings.highlighter.size}
                onChange={(e) => onUpdateToolSetting('highlighter', { size: Number(e.target.value) })}
                style={{ width: 65, cursor: 'pointer', accentColor: '#facc15' }}
              />
              <span style={{ fontSize: 11, color: '#f8fafc', minWidth: 24 }}>
                {toolSettings.highlighter.size}px
              </span>
            </div>
          </div>
        )}

        {/* 3. ERASER SETTINGS POPOVER (Tryb + wielkość wprost na pasku) */}
        {showSubMenu === 'eraser' && currentTool === 'eraser' && (
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
            }}
          >
            <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>Gumka:</span>
            <button
              className={`glass-btn ${toolSettings.eraser.mode === 'stroke' ? 'active' : ''}`}
              onClick={() => onUpdateToolSetting('eraser', { mode: 'stroke' })}
              style={{ padding: '6px 10px', fontSize: 12, gap: 6 }}
            >
              <Eraser size={14} />
              <span>Całe linie</span>
              {toolSettings.eraser.mode === 'stroke' && <Check size={13} />}
            </button>
            <button
              className={`glass-btn ${toolSettings.eraser.mode === 'pixel' ? 'active' : ''}`}
              onClick={() => onUpdateToolSetting('eraser', { mode: 'pixel' })}
              style={{ padding: '6px 10px', fontSize: 12, gap: 6 }}
            >
              <Scissors size={14} />
              <span>Piksele / Wycinanie</span>
              {toolSettings.eraser.mode === 'pixel' && <Check size={13} />}
            </button>
          </div>
        )}

        {/* 4. LASER SETTINGS POPOVER (Kolor + wielkość wprost na pasku) */}
        {showSubMenu === 'laser' && currentTool === 'laser' && (
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
            }}
          >
            <span style={{ fontSize: 11, color: '#f43f5e', fontWeight: 700 }}>Laser:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {LASER_COLORS.map((lc) => (
                <button
                  key={lc.value}
                  onClick={() => onUpdateToolSetting('laser', { color: lc.value })}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 8,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    border: toolSettings.laser.color === lc.value ? `2px solid ${lc.value}` : '1px solid rgba(255,255,255,0.15)',
                    color: lc.value,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: lc.value }} />
                  <span>{lc.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 5. SHAPES SELECTION POPOVER */}
        {showSubMenu === 'shape' && currentTool === 'shape' && (
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
              {SHAPES_LIST.map((s) => (
                <button
                  key={s.type}
                  className={`glass-btn ${currentShape === s.type ? 'active' : ''}`}
                  onClick={() => onShapeChange(s.type)}
                  title={s.label}
                  style={{ width: 34, height: 34 }}
                >
                  {s.icon}
                </button>
              ))}
            </div>

            {/* Shape color & stroke size */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Kolor:</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {PEN_COLORS.slice(0, 6).map((c) => (
                  <button
                    key={c}
                    onClick={() => onUpdateToolSetting('shape', { color: c })}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: c,
                      border: toolSettings.shape.color === c ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>Grubość:</span>
              <input
                type="range"
                min="1"
                max="24"
                value={toolSettings.shape.size}
                onChange={(e) => onUpdateToolSetting('shape', { size: Number(e.target.value) })}
                style={{ width: 60, cursor: 'pointer', accentColor: '#38bdf8' }}
              />
            </div>
          </div>
        )}

        {/* Primary Floating Toolbar */}
        <div
          className="glass-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 7px',
            borderRadius: 20,
            overflowX: 'auto',
            maxWidth: '100%',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Select / Move / Scale */}
          <button
            className={`glass-btn ${currentTool === 'select' ? 'active' : ''}`}
            onClick={() => handleToolClick('select')}
            title="Zaznaczanie, skalowanie i przesuwanie obiektów"
            style={{ width: 38, height: 38 }}
          >
            <MousePointer size={18} />
          </button>

          {/* Hand / Pan */}
          <button
            className={`glass-btn ${currentTool === 'hand' ? 'active' : ''}`}
            onClick={() => handleToolClick('hand')}
            title="Rączka (przesuwanie tablicy)"
            style={{ width: 38, height: 38 }}
          >
            <Hand size={18} />
          </button>

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)' }} />

          {/* Pen Tool */}
          <button
            className={`glass-btn ${currentTool === 'pen' ? 'active' : ''}`}
            onClick={() => handleToolClick('pen')}
            title="Długopis (kliknij ponownie, aby zmienić kolor/grubość)"
            style={{ width: 38, height: 38, position: 'relative' }}
          >
            <Pen size={18} />
            <div
              style={{
                position: 'absolute',
                bottom: 3,
                right: 3,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: toolSettings.pen.color,
                border: '1px solid rgba(255,255,255,0.6)',
              }}
            />
          </button>

          {/* Highlighter Tool */}
          <button
            className={`glass-btn ${currentTool === 'highlighter' ? 'active' : ''}`}
            onClick={() => handleToolClick('highlighter')}
            title="Zakreślacz (kliknij ponownie, aby zmienić kolor/grubość)"
            style={{ width: 38, height: 38, position: 'relative' }}
          >
            <Highlighter size={18} />
            <div
              style={{
                position: 'absolute',
                bottom: 3,
                right: 3,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: toolSettings.highlighter.color,
                border: '1px solid rgba(255,255,255,0.6)',
              }}
            />
          </button>

          {/* Eraser Tool */}
          <button
            className={`glass-btn ${currentTool === 'eraser' ? 'active' : ''}`}
            onClick={() => handleToolClick('eraser')}
            title={`Gumka: ${toolSettings.eraser.mode === 'stroke' ? 'Całe linie' : 'Piksele'} (kliknij ponownie, aby zmienić tryb)`}
            style={{ width: 38, height: 38, position: 'relative' }}
          >
            {toolSettings.eraser.mode === 'pixel' ? <Scissors size={18} /> : <Eraser size={18} />}
            <span
              style={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                fontSize: 8,
                fontWeight: 800,
                color: '#38bdf8',
              }}
            >
              {toolSettings.eraser.mode === 'pixel' ? 'px' : 'obj'}
            </span>
          </button>

          {/* Laser Pointer */}
          <button
            className={`glass-btn ${currentTool === 'laser' ? 'active laser-active-glow' : ''}`}
            onClick={() => handleToolClick('laser')}
            title="Wskaźnik laserowy (kliknij ponownie, aby zmienić kolor)"
            style={{
              width: 38,
              height: 38,
              color: toolSettings.laser.color,
            }}
          >
            <Sparkles size={18} />
          </button>

          {/* Shapes Tool */}
          <button
            className={`glass-btn ${currentTool === 'shape' ? 'active' : ''}`}
            onClick={() => handleToolClick('shape')}
            title="Kształty geometryczne"
            style={{ width: 38, height: 38 }}
          >
            {currentShape === 'rectangle' && <Square size={18} />}
            {currentShape === 'circle' && <Circle size={18} />}
            {currentShape === 'triangle' && <Triangle size={18} />}
            {currentShape === 'diamond' && <Diamond size={18} />}
            {currentShape === 'star' && <Star size={18} />}
            {currentShape === 'hexagon' && <Hexagon size={18} />}
            {currentShape === 'heart' && <Heart size={18} />}
            {currentShape === 'speech_bubble' && <MessageSquare size={18} />}
            {currentShape === 'line' && <Minus size={18} />}
            {currentShape === 'arrow' && <MoveRight size={18} />}
            {currentShape === 'double_arrow' && <ArrowLeftRight size={18} />}
          </button>

          {/* Add Image */}
          <button
            className="glass-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Wstaw zdjęcie (z galerii / aparatu / pliku)"
            style={{ width: 38, height: 38 }}
          >
            <ImageIcon size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)' }} />

          {/* Auto Shape Snap Toggle */}
          <button
            className={`glass-btn ${autoShapeEnabled ? 'active' : ''}`}
            onClick={onToggleAutoShape}
            title={
              autoShapeEnabled
                ? 'Automatyczne kształty: WŁĄCZONE (przytrzymaj koniec kreski)'
                : 'Automatyczne kształty: WYŁĄCZONE'
            }
            style={{
              width: 38,
              height: 38,
              color: autoShapeEnabled ? '#38bdf8' : '#94a3b8',
            }}
          >
            <Wand2 size={18} />
          </button>

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)' }} />

          {/* Undo / Redo */}
          <button
            className="glass-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Cofnij (Ctrl+Z)"
            style={{ width: 36, height: 36, opacity: canUndo ? 1 : 0.35 }}
          >
            <Undo2 size={17} />
          </button>

          <button
            className="glass-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Ponów (Ctrl+Y)"
            style={{ width: 36, height: 36, opacity: canRedo ? 1 : 0.35 }}
          >
            <Redo2 size={17} />
          </button>
        </div>
      </div>

      {/* Floating Bottom-Right: Zoom Controls */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: 'max(12px, env(safe-area-inset-bottom))',
          right: 'max(8px, env(safe-area-inset-right))',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '3px 6px',
          borderRadius: 12,
          zIndex: 35,
        }}
      >
        <button
          className="glass-btn"
          onClick={onZoomOut}
          title="Oddal (lub scrolluj w dół)"
          style={{ width: 28, height: 28 }}
        >
          <ZoomOut size={15} />
        </button>

        <button
          className="glass-btn"
          onClick={onResetZoom}
          title="Przywróć 100%"
          style={{
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 600,
            color: '#e2e8f0',
          }}
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          className="glass-btn"
          onClick={onZoomIn}
          title="Przybliż (lub scrolluj w górę)"
          style={{ width: 28, height: 28 }}
        >
          <ZoomIn size={15} />
        </button>

        <button
          className="glass-btn"
          onClick={onResetZoom}
          title="Wyśrodkuj"
          style={{ width: 28, height: 28 }}
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </>
  );
};

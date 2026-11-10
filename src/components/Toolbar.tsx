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
import type { Tool, ShapeType, BoardSettings, EraserMode } from '../types';

interface ToolbarProps {
  currentTool: Tool;
  currentShape: ShapeType;
  color: string;
  strokeWidth: number;
  autoShapeEnabled: boolean;
  scale: number;
  canUndo: boolean;
  canRedo: boolean;
  boardSettings: BoardSettings;
  connectedCount: number;
  selectedElementId: string | null;
  onToolChange: (tool: Tool) => void;
  onShapeChange: (shape: ShapeType) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onToggleAutoShape: () => void;
  onTogglePalmRejection: () => void;
  onEraserModeChange: (mode: EraserMode) => void;
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

const PRESET_COLORS = [
  '#ffffff',
  '#000000',
  '#38bdf8',
  '#818cf8',
  '#4ade80',
  '#facc15',
  '#f43f5e',
  '#fb923c',
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
  color,
  strokeWidth,
  autoShapeEnabled,
  scale,
  canUndo,
  canRedo,
  boardSettings,
  connectedCount,
  selectedElementId,
  onToolChange,
  onShapeChange,
  onColorChange,
  onStrokeWidthChange,
  onToggleAutoShape,
  onTogglePalmRejection,
  onEraserModeChange,
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
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showEraserMenu, setShowEraserMenu] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  return (
    <>
      {/* Top Bar: Title, Palm Rejection status, Share & Settings */}
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
        {/* Left: App Logo & Board info */}
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
            <div style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc', whiteSpace: 'nowrap' }}>
              {boardSettings.title || 'InfinityDraw'}
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
              <span>{boardSettings.isPasswordProtected ? 'Hasło' : 'Publiczny'}</span>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#94a3b8' }}>
                {connectedCount > 1 ? `${connectedCount} os.` : 'Solo'}
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
              ? 'Ochrona przed dłonią: WŁĄCZONA (Tylko rysik maluje, dłoń przesuwa)'
              : 'Ochrona przed dłonią: WYŁĄCZONA (Dotyk i rysik malują)'
          }
          style={{
            pointerEvents: 'auto',
            padding: '6px 10px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500,
            gap: 6,
            display: 'flex',
            alignItems: 'center',
            color: boardSettings.palmRejection ? '#38bdf8' : '#94a3b8',
          }}
        >
          <span style={{ fontSize: 13 }}>✍️</span>
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
            title="Udostępnij tablicę"
            style={{
              padding: '6px 10px',
              gap: 5,
              background: 'rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              fontWeight: 500,
              fontSize: 12,
            }}
          >
            <Share2 size={15} />
            <span className="hidden-mobile">Udostępnij</span>
          </button>

          <button
            className="glass-btn"
            onClick={onOpenSettingsModal}
            title="Ustawienia"
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

      {/* Floating Selection Controls (when an image/shape is selected) */}
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

      {/* Main Bottom Floating Dock: Tools */}
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
        {/* Secondary Popover: Color & Stroke Size controls */}
        {showColorPicker && (
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onColorChange(c)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: color === c ? '2px solid #38bdf8' : '2px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    transform: color === c ? 'scale(1.2)' : 'scale(1)',
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
                  value={color}
                  onChange={(e) => onColorChange(e.target.value)}
                  style={{
                    opacity: 0,
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'pointer',
                  }}
                />
              </label>
            </div>

            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Grubość:</span>
              <input
                type="range"
                min="2"
                max="48"
                value={strokeWidth}
                onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                style={{
                  width: 70,
                  cursor: 'pointer',
                  accentColor: '#38bdf8',
                }}
              />
              <span style={{ fontSize: 11, color: '#f8fafc', minWidth: 24 }}>
                {strokeWidth}px
              </span>
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
            onClick={() => onToolChange('select')}
            title="Zaznaczanie, skalowanie i przesuwanie"
            style={{ width: 38, height: 38 }}
          >
            <MousePointer size={18} />
          </button>

          {/* Hand / Pan */}
          <button
            className={`glass-btn ${currentTool === 'hand' ? 'active' : ''}`}
            onClick={() => onToolChange('hand')}
            title="Rączka (przesuwanie tablicy)"
            style={{ width: 38, height: 38 }}
          >
            <Hand size={18} />
          </button>

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)' }} />

          {/* Pen Tool */}
          <button
            className={`glass-btn ${currentTool === 'pen' ? 'active' : ''}`}
            onClick={() => {
              onToolChange('pen');
              setShowColorPicker(true);
            }}
            title="Pióro do rysowania"
            style={{ width: 38, height: 38 }}
          >
            <Pen size={18} />
          </button>

          {/* Highlighter Tool */}
          <button
            className={`glass-btn ${currentTool === 'highlighter' ? 'active' : ''}`}
            onClick={() => {
              onToolChange('highlighter');
              setShowColorPicker(true);
            }}
            title="Zakreślacz"
            style={{ width: 38, height: 38 }}
          >
            <Highlighter size={18} />
          </button>

          {/* Eraser Tool with Mode Popover */}
          <div style={{ position: 'relative' }}>
            <button
              className={`glass-btn ${currentTool === 'eraser' ? 'active' : ''}`}
              onClick={() => {
                if (currentTool === 'eraser') {
                  setShowEraserMenu(!showEraserMenu);
                } else {
                  onToolChange('eraser');
                }
              }}
              title={`Gumka: ${boardSettings.eraserMode === 'stroke' ? 'Całe linie' : 'Piksele/Cięcie'}`}
              style={{ width: 38, height: 38, position: 'relative' }}
            >
              {boardSettings.eraserMode === 'pixel' ? <Scissors size={18} /> : <Eraser size={18} />}
              <span
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 2,
                  fontSize: 8,
                  fontWeight: 700,
                  color: '#38bdf8',
                }}
              >
                {boardSettings.eraserMode === 'pixel' ? 'px' : 'obj'}
              </span>
            </button>

            {showEraserMenu && (
              <div
                className="glass-panel"
                style={{
                  position: 'absolute',
                  bottom: '120%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: 6,
                  borderRadius: 12,
                  zIndex: 45,
                  minWidth: 160,
                }}
              >
                <button
                  className={`glass-btn ${boardSettings.eraserMode === 'stroke' ? 'active' : ''}`}
                  onClick={() => {
                    onEraserModeChange('stroke');
                    setShowEraserMenu(false);
                  }}
                  style={{ padding: '6px 10px', fontSize: 12, justifyContent: 'flex-start', gap: 8 }}
                >
                  <Eraser size={15} />
                  <span>Całe linie (obiektowa)</span>
                  {boardSettings.eraserMode === 'stroke' && <Check size={14} style={{ marginLeft: 'auto' }} />}
                </button>
                <button
                  className={`glass-btn ${boardSettings.eraserMode === 'pixel' ? 'active' : ''}`}
                  onClick={() => {
                    onEraserModeChange('pixel');
                    setShowEraserMenu(false);
                  }}
                  style={{ padding: '6px 10px', fontSize: 12, justifyContent: 'flex-start', gap: 8 }}
                >
                  <Scissors size={15} />
                  <span>Piksele / Wycinanie</span>
                  {boardSettings.eraserMode === 'pixel' && <Check size={14} style={{ marginLeft: 'auto' }} />}
                </button>
              </div>
            )}
          </div>

          {/* Laser Pointer */}
          <button
            className={`glass-btn ${currentTool === 'laser' ? 'active laser-active-glow' : ''}`}
            onClick={() => onToolChange('laser')}
            title="Wskaźnik laserowy (zanikający neon)"
            style={{
              width: 38,
              height: 38,
              color: currentTool === 'laser' ? '#f43f5e' : undefined,
            }}
          >
            <Sparkles size={18} />
          </button>

          {/* Extended Shapes Tool Menu */}
          <div style={{ position: 'relative' }}>
            <button
              className={`glass-btn ${currentTool === 'shape' ? 'active' : ''}`}
              onClick={() => {
                onToolChange('shape');
                setShowShapeMenu(!showShapeMenu);
              }}
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

            {showShapeMenu && (
              <div
                className="glass-panel"
                style={{
                  position: 'absolute',
                  bottom: '120%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 5,
                  padding: 8,
                  borderRadius: 14,
                  zIndex: 45,
                  minWidth: 170,
                }}
              >
                {SHAPES_LIST.map((s) => (
                  <button
                    key={s.type}
                    className={`glass-btn ${currentShape === s.type ? 'active' : ''}`}
                    onClick={() => {
                      onShapeChange(s.type);
                      setShowShapeMenu(false);
                    }}
                    title={s.label}
                    style={{ width: 36, height: 36 }}
                  >
                    {s.icon}
                  </button>
                ))}
              </div>
            )}
          </div>

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

          {/* Quick Color toggle button */}
          <button
            className="glass-btn"
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Kolor i grubość"
            style={{ width: 38, height: 38 }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: color,
                border: '2px solid rgba(255,255,255,0.8)',
                boxShadow: `0 0 6px ${color}`,
              }}
            />
          </button>

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
            title="Cofnij"
            style={{
              width: 36,
              height: 36,
              opacity: canUndo ? 1 : 0.35,
            }}
          >
            <Undo2 size={17} />
          </button>

          <button
            className="glass-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Ponów"
            style={{
              width: 36,
              height: 36,
              opacity: canRedo ? 1 : 0.35,
            }}
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
          title="Oddal"
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
          title="Przybliż"
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

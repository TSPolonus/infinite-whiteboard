import React, { useRef } from 'react';
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
} from 'lucide-react';
import type { Tool, ShapeType, BoardSettings } from '../types';

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
  onToolChange: (tool: Tool) => void;
  onShapeChange: (shape: ShapeType) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onToggleAutoShape: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onImageUpload: (file: File) => void;
  onClearCanvas: () => void;
  onOpenShareModal: () => void;
  onOpenSettingsModal: () => void;
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
  onToolChange,
  onShapeChange,
  onColorChange,
  onStrokeWidthChange,
  onToggleAutoShape,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onImageUpload,
  onClearCanvas,
  onOpenShareModal,
  onOpenSettingsModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showShapeMenu, setShowShapeMenu] = React.useState(false);
  const [showColorPicker, setShowColorPicker] = React.useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  return (
    <>
      {/* Top Bar: Room Status, Board Title, Sharing & Settings */}
      <header
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 30,
        }}
      >
        <div
          className="glass-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            borderRadius: 14,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: '#0f172a',
              fontSize: 16,
            }}
          >
            ∞
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#f8fafc' }}>
              {boardSettings.title || 'Nieskończona Tablica'}
            </div>
            <div
              style={{
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                color: boardSettings.isPasswordProtected ? '#fbbf24' : '#4ade80',
              }}
            >
              {boardSettings.isPasswordProtected ? (
                <>
                  <Lock size={11} /> Dostęp za hasłem
                </>
              ) : (
                <>
                  <Globe size={11} /> Publiczna
                </>
              )}
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#94a3b8' }}>
                {connectedCount > 1 ? `${connectedCount} online` : 'Solo'}
              </span>
            </div>
          </div>
        </div>

        <div
          className="glass-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 6,
            borderRadius: 14,
            pointerEvents: 'auto',
          }}
        >
          <button
            className="glass-btn"
            onClick={onOpenShareModal}
            title="Udostępnij tablicę (link, hasło)"
            style={{
              padding: '7px 12px',
              gap: 6,
              background: 'rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            <Share2 size={16} />
            <span className="hidden-mobile">Udostępnij</span>
          </button>

          <button
            className="glass-btn"
            onClick={onOpenSettingsModal}
            title="Ustawienia tablicy i eksport"
            style={{ padding: 8 }}
          >
            <Settings size={18} />
          </button>

          <button
            className="glass-btn"
            onClick={onClearCanvas}
            title="Wyczyść tablicę"
            style={{ padding: 8, color: '#f87171' }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {/* Main Bottom Floating Dock: Tools */}
      <div
        style={{
          position: 'absolute',
          bottom: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          zIndex: 30,
          maxWidth: '96vw',
        }}
      >
        {showColorPicker && (
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onColorChange(c)}
                  style={{
                    width: 24,
                    height: 24,
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
                  width: 24,
                  height: 24,
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

            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Grubość:</span>
              <input
                type="range"
                min="2"
                max="42"
                value={strokeWidth}
                onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                style={{
                  width: 80,
                  cursor: 'pointer',
                  accentColor: '#38bdf8',
                }}
              />
              <span style={{ fontSize: 12, color: '#f8fafc', minWidth: 20 }}>
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
            gap: 5,
            padding: '6px 8px',
            borderRadius: 20,
            overflowX: 'auto',
            maxWidth: '100%',
          }}
        >
          <button
            className={`glass-btn ${currentTool === 'select' ? 'active' : ''}`}
            onClick={() => onToolChange('select')}
            title="Zaznaczanie i przesuwanie"
            style={{ width: 42, height: 42 }}
          >
            <MousePointer size={20} />
          </button>

          <button
            className={`glass-btn ${currentTool === 'hand' ? 'active' : ''}`}
            onClick={() => onToolChange('hand')}
            title="Rączka (przesuwanie tablicy)"
            style={{ width: 42, height: 42 }}
          >
            <Hand size={20} />
          </button>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

          <button
            className={`glass-btn ${currentTool === 'pen' ? 'active' : ''}`}
            onClick={() => {
              onToolChange('pen');
              setShowColorPicker(true);
            }}
            title="Pióro do rysowania"
            style={{ width: 42, height: 42 }}
          >
            <Pen size={20} />
          </button>

          <button
            className={`glass-btn ${currentTool === 'highlighter' ? 'active' : ''}`}
            onClick={() => {
              onToolChange('highlighter');
              setShowColorPicker(true);
            }}
            title="Zakreślacz"
            style={{ width: 42, height: 42 }}
          >
            <Highlighter size={20} />
          </button>

          <button
            className={`glass-btn ${currentTool === 'eraser' ? 'active' : ''}`}
            onClick={() => onToolChange('eraser')}
            title="Gumka"
            style={{ width: 42, height: 42 }}
          >
            <Eraser size={20} />
          </button>

          <button
            className={`glass-btn ${currentTool === 'laser' ? 'active laser-active-glow' : ''}`}
            onClick={() => onToolChange('laser')}
            title="Laser wskaźnikowy (znika po chwili)"
            style={{
              width: 42,
              height: 42,
              color: currentTool === 'laser' ? '#f43f5e' : undefined,
            }}
          >
            <Sparkles size={20} />
          </button>

          <div style={{ position: 'relative' }}>
            <button
              className={`glass-btn ${currentTool === 'shape' ? 'active' : ''}`}
              onClick={() => {
                onToolChange('shape');
                setShowShapeMenu(!showShapeMenu);
              }}
              title="Kształty geometryczne"
              style={{ width: 42, height: 42 }}
            >
              {currentShape === 'rectangle' && <Square size={20} />}
              {currentShape === 'circle' && <Circle size={20} />}
              {currentShape === 'triangle' && <Triangle size={20} />}
              {currentShape === 'line' && <Minus size={20} />}
              {currentShape === 'arrow' && <MoveRight size={20} />}
            </button>

            {showShapeMenu && (
              <div
                className="glass-panel"
                style={{
                  position: 'absolute',
                  bottom: '120%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  gap: 4,
                  padding: 5,
                  borderRadius: 12,
                  zIndex: 40,
                }}
              >
                <button
                  className={`glass-btn ${currentShape === 'rectangle' ? 'active' : ''}`}
                  onClick={() => {
                    onShapeChange('rectangle');
                    setShowShapeMenu(false);
                  }}
                  title="Prostokąt"
                  style={{ width: 34, height: 34 }}
                >
                  <Square size={17} />
                </button>
                <button
                  className={`glass-btn ${currentShape === 'circle' ? 'active' : ''}`}
                  onClick={() => {
                    onShapeChange('circle');
                    setShowShapeMenu(false);
                  }}
                  title="Koło / Elipsa"
                  style={{ width: 34, height: 34 }}
                >
                  <Circle size={17} />
                </button>
                <button
                  className={`glass-btn ${currentShape === 'triangle' ? 'active' : ''}`}
                  onClick={() => {
                    onShapeChange('triangle');
                    setShowShapeMenu(false);
                  }}
                  title="Trójkąt"
                  style={{ width: 34, height: 34 }}
                >
                  <Triangle size={17} />
                </button>
                <button
                  className={`glass-btn ${currentShape === 'line' ? 'active' : ''}`}
                  onClick={() => {
                    onShapeChange('line');
                    setShowShapeMenu(false);
                  }}
                  title="Linia prosta"
                  style={{ width: 34, height: 34 }}
                >
                  <Minus size={17} />
                </button>
                <button
                  className={`glass-btn ${currentShape === 'arrow' ? 'active' : ''}`}
                  onClick={() => {
                    onShapeChange('arrow');
                    setShowShapeMenu(false);
                  }}
                  title="Strzałka"
                  style={{ width: 34, height: 34 }}
                >
                  <MoveRight size={17} />
                </button>
              </div>
            )}
          </div>

          <button
            className="glass-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Wstaw zdjęcie z pliku lub aparatu"
            style={{ width: 42, height: 42 }}
          >
            <ImageIcon size={20} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

          <button
            className="glass-btn"
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Kolor i grubość pędzla"
            style={{
              width: 42,
              height: 42,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: color,
                border: '2px solid rgba(255,255,255,0.8)',
                boxShadow: `0 0 8px ${color}`,
              }}
            />
          </button>

          <button
            className={`glass-btn ${autoShapeEnabled ? 'active' : ''}`}
            onClick={onToggleAutoShape}
            title={
              autoShapeEnabled
                ? 'Automatyczne kształty: WŁĄCZONE (przytrzymaj rysik na końcu, aby wyrównać)'
                : 'Automatyczne kształty: WYŁĄCZONE'
            }
            style={{
              width: 42,
              height: 42,
              color: autoShapeEnabled ? '#38bdf8' : '#94a3b8',
            }}
          >
            <Wand2 size={20} />
          </button>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

          <button
            className="glass-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Cofnij (Ctrl+Z)"
            style={{
              width: 38,
              height: 38,
              opacity: canUndo ? 1 : 0.35,
              cursor: canUndo ? 'pointer' : 'default',
            }}
          >
            <Undo2 size={18} />
          </button>

          <button
            className="glass-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Ponów (Ctrl+Y)"
            style={{
              width: 38,
              height: 38,
              opacity: canRedo ? 1 : 0.35,
              cursor: canRedo ? 'pointer' : 'default',
            }}
          >
            <Redo2 size={18} />
          </button>
        </div>
      </div>

      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: 18,
          right: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderRadius: 14,
          zIndex: 30,
        }}
      >
        <button
          className="glass-btn"
          onClick={onZoomOut}
          title="Oddal"
          style={{ width: 32, height: 32 }}
        >
          <ZoomOut size={16} />
        </button>

        <button
          className="glass-btn"
          onClick={onResetZoom}
          title="Przywróć 100% / Wyśrodkuj"
          style={{
            padding: '2px 8px',
            fontSize: 12,
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
          style={{ width: 32, height: 32 }}
        >
          <ZoomIn size={16} />
        </button>

        <button
          className="glass-btn"
          onClick={onResetZoom}
          title="Wyśrodkuj widok"
          style={{ width: 32, height: 32 }}
        >
          <Maximize2 size={15} />
        </button>
      </div>
    </>
  );
};

import React, { useRef } from 'react';
import {
  X,
  FileImage,
  Code,
  Download,
  Upload,
  Smartphone,
  Grid,
  Palette,
} from 'lucide-react';
import type { BoardSettings, CanvasElement } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardSettings: BoardSettings;
  onUpdateSettings: (settings: Partial<BoardSettings>) => void;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onExportJSON: () => void;
  onImportJSON: (importedElements: CanvasElement[]) => void;
}

const BG_PRESETS = [
  { name: 'Ciemny grafit', value: '#0f172a' },
  { name: 'Czysty czarny', value: '#000000' },
  { name: 'Biały', value: '#ffffff' },
  { name: 'Jasnoszary', value: '#f8fafc' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  boardSettings,
  onUpdateSettings,
  onExportPNG,
  onExportSVG,
  onExportJSON,
  onImportJSON,
}) => {
  const jsonInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            onImportJSON(parsed);
            onClose();
          } else if (parsed.elements && Array.isArray(parsed.elements)) {
            onImportJSON(parsed.elements);
            if (parsed.settings) onUpdateSettings(parsed.settings);
            onClose();
          }
        } catch (err) {
          alert('Błąd podczas odczytu pliku projektu JSON');
        }
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 20,
          padding: 24,
          background: '#1e293b',
          color: '#f8fafc',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Ustawienia i Eksport
          </h3>
          <button
            className="glass-btn"
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tło tablicy */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Palette size={16} color="#38bdf8" /> Kolor tła tablicy
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {BG_PRESETS.map((bg) => (
              <button
                key={bg.value}
                onClick={() => onUpdateSettings({ backgroundColor: bg.value })}
                style={{
                  padding: '8px 6px',
                  borderRadius: 10,
                  backgroundColor: bg.value,
                  border: boardSettings.backgroundColor === bg.value ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.2)',
                  color: bg.value === '#ffffff' || bg.value === '#f8fafc' ? '#0f172a' : '#ffffff',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {bg.name}
              </button>
            ))}
          </div>
        </div>

        {/* Styl siatki */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Grid size={16} color="#38bdf8" /> Siatka pomocnicza
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { id: 'dots', label: 'Kropki' },
              { id: 'lines', label: 'Kratka' },
              { id: 'none', label: 'Brak' },
            ].map((g) => (
              <button
                key={g.id}
                onClick={() => onUpdateSettings({ gridType: g.id as any })}
                className={`glass-btn ${boardSettings.gridType === g.id ? 'active' : ''}`}
                style={{
                  padding: '8px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sekcja Eksportu */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Download size={16} color="#38bdf8" /> Eksportuj rysunek
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="glass-btn"
              onClick={onExportPNG}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                justifyContent: 'flex-start',
                gap: 10,
                fontSize: 14,
              }}
            >
              <FileImage size={18} color="#38bdf8" />
              <span>Zapisz jako obraz <strong>PNG</strong></span>
            </button>

            <button
              className="glass-btn"
              onClick={onExportSVG}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                justifyContent: 'flex-start',
                gap: 10,
                fontSize: 14,
              }}
            >
              <Code size={18} color="#818cf8" />
              <span>Zapisz jako wektor <strong>SVG</strong></span>
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="glass-btn"
                onClick={onExportJSON}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <Download size={16} /> Kopia (JSON)
              </button>
              <button
                className="glass-btn"
                onClick={() => jsonInputRef.current?.click()}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <Upload size={16} /> Wczytaj JSON
              </button>
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleJsonFileChange}
              />
            </div>
          </div>
        </div>

        {/* Informacja o PWA */}
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 12,
            color: '#cbd5e1',
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontWeight: 600, marginBottom: 4 }}>
            <Smartphone size={16} />
            <span>Instalacja jako aplikacja (Android / iOS / HyperOS)</span>
          </div>
          <div>
            Możesz zainstalować aplikację na ekranie telefonu:
            <ul style={{ marginLeft: 18, marginTop: 4 }}>
              <li><strong>Android & HyperOS:</strong> Menu przeglądarki (3 kropki) → "Zainstaluj aplikację" lub "Dodaj do ekranu głównego".</li>
              <li><strong>iOS (iPhone/iPad Safari):</strong> Ikona Udostępnij → "Do ekranu początkowego".</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

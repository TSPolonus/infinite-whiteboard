import React, { useRef, useState } from 'react';
import {
  X,
  FileImage,
  Code,
  Download,
  Upload,
  Smartphone,
  Grid,
  Palette,
  Server,
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
  { name: 'Biały (papier)', value: '#ffffff' },
  { name: 'Jasnoszary', value: '#f8fafc' },
  { name: 'Ciemny grafit', value: '#0f172a' },
  { name: 'Czysty czarny', value: '#000000' },
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
  const [customBroker, setCustomBroker] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('infinity_custom_broker') || '' : ''
  );

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
          maxHeight: '90vh',
          overflowY: 'auto',
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
            Ustawienia Tablicy
          </h3>
          <button
            className="glass-btn"
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Wsparcie Rysika i Ochrona przed dłonią (Palm Rejection) */}
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 14,
            padding: 14,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>✍️</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>
                  Ochrona przed dłonią (Palm Rejection)
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Tylko rysik rysuje, dłoń przesuwa i powiększa tablicę
                </div>
              </div>
            </div>

            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={boardSettings.palmRejection}
                onChange={(e) => onUpdateSettings({ palmRejection: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: boardSettings.palmRejection ? '#38bdf8' : '#334155',
                  borderRadius: 24,
                  transition: '0.2s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 18,
                    width: 18,
                    left: boardSettings.palmRejection ? 22 : 3,
                    bottom: 3,
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.2s',
                  }}
                />
              </span>
            </label>
          </div>
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
                  fontWeight: 600,
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
              { id: 'lines', label: 'Kratka (domyślna)' },
              { id: 'dots', label: 'Kropki' },
              { id: 'none', label: 'Gładka' },
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

        {/* Eksport */}
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
            Możesz dodać aplikację do ekranu głównego:
            <ul style={{ marginLeft: 18, marginTop: 4 }}>
              <li><strong>Android & HyperOS:</strong> Menu przeglądarki (3 kropki) → "Zainstaluj aplikację" lub "Dodaj do ekranu głównego".</li>
              <li><strong>iOS (iPhone/iPad Safari):</strong> Ikona Udostępnij → "Do ekranu początkowego".</li>
            </ul>
          </div>
        </div>

        {/* Serwer i Opóźnienie (Warszawa / Gdańsk / Europa) */}
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 12,
              color: '#cbd5e1',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontWeight: 600, marginBottom: 4 }}>
              <Server size={15} />
              <span>Serwer Synchronizacji & Opóźnienie</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, lineHeight: 1.4 }}>
              Aktywne serwery: <strong>HiveMQ & Mosquitto EU (~46ms RTT)</strong> — bezpośrednia trasa światłowodowa do Gdańska i Warszawy.
            </div>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 4 }}>
              Własny broker MQTT (lokalny / serwer w Warszawie / Gdańsku / LAN):
            </div>
            <input
              type="text"
              placeholder="np. wss://moj-serwer.pl:8884/mqtt lub ws://192.168.1.50:9001"
              value={customBroker}
              onChange={(e) => {
                const val = e.target.value;
                setCustomBroker(val);
                if (val.trim()) {
                  localStorage.setItem('infinity_custom_broker', val.trim());
                } else {
                  localStorage.removeItem('infinity_custom_broker');
                }
              }}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 8,
                padding: '7px 10px',
                color: '#f8fafc',
                fontSize: 11,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Numer wersji aplikacji w lewym dolnym rogu */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 12,
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
            Wersja: v2.5.5
          </span>
          <span style={{ fontSize: 11, color: '#475569' }}>
            InfinityDraw
          </span>
        </div>
      </div>
    </div>
  );
};

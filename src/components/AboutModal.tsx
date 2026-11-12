import React, { useEffect } from 'react';
import { Info, ExternalLink, X } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  // Zamknięcie klawiszem Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        zIndex: 200,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 540,
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: 16,
          padding: '24px 26px',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#f8fafc',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Nagłówek okna */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(56, 189, 248, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <Info size={20} />
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 19,
                fontWeight: 700,
                color: '#f8fafc',
                letterSpacing: -0.3,
              }}
            >
              O aplikacji i licencja
            </h2>
          </div>

          <button
            onClick={onClose}
            aria-label="Zamknij"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s, background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Zawartość */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, lineHeight: 1.55 }}>
          
          {/* Nazwa i opis */}
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#38bdf8',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>InfinityDraw by TSPolonus</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#94a3b8',
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '1px 7px',
                  borderRadius: 6,
                }}
              >
                v2.5.6
              </span>
            </div>
            <p style={{ margin: 0, color: '#cbd5e1' }}>
              Nowoczesna aplikacja do rysowania z nieskończoną przestrzenią roboczą (infinite canvas),
              działająca w przeglądarce oraz na tabletach i smartfonach.
            </p>
          </div>

          {/* Licencja */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
              Licencja (CC BY-ND 4.0)
            </div>
            <p style={{ margin: 0, color: '#cbd5e1' }}>
              Aplikacja jest udostępniana na licencji Creative Commons Uznanie autorstwa - Bez utworów
              zależnych 4.0 (CC BY-ND 4.0). Dozwolone jest korzystanie prywatne i komercyjne oraz
              redystrybucja pod warunkiem podania autorstwa i zachowania oryginalnej formy.
            </p>
            <a
              href="https://creativecommons.org/licenses/by-nd/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                color: '#38bdf8',
                textDecoration: 'underline',
                marginTop: 6,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              🔗 Creative Commons Attribution-NoDerivatives 4.0 International (CC BY-ND 4.0)
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Wyłączenie odpowiedzialności */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
              Wyłączenie odpowiedzialności
            </div>
            <p style={{ margin: 0, color: '#cbd5e1' }}>
              Oprogramowanie jest dostarczane w stanie „takim, w jakim jest” (AS IS). Twórca nie ponosi
              żadnej odpowiedzialności za ewentualne szkody bezpośrednie lub pośrednie wynikające
              z korzystania z aplikacji.
            </p>
          </div>

          {/* Wykorzystane komponenty Open Source */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', marginBottom: 6 }}>
              Wykorzystane komponenty Open Source
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                color: '#cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <li>
                <strong>React 19</strong> (MIT License) © Meta Platforms, Inc.
              </li>
              <li>
                <strong>Lucide Icons</strong> (ISC License) © Lucide Contributors
              </li>
              <li>
                <strong>PeerJS</strong> (MIT License) © Michelle Bu, Spencer Tipping & PeerJS Contributors
              </li>
              <li>
                <strong>MQTT.js</strong> (MIT License) © Matteo Collina and MQTT.js contributors
              </li>
              <li>
                <strong>Vite</strong> (MIT License) © Yuxi (Evan) You and Vite contributors
              </li>
            </ul>
          </div>

          {/* Twórca */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
              Twórca
            </div>
            <div style={{ color: '#cbd5e1' }}>
              © 2026 <strong>TSPolonus</strong> •{' '}
              <a
                href="https://github.com/TSPolonus/infinite-whiteboard"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#38bdf8',
                  textDecoration: 'underline',
                }}
              >
                https://github.com/TSPolonus/infinite-whiteboard
              </a>
            </div>
          </div>
        </div>

        {/* Stopka z przyciskiem Zamknij */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: 10,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            marginTop: 4,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: '#27272a',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 8,
              padding: '8px 22px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#3f3f46';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#27272a';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};

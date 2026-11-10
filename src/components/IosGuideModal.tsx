import React from 'react';
import {
  X,
  Share,
  PlusSquare,
  Undo2,
  CheckCircle2,
  Zap,
} from 'lucide-react';

interface IosGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export const IosGuideModal: React.FC<IosGuideModalProps> = ({
  isOpen,
  onClose,
  roomCode,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '94%',
          maxWidth: 580,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 24,
          borderRadius: 20,
          position: 'relative',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            paddingBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>🍎</span>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Wsparcie Apple iOS & iPadOS
              </h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                Instrukcja połączenia, instalacji na pulpicie i gestów dla iPada
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="glass-btn"
            style={{ padding: 6, borderRadius: '50%', color: '#94a3b8' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Section 1: Jak połączyć się z tabletu Apple */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>📲</span>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8', margin: 0 }}>
              1. Jak połączyć się z tabletu Apple (iPad)?
            </h3>
          </div>
          <ol style={{ paddingLeft: 20, margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
            <li>
              Otwórz przeglądarkę <strong>Safari</strong> na swoim iPadzie lub iPhonie.
            </li>
            <li>
              Wejdź na stronę aplikacji lub prześlij link (np. przez AirDrop / wiadomość).
            </li>
            <li>
              Kliknij u góry przycisk <strong>Lobby / Kod</strong>.
            </li>
            <li>
              W polu <em>"Dołącz do innego lobby przez kod"</em> wpisz aktualny kod:{' '}
              <strong style={{ color: '#38bdf8', letterSpacing: 1.5 }}>
                {roomCode || 'KOD POKOJU'}
              </strong>{' '}
              i stuknij <strong>Dołącz</strong>.
            </li>
          </ol>
        </div>

        {/* Section 2: Jak dodać do pulpitu (PWA na pełnym ekranie) */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>🖥️</span>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#c084fc', margin: 0 }}>
              2. Jak dodać do pulpitu (Ekranu początkowego)?
            </h3>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 0, marginBottom: 10 }}>
            Dzięki temu aplikacja działa na <strong>100% pełnym ekranie</strong> bez pasków Safari,
            dokładnie jak natywna aplikacja z App Store!
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                  borderRadius: 8,
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Share size={15} />
              </div>
              <div>
                <strong>Krok 1:</strong> W przeglądarce Safari stuknij ikonę <strong>Udostępnij</strong>{' '}
                (kwadrat ze strzałką w górę u góry lub u dołu ekranu).
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div
                style={{
                  background: 'rgba(192, 132, 252, 0.2)',
                  color: '#c084fc',
                  borderRadius: 8,
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <PlusSquare size={15} />
              </div>
              <div>
                <strong>Krok 2:</strong> Przewiń listę opcji w dół i wybierz{' '}
                <strong>"Do ekranu początkowego" (Add to Home Screen)</strong>.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.2)',
                  color: '#4ade80',
                  borderRadius: 8,
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <CheckCircle2 size={15} />
              </div>
              <div>
                <strong>Krok 3:</strong> Kliknij <strong>"Dodaj"</strong> w prawym górnym rogu.
                Ikona InfinityDraw pojawi się na pulpicie iPada!
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Gesty Procreate & Apple Pencil */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>✌️</span>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#4ade80', margin: 0 }}>
              3. Gesty Apple iPad (Styl Procreate)
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, fontSize: 12.5, color: '#cbd5e1' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(255,255,255,0.04)',
                padding: '8px 12px',
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                  padding: 6,
                  borderRadius: 8,
                }}
              >
                <Undo2 size={16} />
              </div>
              <div>
                <strong style={{ color: '#f8fafc' }}>Cofanie dwoma palcami:</strong> Stuknij{' '}
                <strong>dwukrotnie dwoma palcami</strong> w dowolne miejsce ekranu, aby natychmiast cofnąć ostatnią kreskę lub kształt.
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(255,255,255,0.04)',
                padding: '8px 12px',
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  background: 'rgba(251, 191, 36, 0.2)',
                  color: '#fbbf24',
                  padding: 6,
                  borderRadius: 8,
                }}
              >
                <Zap size={16} />
              </div>
              <div>
                <strong style={{ color: '#f8fafc' }}>Apple Pencil & Ochrona przed dłonią:</strong>{' '}
                Włącz u góry <em>"Rysik rysuje / Dłoń przesuwa"</em>. Apple Pencil rysuje z naciskiem, a oparta dłoń przesuwa płótno bez plamienia.
              </div>
            </div>
          </div>
        </div>

        <button
          className="glass-btn"
          onClick={onClose}
          style={{
            width: '100%',
            padding: '11px',
            background: '#0284c7',
            color: 'white',
            fontWeight: 700,
            fontSize: 14,
            borderRadius: 12,
            justifyContent: 'center',
          }}
        >
          Rozumiem, zamknij instrukcję
        </button>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldAlert } from 'lucide-react';

interface PasswordPromptModalProps {
  isOpen: boolean;
  errorMessage?: string;
  onSubmit: (password: string) => void;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  isOpen,
  errorMessage,
  onSubmit,
}) => {
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      onSubmit(password.trim());
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 20,
          padding: 28,
          background: '#1e293b',
          textAlign: 'center',
          color: '#f8fafc',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: 'rgba(251, 191, 36, 0.15)',
            color: '#fbbf24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
          }}
        >
          <Lock size={26} />
        </div>

        <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          Tablica chroniona hasłem
        </h3>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
          Właściciel tej tablicy ustawił hasło dostępu. Podaj hasło, aby dołączyć i przeglądać rysunek.
        </p>

        {errorMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 13,
              marginBottom: 16,
              textAlign: 'left',
            }}
          >
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            autoFocus
            placeholder="Wpisz hasło..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 12,
              padding: '12px 16px',
              color: 'white',
              fontSize: 16,
              outline: 'none',
              marginBottom: 16,
              textAlign: 'center',
              letterSpacing: 2,
            }}
          />

          <button
            type="submit"
            className="glass-btn"
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 12,
              background: '#0284c7',
              color: 'white',
              fontSize: 15,
              fontWeight: 600,
              gap: 8,
            }}
          >
            <span>Odblokuj tablicę</span>
            <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

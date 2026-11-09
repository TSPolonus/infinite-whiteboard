import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Lock,
  Globe,
  Share2,
  Users,
  KeyRound,
} from 'lucide-react';
import type { BoardSettings } from '../types';
import { hashPassword } from '../utils/webrtc';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardSettings: BoardSettings;
  onUpdateSettings: (settings: Partial<BoardSettings>) => void;
  connectedCount: number;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  boardSettings,
  onUpdateSettings,
  connectedCount,
}) => {
  const [copied, setCopied] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isProtected, setIsProtected] = useState(boardSettings.isPasswordProtected);

  if (!isOpen) return null;

  const currentUrl = window.location.href;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveProtection = async () => {
    if (isProtected) {
      if (!passwordInput.trim() && !boardSettings.passwordHash) {
        alert('Podaj hasło, aby zabezpieczyć tablicę!');
        return;
      }

      let hash = boardSettings.passwordHash;
      if (passwordInput.trim()) {
        hash = await hashPassword(passwordInput.trim());
      }

      onUpdateSettings({
        isPasswordProtected: true,
        passwordHash: hash,
      });
    } else {
      onUpdateSettings({
        isPasswordProtected: false,
        passwordHash: undefined,
      });
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Share2 size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                Udostępnij tablicę
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                Współpraca na żywo z dowolnego urządzenia
              </p>
            </div>
          </div>
          <button
            className="glass-btn"
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Shareable Link Box */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1', display: 'block', marginBottom: 8 }}>
            Link do tablicy (wyślij znajomym lub otwórz na telefonie):
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#0f172a',
              padding: '8px 12px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <input
              type="text"
              readOnly
              value={currentUrl}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: 13,
                width: '100%',
                outline: 'none',
              }}
            />
            <button
              className="glass-btn"
              onClick={handleCopyLink}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: copied ? '#22c55e' : '#0284c7',
                color: '#ffffff',
                fontWeight: 500,
                fontSize: 13,
                gap: 6,
                flexShrink: 0,
              }}
            >
              {copied ? (
                <>
                  <Check size={16} /> Skopiowano!
                </>
              ) : (
                <>
                  <Copy size={16} /> Kopiuj link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Room Status & Password settings */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            padding: 16,
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isProtected ? (
                <Lock size={18} color="#fbbf24" />
              ) : (
                <Globe size={18} color="#4ade80" />
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  Status tablicy: {isProtected ? 'Dostęp za hasłem' : 'Publiczny'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {isProtected
                    ? 'Tylko osoby z hasłem mogą dołączyć i rysować'
                    : 'Każdy kto ma link może dołączyć i rysować'}
                </div>
              </div>
            </div>

            <label
              style={{
                position: 'relative',
                display: 'inline-block',
                width: 44,
                height: 24,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={isProtected}
                onChange={(e) => setIsProtected(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: isProtected ? '#38bdf8' : '#334155',
                  borderRadius: 24,
                  transition: '0.2s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 18,
                    width: 18,
                    left: isProtected ? 22 : 3,
                    bottom: 3,
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.2s',
                  }}
                />
              </span>
            </label>
          </div>

          {isProtected && (
            <div style={{ marginTop: 14 }}>
              <label
                style={{
                  fontSize: 12,
                  color: '#cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <KeyRound size={14} /> Hasło do tablicy:
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder={
                    boardSettings.passwordHash
                      ? '•••••••• (Hasło aktywne - wpisz nowe aby zmienić)'
                      : 'Wpisz nowe hasło...'
                  }
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    color: 'white',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <button
                  className="glass-btn"
                  onClick={handleSaveProtection}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: '#0284c7',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Zapisz
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active Members & Platform Info */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: '#94a3b8',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={15} color="#38bdf8" />
            <span>Osoby na tablicy: <strong>{connectedCount}</strong></span>
          </div>

          <div>Działa na Android, iOS, HyperOS & PC</div>
        </div>
      </div>
    </div>
  );
};

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
  LogIn,
  RotateCcw,
} from 'lucide-react';
import type { BoardSettings } from '../types';
import { hashPassword } from '../utils/webrtc';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardSettings: BoardSettings;
  onUpdateSettings: (settings: Partial<BoardSettings>) => void;
  connectedCount: number;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'host';
  onJoinRoomByCode: (code: string) => void;
  onReconnect: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  boardSettings,
  onUpdateSettings,
  connectedCount,
  connectionStatus,
  onJoinRoomByCode,
  onReconnect,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isProtected, setIsProtected] = useState(boardSettings.isPasswordProtected);

  if (!isOpen) return null;

  const currentUrl = window.location.href;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(boardSettings.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
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

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCodeInput.trim()) {
      onJoinRoomByCode(joinCodeInput.trim().toUpperCase());
      setJoinCodeInput('');
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
                width: 38,
                height: 38,
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
                Lobby i Udostępnianie
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 2 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor:
                      connectionStatus === 'connected' || connectionStatus === 'host'
                        ? '#22c55e'
                        : connectionStatus === 'connecting'
                        ? '#fbbf24'
                        : '#ef4444',
                  }}
                />
                <span style={{ color: '#94a3b8' }}>
                  {connectionStatus === 'host'
                    ? 'Lobby aktywne (jesteś hostem)'
                    : connectionStatus === 'connected'
                    ? 'Połączono z lobby'
                    : connectionStatus === 'connecting'
                    ? 'Łączenie z siecią...'
                    : 'Rozłączono'}
                </span>
                {connectionStatus === 'disconnected' && (
                  <button
                    onClick={onReconnect}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      cursor: 'pointer',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      marginLeft: 6,
                    }}
                  >
                    <RotateCcw size={12} /> Połącz ponownie
                  </button>
                )}
              </div>
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

        {/* Big Room Code Box */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(129, 140, 248, 0.12))',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
              Twój Kod Pokoju (Lobby)
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 4, color: '#38bdf8' }}>
              {boardSettings.roomCode}
            </div>
          </div>
          <button
            className="glass-btn"
            onClick={handleCopyCode}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              background: copiedCode ? '#22c55e' : '#0284c7',
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              gap: 6,
            }}
          >
            {copiedCode ? <Check size={16} /> : <Copy size={16} />}
            <span>{copiedCode ? 'Skopiowano!' : 'Kopiuj kod'}</span>
          </button>
        </div>

        {/* Join another lobby by code */}
        <form onSubmit={handleJoinByCode} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
            Lub dołącz do innego lobby wpisując kod:
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="np. A7X92B"
              maxLength={8}
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              style={{
                flex: 1,
                background: '#0f172a',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                padding: '8px 12px',
                color: '#38bdf8',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 2,
                outline: 'none',
                textTransform: 'uppercase',
              }}
            />
            <button
              type="submit"
              className="glass-btn"
              disabled={!joinCodeInput.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                background: joinCodeInput.trim() ? '#38bdf8' : '#334155',
                color: joinCodeInput.trim() ? '#0f172a' : '#94a3b8',
                fontSize: 13,
                fontWeight: 600,
                gap: 6,
                cursor: joinCodeInput.trim() ? 'pointer' : 'default',
              }}
            >
              <LogIn size={15} />
              <span>Dołącz</span>
            </button>
          </div>
        </form>

        {/* Shareable Link Box */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
            Bezpośredni link do tablicy:
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#0f172a',
              padding: '7px 10px',
              borderRadius: 10,
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
                color: '#94a3b8',
                fontSize: 12,
                width: '100%',
                outline: 'none',
              }}
            />
            <button
              className="glass-btn"
              onClick={handleCopyLink}
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                background: copiedLink ? '#22c55e' : '#334155',
                color: '#ffffff',
                fontWeight: 500,
                fontSize: 12,
                gap: 5,
                flexShrink: 0,
              }}
            >
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedLink ? 'Skopiowano!' : 'Kopiuj link'}</span>
            </button>
          </div>
        </div>

        {/* Room Status & Password settings */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            padding: 14,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isProtected ? <Lock size={17} color="#fbbf24" /> : <Globe size={17} color="#4ade80" />}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  Status lobby: {isProtected ? 'Dostęp za hasłem' : 'Publiczny'}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {isProtected
                    ? 'Tylko osoby z hasłem mogą rysować na tablicy'
                    : 'Każdy z kodem lub linkiem może dołączyć'}
                </div>
              </div>
            </div>

            <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
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
                  borderRadius: 22,
                  transition: '0.2s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 16,
                    width: 16,
                    left: isProtected ? 21 : 3,
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
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <KeyRound size={13} /> Hasło do lobby:
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder={
                    boardSettings.passwordHash
                      ? '•••••••• (Hasło aktywne)'
                      : 'Wpisz hasło...'
                  }
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    color: 'white',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  className="glass-btn"
                  onClick={handleSaveProtection}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: '#0284c7',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  Zapisz
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: '#94a3b8',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={15} color="#38bdf8" />
            <span>Osoby w pokoju: <strong>{connectedCount}</strong></span>
          </div>

          <div>Tablet, Telefon i Komputer</div>
        </div>
      </div>
    </div>
  );
};

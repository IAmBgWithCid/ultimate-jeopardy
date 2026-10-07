import React, { useEffect, useState } from 'react';
import { ASSET_MANIFEST, soundFX } from '../../constants/assetManifest';
import { Lock, ShieldAlert, Sparkles, FolderLock } from 'lucide-react';
import confetti from 'canvas-confetti';

export interface DebuffState {
  type: 'static_jammer' | 'shield_break' | 'crit_proc' | 'dossier_reveal' | null;
  data?: any;
}

interface DebuffOverlayProps {
  debuff: DebuffState;
  onClear: () => void;
}

export const DebuffOverlay: React.FC<DebuffOverlayProps> = ({ debuff, onClear }) => {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!debuff.type) return;

    if (debuff.type === 'crit_proc') {
      soundFX.play('sfx_correct');
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFD700', '#FFA500', '#FFFFFF']
      });
      const timer = setTimeout(() => onClear(), 3500);
      return () => clearTimeout(timer);
    }

    if (debuff.type === 'shield_break') {
      soundFX.play('sfx_buzz_press');
      const timer = setTimeout(() => onClear(), 3000);
      return () => clearTimeout(timer);
    }

    if (debuff.type === 'static_jammer') {
      soundFX.play('sfx_wrong');
      setCountdown(5);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            onClear();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }

    if (debuff.type === 'dossier_reveal') {
      soundFX.play('sfx_correct');
      const timer = setTimeout(() => onClear(), 4000);
      return () => clearTimeout(timer);
    }
  }, [debuff, onClear]);

  if (!debuff.type) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none bg-black/60 backdrop-blur-sm animate-fade-in">
      {/* 1. STATIC JAMMER DEBUFF */}
      {debuff.type === 'static_jammer' && (
        <div className="relative max-w-md w-full bg-neutral-900 border-2 border-red-500 rounded-2xl p-6 text-center shadow-2xl shadow-red-500/30 animate-shake">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-600 text-white p-3 rounded-full border-2 border-white shadow-lg">
            <Lock className="w-8 h-8 animate-pulse" />
          </div>
          <div className="mt-6">
            <span className="inline-block px-3 py-1 bg-red-950/80 border border-red-500 text-red-300 font-mono text-xs uppercase tracking-widest rounded-full mb-3">
              ⚡ EMP Shockwave Active
            </span>
            <h3 className="text-2xl font-black text-red-500 tracking-wider uppercase mb-1">
              BUZZER JAMMED!
            </h3>
            <p className="text-neutral-300 text-sm mb-4">
              <span className="font-bold text-white">{debuff.data?.caster_name || 'An opponent'}</span> cast Static Jammer on you!
            </p>
            <div className="p-3 bg-black/60 rounded-xl border border-red-900 text-xs font-mono text-red-400">
              Buzzer disabled for this clue ({countdown}s)
            </div>
          </div>
        </div>
      )}

      {/* 2. POINT SHIELD BREAK (PENALTY ABSORBED) */}
      {debuff.type === 'shield_break' && (
        <div className="relative max-w-md w-full bg-neutral-900/90 border-2 border-sky-400 rounded-2xl p-6 text-center shadow-2xl shadow-sky-500/40 animate-pulse">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-sky-500 text-white p-3 rounded-full border-2 border-white shadow-lg">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="mt-6">
            <span className="inline-block px-3 py-1 bg-sky-950 border border-sky-400 text-sky-300 font-mono text-xs uppercase tracking-widest rounded-full mb-3">
              Energy Barrier Shattered
            </span>
            <h3 className="text-3xl font-black text-sky-400 tracking-wider uppercase mb-2">
              ABSORBED!
            </h3>
            <p className="text-neutral-200 text-sm">
              Your <span className="font-semibold text-sky-300">Point Shield</span> absorbed the full negative score penalty! Zero points deducted.
            </p>
          </div>
        </div>
      )}

      {/* 3. LOADED DIE (CRIT PROC) */}
      {debuff.type === 'crit_proc' && (
        <div className="relative max-w-md w-full bg-gradient-to-b from-amber-950 to-neutral-950 border-2 border-amber-400 rounded-2xl p-6 text-center shadow-2xl shadow-amber-500/50">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-500 text-black p-3 rounded-full border-2 border-white shadow-lg animate-bounce">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="mt-6">
            <span className="inline-block px-3 py-1 bg-amber-900/60 border border-amber-400 text-amber-200 font-mono text-xs uppercase tracking-widest rounded-full mb-3">
              🎲 25% Critical Hit Proc
            </span>
            <h3 className="text-3xl font-black text-amber-400 tracking-wider uppercase mb-2">
              CRITICAL HIT! (2x)
            </h3>
            <p className="text-amber-100 text-lg font-bold">
              +${debuff.data?.points_awarded ?? 'DOUBLE'} POINTS!
            </p>
          </div>
        </div>
      )}

      {/* 4. CLASSIFIED DOSSIER REVEAL */}
      {debuff.type === 'dossier_reveal' && (
        <div className="relative max-w-md w-full bg-amber-950/95 border-2 border-amber-600 rounded-2xl p-6 text-center shadow-2xl shadow-amber-700/50">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-700 text-amber-100 p-3 rounded-full border-2 border-amber-400 shadow-lg">
            <FolderLock className="w-8 h-8" />
          </div>
          <div className="mt-6">
            <span className="inline-block px-3 py-1 bg-black/60 border border-amber-500 text-amber-400 font-mono text-xs uppercase tracking-widest rounded-full mb-3">
              CONFIDENTIAL // EYES ONLY
            </span>
            <h3 className="text-xl font-mono text-amber-300 tracking-wider uppercase mb-1">
              SECRET PARTNER INTEL
            </h3>
            <div className="my-4 py-3 px-4 bg-black/70 rounded-xl border border-dashed border-amber-600 text-2xl font-black text-amber-400 tracking-widest uppercase">
              PARTNER: {debuff.data?.partner_name || 'REDACTED'}
            </div>
            <p className="text-amber-200/80 text-xs">
              Your partner has not been notified. Keep your alliance covert!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

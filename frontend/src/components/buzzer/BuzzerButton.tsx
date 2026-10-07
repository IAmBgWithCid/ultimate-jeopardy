import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Zap, Lock, ShieldAlert } from 'lucide-react';
import { soundFX } from '../../constants/assetManifest';

interface BuzzerButtonProps {
  isUnlocked: boolean;
  unlockTimestampMs: number;
  isJammed?: boolean;
  isAuthorLocked?: boolean;
  authorDelaySeconds?: number;
  onBuzz: (reactionDeltaMs: number) => void;
  disabled?: boolean;
}

export const BuzzerButton: React.FC<BuzzerButtonProps> = ({
  isUnlocked,
  unlockTimestampMs,
  isJammed = false,
  isAuthorLocked = false,
  authorDelaySeconds = 0,
  onBuzz,
  disabled = false,
}) => {
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const [reactionDelta, setReactionDelta] = useState<number | null>(null);
  const [localAuthorTimer, setLocalAuthorTimer] = useState<number>(authorDelaySeconds);
  const renderTimestampRef = useRef<number>(0);

  // When buzzer unlocks or new clue timestamp is received, reset buzz state
  useEffect(() => {
    if (isUnlocked && !disabled && !isJammed) {
      renderTimestampRef.current = window.performance.now();
      setHasBuzzed(false);
      setReactionDelta(null);

      // Trigger light mobile vibration
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30);
      }
    }
  }, [isUnlocked, unlockTimestampMs]);

  // Handle author delay timer
  useEffect(() => {
    if (isAuthorLocked && authorDelaySeconds > 0) {
      setLocalAuthorTimer(authorDelaySeconds);
      const interval = setInterval(() => {
        setLocalAuthorTimer((prev) => {
          if (prev <= 0.1) {
            clearInterval(interval);
            return 0;
          }
          return Math.round((prev - 0.1) * 10) / 10;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isAuthorLocked, authorDelaySeconds]);

  const handleTriggerBuzz = useCallback(() => {
    if (!isUnlocked || disabled || hasBuzzed || isJammed || (isAuthorLocked && localAuthorTimer > 0)) {
      return;
    }

    const now = window.performance.now();
    const deltaMs = Math.max(80, Math.round(now - renderTimestampRef.current));

    setHasBuzzed(true);
    setReactionDelta(deltaMs);

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([60, 40, 60]);
    }

    // Audio cue
    soundFX.play('sfx_buzz_press');

    // Send buzz packet to server
    onBuzz(deltaMs);
  }, [isUnlocked, disabled, hasBuzzed, isJammed, isAuthorLocked, localAuthorTimer, onBuzz]);

  // Global Spacebar Key Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && isUnlocked) {
        e.preventDefault();
        handleTriggerBuzz();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTriggerBuzz, isUnlocked]);

  // Determine current button visual state
  const isAuthorPending = isAuthorLocked && localAuthorTimer > 0;
  const canBuzz = isUnlocked && !disabled && !hasBuzzed && !isJammed && !isAuthorPending;

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full max-w-sm mx-auto">
      {/* State / Lockout Notice */}
      <div className="mb-4 h-8 flex items-center justify-center">
        {isJammed ? (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-red-950 border border-red-500 text-red-300 rounded-full font-mono text-xs font-bold animate-pulse">
            <ShieldAlert className="w-4 h-4" /> STATIC JAMMER ACTIVE
          </span>
        ) : isAuthorPending ? (
          <span className="px-3 py-1 bg-amber-950 border border-amber-500 text-amber-300 rounded-full font-mono text-xs font-bold">
            Author Delay ({localAuthorTimer.toFixed(1)}s)
          </span>
        ) : hasBuzzed ? (
          <span className="px-3 py-1 bg-blue-950 border border-blue-400 text-blue-300 rounded-full font-mono text-xs font-bold">
            ⚡ Buzzed in {reactionDelta}ms!
          </span>
        ) : isUnlocked ? (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950 border border-emerald-400 text-emerald-300 rounded-full font-mono text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
            PRESS OR TAP SPACEBAR!
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-700 text-slate-400 rounded-full font-mono text-xs">
            <Lock className="w-3.5 h-3.5" /> Buzzers Locked
          </span>
        )}
      </div>

      {/* Giant Round Tactile Buzzer Button */}
      <button
        type="button"
        onClick={handleTriggerBuzz}
        disabled={!canBuzz}
        className={`relative w-64 h-64 md:w-72 md:h-72 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-150 select-none
          ${
            isJammed
              ? 'bg-neutral-800 border-8 border-neutral-700 grayscale cursor-not-allowed opacity-60'
              : isAuthorPending
              ? 'bg-amber-950/70 border-8 border-amber-700/60 cursor-not-allowed'
              : hasBuzzed
              ? 'bg-gradient-to-b from-blue-600 to-indigo-800 border-8 border-blue-400 shadow-blue-500/50 scale-95'
              : canBuzz
              ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 border-8 border-white shadow-[0_0_50px_rgba(16,185,129,0.7)] cursor-pointer active:scale-95 active:shadow-[0_0_80px_rgba(16,185,129,0.9)] animate-pulse'
              : 'bg-slate-800 border-8 border-slate-700 cursor-not-allowed opacity-50'
          }
        `}
      >
        <Zap
          className={`w-20 h-20 mb-2 transition-transform ${
            canBuzz ? 'text-white fill-white scale-110' : hasBuzzed ? 'text-blue-200 fill-blue-200' : 'text-slate-500'
          }`}
        />
        <span
          className={`font-black text-2xl md:text-3xl uppercase tracking-wider ${
            canBuzz ? 'text-white drop-shadow-md' : 'text-slate-400'
          }`}
        >
          {hasBuzzed ? 'BUZZED!' : canBuzz ? 'BUZZ!' : 'LOCKED'}
        </span>
      </button>

      {/* Helpful keyboard hint */}
      <span className="mt-4 text-[11px] font-mono text-slate-500">
        Desktop: Tap <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">Spacebar</kbd> to buzz
      </span>
    </div>
  );
};

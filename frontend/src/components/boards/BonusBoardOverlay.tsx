import React, { useState, useEffect } from 'react';
import { MarkdownViewer } from '../markdown/MarkdownViewer';
import { Bomb, AlertTriangle, ShieldCheck, Zap, User, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { soundFX } from '../../constants/assetManifest';

interface BonusBoardOverlayProps {
  clue: any;
  isHost?: boolean;
  buzzerState?: {
    is_unlocked: boolean;
    winner?: {
      player_id: string;
      winner_name?: string;
      display_name?: string;
      reaction_delta_ms: number;
    } | null;
  };
  onUnlockBuzzer?: () => void;
  onJudge?: (passed: boolean) => void;
  onClose?: () => void;
}

export const BonusBoardOverlay: React.FC<BonusBoardOverlayProps> = ({
  clue,
  isHost = false,
  buzzerState,
  onUnlockBuzzer,
  onJudge,
  onClose,
}) => {
  const [authorTimer, setAuthorTimer] = useState<number>(3.5);
  const [authorUnlocked, setAuthorUnlocked] = useState<boolean>(false);

  useEffect(() => {
    soundFX.play('sfx_bomb_explode');
    const interval = setInterval(() => {
      setAuthorTimer((prev) => {
        if (prev <= 0.1) {
          clearInterval(interval);
          setAuthorUnlocked(true);
          return 0;
        }
        return Math.round((prev - 0.1) * 10) / 10;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const winner = buzzerState?.winner;
  const isUnlocked = buzzerState?.is_unlocked;
  const authorName = clue?.author_name || 'Contestant';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-neutral-950/95 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-4xl bg-gradient-to-b from-neutral-900 to-black border-4 border-amber-500 rounded-3xl shadow-[0_0_60px_rgba(245,158,11,0.3)] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Warning Hazard Bar */}
        <div className="bg-gradient-to-r from-amber-600 via-red-600 to-amber-600 py-2.5 px-6 flex items-center justify-between text-black font-black uppercase tracking-widest text-xs md:text-sm animate-pulse">
          <div className="flex items-center gap-2">
            <Bomb className="w-5 h-5" />
            <span>BONUS MINEFIELD DETONATED</span>
          </div>
          <span className="font-mono">AUTHOR QUESTION DISCOVERED</span>
        </div>

        {/* Header: Author & Multipliers */}
        <div className="p-6 bg-neutral-900/90 border-b border-amber-500/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-amber-400">
                Player-Submitted Question
              </span>
              <div className="flex items-center gap-2 mt-1">
                <User className="w-5 h-5 text-amber-300" />
                <h3 className="text-xl md:text-2xl font-black text-white">
                  Authored by <span className="text-amber-400 underline decoration-amber-500">{authorName}</span>
                </h3>
              </div>
            </div>

            {/* Steal & Author Multiplier Badges */}
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-center">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                  Room Steal Multiplier
                </span>
                <span className="text-lg font-black text-emerald-400">1.5x Multiplier</span>
              </div>

              <div className={`px-3 py-2 rounded-xl text-center border transition-all ${
                authorUnlocked
                  ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                  : 'bg-neutral-800/80 border-neutral-700 text-neutral-400'
              }`}>
                <span className="block text-[10px] font-mono uppercase tracking-wider">
                  Author Multiplier
                </span>
                <div className="flex items-center justify-center gap-1">
                  {!authorUnlocked && <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                  <span className="text-lg font-black">
                    {authorUnlocked ? '0.5x Multiplier' : `Locked (${authorTimer.toFixed(1)}s)`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Zero Penalty Notice */}
          <div className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-sky-950/60 border border-sky-800 rounded-lg text-xs font-mono text-sky-300">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <span>ZERO PENALTY: No negative point deductions on incorrect guesses for this bonus tile!</span>
          </div>
        </div>

        {/* Body: Clue Content */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="text-xl md:text-3xl font-medium text-white leading-relaxed">
            <MarkdownViewer content={clue.clue_markdown} />
          </div>

          {isHost && (
            <div className="mt-6 p-4 bg-black/60 rounded-xl border border-amber-500/30">
              <span className="text-xs font-mono uppercase text-amber-400 tracking-wider block mb-1">
                Correct Answer:
              </span>
              <p className="text-emerald-400 font-mono text-lg font-bold">
                {clue.correct_answer}
              </p>
            </div>
          )}
        </div>

        {/* Footer: Buzzer & Judge Controls */}
        <div className="p-5 bg-neutral-950 border-t border-amber-500/30 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {winner ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500 text-amber-300 rounded-xl font-mono text-sm font-bold animate-pulse">
                <Zap className="w-5 h-5 fill-amber-400 text-amber-400" />
                <span>Buzz Winner: {winner.winner_name || winner.display_name} ({winner.reaction_delta_ms}ms)</span>
              </div>
            ) : isUnlocked ? (
              <span className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500 text-emerald-400 rounded-xl font-mono text-sm font-bold">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping inline-block"></span>
                BUZZERS OPEN FOR STEAL
              </span>
            ) : (
              <span className="px-4 py-2 bg-neutral-800 border border-neutral-700 text-neutral-400 rounded-xl font-mono text-sm">
                BUZZERS ARMED
              </span>
            )}
          </div>

          {isHost && (
            <div className="flex items-center gap-3">
              {!isUnlocked && !winner && (
                <button
                  type="button"
                  onClick={onUnlockBuzzer}
                  className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider rounded-xl shadow-lg transition-transform active:scale-95"
                >
                  Unlock Buzzer
                </button>
              )}

              {winner && onJudge && (
                <>
                  <button
                    type="button"
                    onClick={() => onJudge(true)}
                    className="py-3 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Correct
                  </button>
                  <button
                    type="button"
                    onClick={() => onJudge(false)}
                    className="py-3 px-5 bg-neutral-800 hover:bg-neutral-700 text-slate-300 font-bold text-sm rounded-xl flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Missed (0 Penalty)
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

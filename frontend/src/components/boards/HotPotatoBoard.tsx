import React from 'react';
import { Flame, Bomb, ArrowRight, User, AlertOctagon } from 'lucide-react';
import { MarkdownViewer } from '../markdown/MarkdownViewer';

interface HotPotatoBoardProps {
  timerRemainingMs: number;
  holderId?: string | null;
  players: any[];
  activeClue?: any;
  isHost?: boolean;
  topicPeek?: string | null;
  onPassPotato?: (targetPlayerId: string) => void;
  currentPlayerId?: string;
}

export const HotPotatoBoard: React.FC<HotPotatoBoardProps> = ({
  timerRemainingMs,
  holderId,
  players,
  activeClue,
  isHost = false,
  topicPeek,
  onPassPotato,
  currentPlayerId,
}) => {
  const secondsLeft = Math.max(0, Math.ceil(timerRemainingMs / 1000));
  const isCritical = secondsLeft <= 15;
  const isDetonated = secondsLeft === 0;

  const currentHolder = players.find((p) => p.id === holderId);
  const isMeHolder = currentPlayerId === holderId;

  // Eligible targets (players who are eligible and not the current holder)
  const eligibleTargets = players.filter((p) => p.is_hot_potato_eligible && p.id !== holderId);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8 flex flex-col items-center">
      {/* 90-Second Master Countdown Meter */}
      <div className={`w-full max-w-md p-6 rounded-3xl border-4 text-center shadow-2xl transition-all duration-300 ${
        isDetonated
          ? 'bg-red-950 border-red-600 shadow-red-600/50'
          : isCritical
          ? 'bg-red-950/80 border-red-500 shadow-red-500/40 animate-pulse'
          : 'bg-slate-900 border-amber-500 shadow-amber-500/20'
      }`}>
        <div className="flex items-center justify-center gap-2 mb-1">
          <Bomb className={`w-6 h-6 ${isCritical ? 'text-red-400 animate-spin' : 'text-amber-400'}`} />
          <span className="font-mono text-xs uppercase tracking-widest text-slate-300 font-bold">
            Hot Potato Master Timer
          </span>
        </div>

        <div className={`font-mono text-5xl md:text-7xl font-black ${
          isDetonated ? 'text-red-500' : isCritical ? 'text-red-400' : 'text-amber-400'
        }`}>
          {secondsLeft}s
        </div>

        <p className="text-[11px] font-mono text-slate-400 mt-2">
          {isDetonated
            ? '💥 DETONATION! Bomb exploded on holder (-$1,500 Points)!'
            : 'Whoever holds the clue at 0s takes an explosive -$1,500 penalty!'}
        </p>
      </div>

      {/* Current Bomb Holder Spotlight */}
      <div className="my-6 p-4 rounded-2xl bg-slate-900/90 border-2 border-red-500/80 flex items-center gap-4 shadow-xl">
        <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white animate-bounce shadow-lg shadow-red-600/40">
          <Flame className="w-7 h-7 fill-white" />
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-red-400 font-bold block">
            Current Bomb Holder
          </span>
          <h3 className="text-xl md:text-2xl font-black text-white">
            {currentHolder ? currentHolder.display_name : 'Selecting Holder...'}
            {isMeHolder && ' (YOU!)'}
          </h3>
        </div>
      </div>

      {/* Clue Card */}
      {activeClue && (
        <div className="w-full bg-slate-900 border-2 border-blue-600/70 rounded-2xl p-6 md:p-8 shadow-2xl mb-6">
          <span className="text-xs font-mono uppercase tracking-wider text-sky-400 block mb-2">
            Active Clue (Hot Potato)
          </span>
          <div className="text-xl md:text-2xl font-semibold text-slate-100">
            <MarkdownViewer content={activeClue.clue_markdown} />
          </div>
          {isHost && (
            <div className="mt-4 p-3 bg-black/60 rounded-xl border border-emerald-500/40 text-emerald-400 font-mono text-sm">
              Answer: {activeClue.correct_answer}
            </div>
          )}
        </div>
      )}

      {/* Topic Peek & 4s Pass HUD (Visible to Holder) */}
      {isMeHolder && !isDetonated && (
        <div className="w-full max-w-lg p-5 rounded-2xl bg-amber-950/90 border-2 border-amber-500 shadow-2xl animate-fade-in text-center">
          <span className="px-3 py-1 bg-black/60 border border-amber-400 rounded-full text-xs font-mono text-amber-300 uppercase tracking-widest font-bold inline-block mb-3">
            Topic Peek & Pass Window
          </span>

          {topicPeek && (
            <div className="my-2 p-3 bg-black/70 rounded-xl border border-amber-600 text-amber-300 font-bold text-sm">
              Next Clue Teaser: "{topicPeek}"
            </div>
          )}

          <p className="text-xs text-slate-300 mb-3">
            Select an eligible player to pass the question to:
          </p>

          <div className="flex flex-wrap gap-2 justify-center">
            {eligibleTargets.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => onPassPotato?.(target.id)}
                className="py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider shadow-md flex items-center gap-1 transition-transform active:scale-95"
              >
                <span>Pass to {target.display_name}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ))}
            {eligibleTargets.length === 0 && (
              <span className="text-xs text-slate-400 italic">No eligible targets remaining. Resetting pool...</span>
            )}
          </div>
        </div>
      )}

      {/* Anti-Tunneling Queue Display */}
      <div className="w-full max-w-md mt-6 p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-2">
          Anti-Dogpiling Queue Status
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {players.map((p) => (
            <div
              key={p.id}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 border ${
                p.is_hot_potato_eligible
                  ? 'bg-slate-900 border-slate-700 text-slate-300'
                  : 'bg-slate-950 border-slate-800 text-slate-600 opacity-60'
              }`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: p.color_hex || '#3B82F6' }}
              />
              <span>{p.display_name}</span>
              <span className="text-[10px]">
                {p.is_hot_potato_eligible ? '✓' : 'passed'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Coins, Zap, Bomb, Target } from 'lucide-react';

interface ContestantsTopRowProps {
  players: any[];
  currentPlayerId?: string;
  activePickerId?: string | null;
  buzzWinnerId?: string | null;
  buzzQueue?: any[];
  onSelectPicker?: (playerId: string) => void;
  className?: string;
}

export const ContestantsTopRow: React.FC<ContestantsTopRowProps> = ({
  players = [],
  currentPlayerId,
  activePickerId,
  buzzWinnerId,
  buzzQueue = [],
  onSelectPicker,
  className = '',
}) => {
  if (!players || players.length === 0) {
    return null;
  }

  return (
    <div className={`w-full overflow-x-auto py-2 px-3 bg-[#120826]/90 border-b border-white/10 backdrop-blur-md relative z-30 shadow-md ${className}`}>
      <div className="flex items-center gap-2 md:gap-3 flex-nowrap min-w-max mx-auto justify-center">
        {players.map((p) => {
          const isMe = p.id === currentPlayerId;
          const isPicker = p.id === activePickerId;
          const isBuzzWinner = p.id === buzzWinnerId;
          const queueIndex = buzzQueue?.findIndex((c: any) => c.player_id === p.id);
          const isQueued = queueIndex !== undefined && queueIndex >= 0 && !isBuzzWinner;

          return (
            <div
              key={p.id}
              onClick={() => onSelectPicker && onSelectPicker(p.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-all shadow-md ${
                onSelectPicker ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
              } ${
                isPicker
                  ? 'bg-amber-950/90 border-2 border-amber-400 text-white shadow-amber-500/20 ring-1 ring-amber-400'
                  : isBuzzWinner
                  ? 'bg-emerald-950/90 border-2 border-emerald-400 text-white shadow-emerald-500/30'
                  : isQueued
                  ? 'bg-sky-950/90 border-2 border-sky-400 text-white'
                  : 'bg-[#1D103A]/90 border border-white/15 text-slate-200 hover:border-white/30'
              }`}
            >
              {/* Avatar circle */}
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white font-black text-[10px] shadow"
                style={{ backgroundColor: p.color_hex || '#EC4899' }}
              >
                {p.display_name?.slice(0, 1)?.toUpperCase() || 'P'}
              </div>

              {/* Player Name */}
              <span className="font-bold text-white max-w-[100px] truncate">
                {p.display_name}
              </span>
              {isMe && (
                <span className="text-[10px] text-amber-300 font-bold">(You)</span>
              )}

              {/* Status Badge */}
              {isPicker && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-black text-[9px] font-black uppercase flex items-center gap-0.5">
                  <Target className="w-2.5 h-2.5 fill-black" /> Picker
                </span>
              )}
              {isBuzzWinner && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-400 text-black text-[9px] font-black uppercase flex items-center gap-0.5 animate-pulse">
                  <Zap className="w-2.5 h-2.5 fill-black" /> #1 Buzz
                </span>
              )}
              {isQueued && (
                <span className="px-1.5 py-0.2 rounded-full bg-sky-500 text-black text-[9px] font-black uppercase flex items-center gap-0.5">
                  #{queueIndex + 1}
                </span>
              )}

              {/* Score Currency ($) */}
              <span className="font-bold text-emerald-400 text-xs px-2 py-0.5 rounded bg-black/40 border border-emerald-500/30">
                ${(p.score ?? 0).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';
import { Coins, Zap, Bomb, Target, Award } from 'lucide-react';

interface ParticipantSquareFramesProps {
  players: any[];
  currentPlayerId?: string;
  activePickerId?: string | null;
  buzzWinnerId?: string | null;
  hotPotatoHolderId?: string | null;
  onSelectPicker?: (playerId: string) => void;
  className?: string;
}

export const ParticipantSquareFrames: React.FC<ParticipantSquareFramesProps> = ({
  players = [],
  currentPlayerId,
  activePickerId,
  buzzWinnerId,
  hotPotatoHolderId,
  onSelectPicker,
  className = '',
}) => {
  if (!players || players.length === 0) {
    return null;
  }

  return (
    <div className={`w-full overflow-x-auto py-2 ${className}`}>
      <div className="flex items-center justify-center gap-2.5 sm:gap-3 flex-wrap">
        {players.map((p) => {
          const isMe = p.id === currentPlayerId;
          const isPicker = p.id === activePickerId;
          const isBuzzWinner = p.id === buzzWinnerId;
          const isBombHolder = p.id === hotPotatoHolderId;

          return (
            <div
              key={p.id}
              onClick={() => onSelectPicker && onSelectPicker(p.id)}
              className={`relative flex flex-col justify-between items-center text-center p-2.5 rounded-2xl w-28 sm:w-32 md:w-36 h-28 sm:h-32 md:h-36 transition-all shadow-xl backdrop-blur-md ${
                onSelectPicker ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
              } ${
                isPicker
                  ? 'border-2 border-amber-400 bg-[#2C1854]/95 shadow-amber-500/20 shadow-2xl ring-2 ring-amber-400/50 scale-[1.03]'
                  : isBuzzWinner
                  ? 'border-2 border-emerald-400 bg-[#0F2F28]/95 shadow-emerald-500/30 scale-[1.03]'
                  : isBombHolder
                  ? 'border-2 border-red-500 bg-[#3B1118]/95 shadow-red-500/30 animate-pulse'
                  : 'border border-white/15 bg-[#170B2F]/90 hover:border-white/30'
              }`}
              style={{
                boxShadow: isPicker
                  ? `0 0 15px ${p.color_hex || '#EC4899'}88, 0 8px 20px rgba(0,0,0,0.6)`
                  : '0 8px 20px rgba(0,0,0,0.5)',
              }}
            >
              {/* Status Badges Overlay */}
              <div className="absolute -top-2 inset-x-0 flex justify-center gap-1">
                {isPicker && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-black text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-md">
                    <Target className="w-2.5 h-2.5 fill-black" /> Picker
                  </span>
                )}
                {isBuzzWinner && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-black text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-md animate-pulse">
                    <Zap className="w-2.5 h-2.5 fill-black" /> Buzz
                  </span>
                )}
                {isBombHolder && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow-md">
                    <Bomb className="w-2.5 h-2.5" /> Bomb
                  </span>
                )}
              </div>

              {/* Avatar & Display Name */}
              <div className="flex flex-col items-center mt-1 w-full">
                <div
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white font-black text-xs shadow-md border-2 border-white/30 mb-1"
                  style={{ backgroundColor: p.color_hex || '#EC4899' }}
                >
                  {p.display_name?.slice(0, 1)?.toUpperCase() || 'P'}
                </div>
                <div className="flex items-center gap-1 max-w-full px-1">
                  <span className="font-display font-black text-xs text-white truncate drop-shadow">
                    {p.display_name}
                  </span>
                  {isMe && (
                    <span className="text-[9px] font-mono font-bold text-amber-300">
                      (You)
                    </span>
                  )}
                </div>
              </div>

              {/* Currency ($ Balance) */}
              <div className="my-0.5">
                <span className="font-mono text-sm sm:text-base font-black text-emerald-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  ${(p.score ?? 0).toLocaleString()}
                </span>
              </div>

              {/* Bounty Tokens Balance */}
              <div className="w-full flex items-center justify-center">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/60 text-amber-300 font-mono text-[10px] font-bold shadow-inner">
                  <Coins className="w-2.5 h-2.5 text-amber-400" />
                  <span>{p.token_balance ?? 0}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

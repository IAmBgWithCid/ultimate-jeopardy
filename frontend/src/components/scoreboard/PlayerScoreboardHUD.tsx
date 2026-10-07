import React, { useState } from 'react';
import { Users, Coins, Wifi, Flame, ChevronDown, ChevronUp } from 'lucide-react';

export interface PlayerInfo {
  id: string;
  display_name: string;
  color_hex: string;
  secret_team_id: number;
  score: number;
  token_balance: number;
  is_connected: boolean;
  is_hot_potato_eligible?: boolean;
}

interface PlayerScoreboardHUDProps {
  players: PlayerInfo[];
  currentPlayerId?: string;
  isHotPotatoRound?: boolean;
  hotPotatoHolderId?: string | null;
  pingMs?: number;
}

export const PlayerScoreboardHUD: React.FC<PlayerScoreboardHUDProps> = ({
  players,
  currentPlayerId,
  isHotPotatoRound = false,
  hotPotatoHolderId,
  pingMs = 18
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl shadow-xl overflow-hidden backdrop-blur-md">
      {/* Header bar with toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/80 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-sky-400" />
          <span>Live Opponent Standings ({players.length})</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block mr-0.5"></span>
            <Wifi className="w-3.5 h-3.5 inline" />
            <span>{pingMs}ms</span>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Opponent list */}
      {isExpanded && (
        <div className="p-2 space-y-1.5 max-h-56 overflow-y-auto">
          {players.map((p, idx) => {
            const isMe = p.id === currentPlayerId;
            const isHoldingBomb = isHotPotatoRound && hotPotatoHolderId === p.id;

            return (
              <div
                key={p.id}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                  isMe
                    ? 'bg-blue-950/60 border-blue-500/80'
                    : isHoldingBomb
                    ? 'bg-red-950/70 border-red-500 animate-pulse'
                    : 'bg-slate-800/50 border-slate-700/60'
                }`}
              >
                {/* Left: Rank & Avatar & Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-slate-400 w-4 text-right">
                    #{idx + 1}
                  </span>
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color_hex || '#3B82F6' }}
                  />
                  <div className="truncate">
                    <span className={`text-xs font-medium truncate ${isMe ? 'text-blue-300 font-bold' : 'text-slate-200'}`}>
                      {p.display_name}
                      {isMe && ' (You)'}
                    </span>
                  </div>
                </div>

                {/* Right: Badges, Tokens, and Score */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Hot Potato Status in Round 4 */}
                  {isHotPotatoRound && (
                    <>
                      {isHoldingBomb ? (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-600 text-white rounded text-[10px] font-mono font-bold animate-bounce">
                          <Flame className="w-3 h-3" /> BOMB
                        </span>
                      ) : p.is_hot_potato_eligible ? (
                        <span className="px-1.5 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded text-[9px] font-mono">
                          Eligible
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-slate-900 text-slate-500 rounded text-[9px] font-mono">
                          Passed
                        </span>
                      )}
                    </>
                  )}

                  {/* Public Bounty Token Balance */}
                  <div className="flex items-center gap-1 text-amber-400 font-mono text-xs" title="Bounty Tokens">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>{p.token_balance}</span>
                  </div>

                  {/* Score */}
                  <span
                    className={`font-mono text-xs font-bold ${
                      p.score >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ${p.score.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

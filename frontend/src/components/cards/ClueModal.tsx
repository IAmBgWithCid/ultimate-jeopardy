import React, { useState } from 'react';
import { MarkdownViewer } from '../markdown/MarkdownViewer';
import { Award, Zap, CheckCircle2, XCircle, Eye, EyeOff, User, Radio, Play, Pause, RotateCcw } from 'lucide-react';

interface ClueModalProps {
  clue: any;
  categoryName: string;
  isHost?: boolean;
  players?: any[];
  buzzerState?: {
    is_unlocked: boolean;
    winner?: {
      player_id: string;
      winner_name?: string;
      display_name?: string;
      reaction_delta_ms: number;
    } | null;
    candidates?: any[];
    queue?: any[];
  };
  onUnlockBuzzer?: () => void;
  onJudge?: (passed: boolean, playerId?: string) => void;
  onSelectBuzzer?: (playerId: string) => void;
  onClose?: () => void;
  activeItemBanners?: string[];
  onMediaControl?: (action: 'play' | 'pause' | 'seek', src: string, currentTime?: number) => void;
  mediaSyncState?: {
    action: string;
    media_src: string;
    current_time?: number;
    timestamp?: number;
  } | null;
}

export const ClueModal: React.FC<ClueModalProps> = ({
  clue,
  categoryName,
  isHost = false,
  players = [],
  buzzerState,
  onUnlockBuzzer,
  onJudge,
  onSelectBuzzer,
  onClose,
  activeItemBanners = [],
  onMediaControl,
  mediaSyncState,
}) => {
  const [showAnswer, setShowAnswer] = useState(false);

  const winner = buzzerState?.winner;
  const isUnlocked = buzzerState?.is_unlocked;
  const queue = buzzerState?.queue || buzzerState?.candidates || [];

  const audioMatch = /\[audio:\s*([^\]]+)\]/i.exec(clue?.clue_markdown || '');
  const videoMatch = /\[video:\s*([^\]]+)\]/i.exec(clue?.clue_markdown || '');
  const hasMedia = Boolean(audioMatch || videoMatch);
  const firstMediaSrc = (audioMatch?.[1] || videoMatch?.[1] || '').trim();

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 md:p-8 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border-2 border-blue-600/80 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Banner notification strip (Item casts) */}
        {activeItemBanners.length > 0 && (
          <div className="bg-gradient-to-r from-red-600 via-amber-600 to-purple-600 px-4 py-2 text-white font-mono text-xs font-bold text-center tracking-wider animate-pulse flex items-center justify-center gap-2">
            <Zap className="w-4 h-4" />
            <span>{activeItemBanners[activeItemBanners.length - 1]}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-sky-400">
              {categoryName}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-display-title text-2xl md:text-3xl text-amber-400">
                ${clue.base_points}
              </span>
              {clue.author_name && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700 text-xs font-medium">
                  <User className="w-3 h-3" /> Submitted by {clue.author_name}
                </span>
              )}
            </div>
          </div>

          {/* Buzzer Status Indicator */}
          <div className="flex items-center gap-2">
            {winner ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500 text-amber-300 rounded-xl font-mono text-sm font-bold animate-pulse">
                <Zap className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{winner.winner_name || winner.display_name} ({winner.reaction_delta_ms}ms)</span>
              </div>
            ) : isUnlocked ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500 text-emerald-400 rounded-xl font-mono text-xs font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
                BUZZERS OPEN
              </span>
            ) : (
              <span className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-400 rounded-xl font-mono text-xs">
                BUZZERS LOCKED
              </span>
            )}
          </div>
        </div>

        {/* Host Broadcast Media Controls Bar */}
        {isHost && hasMedia && (
          <div className="bg-gradient-to-r from-blue-950 via-purple-950 to-pink-950 border-b border-white/10 px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-mono text-amber-300 font-bold">
              <Radio className="w-4 h-4 text-pink-400 animate-pulse" />
              <span>BROADCAST MEDIA CONTROLS (Syncs to All Screens):</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onMediaControl?.('play', firstMediaSrc || '', 0)}
                className="px-3 py-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-mono text-xs font-bold flex items-center gap-1 shadow transition-transform active:scale-95"
                title="Play media on all contestant and TV screens"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Play All
              </button>
              <button
                type="button"
                onClick={() => onMediaControl?.('pause', firstMediaSrc || '')}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-mono text-xs font-bold flex items-center gap-1 shadow transition-colors"
                title="Pause media on all screens"
              >
                <Pause className="w-3.5 h-3.5" /> Pause All
              </button>
              <button
                type="button"
                onClick={() => onMediaControl?.('seek', firstMediaSrc || '', 0)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-mono text-xs font-bold flex items-center gap-1 shadow transition-colors"
                title="Restart media from beginning"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restart
              </button>
            </div>
          </div>
        )}

        {/* Clue Content */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="text-lg md:text-2xl font-medium text-slate-100 leading-relaxed">
            <MarkdownViewer
              content={clue.clue_markdown}
              isHost={isHost}
              onMediaControl={onMediaControl}
              mediaSyncState={mediaSyncState}
            />
          </div>

          {/* Correct Answer Section (Host view) */}
          {isHost && (
            <div className="mt-8 pt-6 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Host Answer Key:
                </span>
                <button
                  type="button"
                  onClick={() => setShowAnswer(!showAnswer)}
                  className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-mono"
                >
                  {showAnswer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showAnswer ? 'Hide' : 'Reveal'}
                </button>
              </div>

              {showAnswer ? (
                <div className="p-4 bg-slate-950 rounded-xl border border-emerald-500/40 text-emerald-400 font-mono text-base font-bold">
                  {clue.correct_answer}
                </div>
              ) : (
                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-slate-600 font-mono text-sm italic">
                  Click 'Reveal' to view correct answer
                </div>
              )}
            </div>
          )}
        </div>

        {/* Host Control Action Footer */}
        {isHost && (
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col gap-3">
            {/* Buzzer Queue (Ranked Order with Delays) */}
            {queue.length > 0 && (
              <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                <span className="text-[11px] font-mono uppercase text-sky-400 font-bold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Buzzer Order ({queue.length} buzzed in):
                </span>
                <div className="flex flex-wrap gap-2">
                  {queue.map((c: any, idx: number) => {
                    const isCurrentWinner = winner && winner.player_id === c.player_id;
                    return (
                      <div
                        key={c.player_id}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all ${
                          isCurrentWinner
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold ring-1 ring-amber-400/50'
                            : 'bg-black/40 border-slate-700 text-slate-300'
                        }`}
                      >
                        <span className="font-black text-amber-400">#{idx + 1}</span>
                        <span className="font-bold text-white">{c.display_name}</span>
                        <span className="text-[10px] text-slate-400">+{c.reaction_delta_ms}ms</span>
                        {!isCurrentWinner && onSelectBuzzer && (
                          <button
                            type="button"
                            onClick={() => onSelectBuzzer(c.player_id)}
                            className="ml-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] shadow"
                            title="Promote this player to answer now"
                          >
                            Select
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Main Action Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {!isUnlocked && !winner && (
                <button
                  type="button"
                  onClick={onUnlockBuzzer}
                  className="flex-1 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm md:text-base shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition-transform active:scale-95"
                >
                  <Zap className="w-5 h-5 fill-current" />
                  Unlock Buzzers Now
                </button>
              )}

              {isUnlocked && !winner && (
                <div className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 font-mono text-xs flex items-center justify-center gap-2 animate-pulse">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                  Buzzers are OPEN! Waiting for players to buzz in...
                </div>
              )}

              {winner && onJudge && (
                <div className="flex-1 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onJudge(true)}
                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm md:text-base flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Correct (+${clue.base_points})
                  </button>
                  <button
                    type="button"
                    onClick={() => onJudge(false)}
                    className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm md:text-base flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                  >
                    <XCircle className="w-5 h-5" />
                    Wrong (-${clue.base_points})
                  </button>
                </div>
              )}

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs transition-colors"
                >
                  Close Clue
                </button>
              )}
            </div>

            {/* Direct Contestant Award Bar (For Verbal or Latency Scenarios) */}
            {players.length > 0 && onJudge && (
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Award directly:</span>
                {players.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg p-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block mr-1"
                      style={{ backgroundColor: p.color_hex }}
                    />
                    <span className="text-white font-bold max-w-[100px] truncate">{p.display_name}</span>
                    <button
                      type="button"
                      onClick={() => onJudge(true, p.id)}
                      className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px]"
                    >
                      +${clue.base_points}
                    </button>
                    <button
                      type="button"
                      onClick={() => onJudge(false, p.id)}
                      className="px-2 py-0.5 rounded bg-red-800 hover:bg-red-700 text-white font-bold text-[10px]"
                    >
                      -${clue.base_points}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

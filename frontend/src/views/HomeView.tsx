import React, { useState, useEffect } from 'react';
import { Zap, Tv, Play, PlusCircle, Gamepad2, Sparkles, Check, History, Layers } from 'lucide-react';

interface HomeViewProps {
  onNavigate: (view: string, params?: Record<string, string>) => void;
}

const PLAYER_COLORS = [
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EF4444', // Red
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default-ultimate-jeopardy');
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [showActiveSessions, setShowActiveSessions] = useState(true);

  useEffect(() => {
    // Restore last room code and player name from localStorage
    const savedCode = localStorage.getItem('uj_last_room_code');
    const savedName = localStorage.getItem('uj_last_player_name');
    if (savedCode) setRoomCode(savedCode);
    if (savedName) setPlayerName(savedName);

    // Fetch available board templates
    fetch('/api/templates')
      .then((res) => res.json())
      .then((data) => {
        if (data.templates && data.templates.length > 0) {
          setTemplates(data.templates);
          setSelectedTemplateId(data.templates[0].id);
        }
      })
      .catch(() => {});

    // Fetch active/saved sessions for quick resume
    fetch('/api/sessions/active')
      .then((res) => res.json())
      .then((data) => {
        if (data.sessions && data.sessions.length > 0) {
          setActiveSessions(data.sessions);
        }
      })
      .catch(() => {});
  }, []);

  const handleCreateGame = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: selectedTemplateId }),
      });
      const data = await res.json();
      if (data.session_id) {
        localStorage.setItem('uj_last_room_code', data.session_id);
        onNavigate('host', { code: data.session_id });
      }
    } catch (err: any) {
      setError('Failed to create game session: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim() || !playerName.trim()) {
      setError('Please enter both Room Code and Player Name.');
      return;
    }
    setError(null);

    const code = roomCode.trim().toUpperCase();
    localStorage.setItem('uj_last_room_code', code);
    localStorage.setItem('uj_last_player_name', playerName.trim());

    try {
      const res = await fetch(`/api/sessions/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: playerName.trim(),
          color_hex: selectedColor,
        }),
      });
      if (!res.ok) {
        throw new Error('Room not found or could not join');
      }
      const data = await res.json();
      if (!data || !data.player_id) {
        throw new Error('Server returned invalid contestant data. Please try again.');
      }
      onNavigate('player', {
        code,
        playerId: data.player_id,
        playerName: data.display_name || playerName.trim(),
        colorHex: data.color_hex || selectedColor,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to join game');
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-between p-4 md:p-8 select-none bg-cover bg-center bg-no-repeat fixed inset-0 overflow-y-auto"
      style={{ backgroundImage: `url('/assets/backgrounds/bg-board.png')` }}
    >
      {/* Golden Marquee Top Header */}
      <div className="text-center pt-4 md:pt-8 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/60 border border-amber-400/50 text-amber-300 font-mono text-xs uppercase tracking-widest mb-3 backdrop-blur-md shadow-lg">
          <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-spin" />
          <span>Real-Time Multiplayer Game Engine</span>
        </div>

        <div className="py-2">
          <h1 className="bubble-text pink-theme text-4xl sm:text-6xl md:text-7xl font-black tracking-wider uppercase drop-shadow-[0_8px_20px_rgba(0,0,0,0.85)]">
            ULTIMATE JEOPARDY
          </h1>
        </div>

        <p className="font-display text-xs md:text-sm font-bold text-amber-300 tracking-widest uppercase drop-shadow">
          Trivia Battle Royale • RPG Shop • Secret Alliances
        </p>
      </div>

      {/* Main Glass/Clay Login Card */}
      <div className="w-full max-w-md my-6 clay-card bg-[#180D30]/90 border-2 border-white/20 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl">
        {error && (
          <div className="mb-4 p-3 bg-red-950/90 border border-red-500 text-red-200 rounded-2xl text-xs font-mono text-center animate-shake">
            {error}
          </div>
        )}

        {/* Join as Player Form */}
        <form onSubmit={handleJoinGame} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider mb-1 font-display">
              Room Code:
            </label>
            <input
              type="text"
              placeholder="e.g. JEOP-1234"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full bg-[#100720]/90 border-2 border-purple-500/40 focus:border-pink-400 rounded-2xl px-4 py-3 text-white font-mono text-lg font-black placeholder:text-slate-600 outline-none uppercase tracking-widest transition-all shadow-inner"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider mb-1 font-display">
              Contestant Nickname:
            </label>
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-[#100720]/90 border-2 border-purple-500/40 focus:border-pink-400 rounded-2xl px-4 py-3 text-white text-base font-bold placeholder:text-slate-600 outline-none transition-all shadow-inner"
            />
          </div>

          {/* Color Selection Palette */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 font-display">
              Avatar Color:
            </label>
            <div className="flex items-center justify-between gap-2 p-2 bg-[#100720]/80 rounded-2xl border border-white/10">
              {PLAYER_COLORS.map((color) => {
                const isSelected = selectedColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 transform hover:scale-110 shadow-md relative"
                    style={{
                      backgroundColor: color,
                      boxShadow: isSelected ? `0 0 12px ${color}` : undefined,
                      transform: isSelected ? 'scale(1.15)' : undefined,
                    }}
                  >
                    {isSelected && <Check className="w-4 h-4 text-white stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:from-pink-400 hover:to-indigo-500 text-white font-black text-base shadow-lg shadow-pink-500/30 flex items-center justify-center gap-2 transition-transform active:scale-95 border-b-4 border-purple-900"
          >
            <Play className="w-5 h-5 fill-current" />
            <span className="font-display tracking-wider">JOIN GAME AS CONTESTANT</span>
          </button>
        </form>

        <div className="relative my-5 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <span className="relative px-3 bg-[#180D30] text-slate-400 font-mono text-xs uppercase">
            or manage a match
          </span>
        </div>

        {/* Board Template Selector */}
        {templates.length > 0 && (
          <div className="mb-3 text-left">
            <label className="block text-[11px] font-bold text-amber-300 uppercase tracking-wider mb-1 font-display flex items-center gap-1">
              <Layers className="w-3 h-3 text-amber-400" />
              <span>Select Board Template:</span>
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full bg-[#100720]/90 border border-amber-400/40 rounded-xl px-3 py-2 text-white font-mono text-xs font-bold outline-none cursor-pointer hover:border-amber-400 transition-colors"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900">
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Host Game Button */}
        <button
          type="button"
          onClick={handleCreateGame}
          disabled={isCreating}
          className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-display font-black text-sm flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-md border-b-4 border-amber-800 mb-3"
        >
          <Gamepad2 className="w-4 h-4" />
          <span>{isCreating ? 'Creating Room...' : 'HOST NEW SESSION'}</span>
        </button>

        {/* Active & Saved In-Progress Games */}
        {activeSessions.length > 0 && (
          <div className="mb-3 p-3 bg-black/40 border border-white/15 rounded-2xl text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-amber-300 font-bold uppercase tracking-wider flex items-center gap-1">
                <History className="w-3 h-3 text-amber-400" />
                <span>Active / Saved Games ({activeSessions.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setShowActiveSessions(!showActiveSessions)}
                className="text-[10px] font-mono text-slate-400 hover:text-white"
              >
                {showActiveSessions ? 'Hide' : 'Show'}
              </button>
            </div>
            {showActiveSessions && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {activeSessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div>
                      <div className="font-bold text-amber-300">{s.id}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                        {s.template_title || 'Board'} • R{s.current_round_idx || 1} • {s.player_count || 0} players
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem('uj_last_room_code', s.id);
                          onNavigate('host', { code: s.id });
                        }}
                        className="px-2 py-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-[10px] transition-colors shadow"
                      >
                        Host
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem('uj_last_room_code', s.id);
                          onNavigate('tv', { code: s.id });
                        }}
                        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-[10px] transition-colors"
                      >
                        TV
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Secondary Navigation Links */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              if (roomCode.trim()) {
                onNavigate('tv', { code: roomCode.trim().toUpperCase() });
              } else {
                setError('Please enter a Room Code first to open the TV View.');
              }
            }}
            className="py-2.5 px-3 rounded-xl bg-[#100720]/80 hover:bg-[#201040] text-slate-300 font-display text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-white/10"
          >
            <Tv className="w-3.5 h-3.5 text-sky-400" />
            <span>Big Screen TV</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('builder')}
            className="py-2.5 px-3 rounded-xl bg-[#100720]/80 hover:bg-[#201040] text-slate-300 font-display text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-white/10"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Game Builder</span>
          </button>
        </div>
      </div>

      <div className="pb-2 text-center text-[11px] font-mono text-slate-400">
        Ultimate Jeopardy Engine • Powered by High-Precision React & FastAPI
      </div>
    </div>
  );
};

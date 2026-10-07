import React, { useEffect, useState, useRef } from 'react';
import { StandardBoard } from '../components/boards/StandardBoard';
import { BonusBoardOverlay } from '../components/boards/BonusBoardOverlay';
import { BingoBoard } from '../components/boards/BingoBoard';
import { HotPotatoBoard } from '../components/boards/HotPotatoBoard';
import { ClueModal } from '../components/cards/ClueModal';
import { ContestantsTopRow } from '../components/scoreboard/ContestantsTopRow';
import { ArrowLeft, Play, FastForward, ShoppingBag, Sliders, Users, Zap, RotateCcw, Sparkles, CheckCircle2, Save } from 'lucide-react';

interface HostViewProps {
  roomCode: string;
  onLeave: () => void;
}

export const HostView: React.FC<HostViewProps> = ({ roomCode, onLeave }) => {
  const [gameState, setGameState] = useState<any>(null);
  const [activeItemBanners, setActiveItemBanners] = useState<string[]>([]);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedPlayerForOverride, setSelectedPlayerForOverride] = useState<string>('');
  const [scoreDelta, setScoreDelta] = useState<number>(0);
  const [tokenDelta, setTokenDelta] = useState<number>(0);
  const [isProgressSaved, setIsProgressSaved] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);

  const handleSaveProgress = async () => {
    try {
      await fetch(`/api/sessions/${roomCode}/save`, { method: 'POST' });
      setIsProgressSaved(true);
      setTimeout(() => setIsProgressSaved(false), 2500);
    } catch (e) {
      console.error('Failed to save progress:', e);
    }
  };

  const [mediaSyncState, setMediaSyncState] = useState<any>(null);

  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/${roomCode}?role=host`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state:update') {
          setGameState(msg.data);
        } else if (msg.type === 'host:item_cast_banner') {
          setActiveItemBanners((prev) => [...prev.slice(-3), msg.data.banner_text]);
        } else if (msg.type === 'media:sync') {
          setMediaSyncState(msg.data);
        }
      } catch (err) {
        console.error('Host WS Error:', err);
      }
    };

    return () => ws.close();
  }, [roomCode]);

  const send = (type: string, data: any = {}) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, data }));
    }
  };

  const handleMediaControl = (action: 'play' | 'pause' | 'seek', mediaSrc: string, currentTime?: number) => {
    send('host:media_control', {
      action,
      media_src: mediaSrc,
      current_time: currentTime,
      timestamp: Date.now(),
    });
  };

  const handleStartGame = () => {
    send('host:start_game');
  };

  const handleTileClick = (clueId: string) => {
    send('tile:pick', { clue_id: clueId });
  };

  const handleRevealSelected = () => {
    send('host:reveal_selected');
  };

  const handleSetPicker = (playerId: string | null) => {
    send('host:set_picker', { player_id: playerId });
  };

  const handleUnlockBuzzer = () => {
    send('host:arm_buzzers');
  };

  const handleJudge = (passed: boolean, playerId?: string) => {
    send('host:judge', { pass: passed, player_id: playerId });
  };

  const handleCloseClue = () => {
    send('host:close_clue');
  };

  const handleAdvanceRound = (roundIdx: number) => {
    send('host:advance_round', { round_idx: roundIdx });
  };

  const handleSetShop = () => {
    send('host:set_shop');
  };

  const handleCloseShop = () => {
    send('host:close_shop');
  };

  const handleSwitchBoard = (isBonus: boolean) => {
    send('host:switch_board', { is_bonus_board: isBonus });
  };

  const handleSelectBuzzer = (playerId: string) => {
    send('host:select_buzzer', { player_id: playerId });
  };

  const handleApplyOverride = () => {
    if (selectedPlayerForOverride) {
      send('host:override_score', {
        player_id: selectedPlayerForOverride,
        score_delta: scoreDelta,
        token_delta: tokenDelta,
      });
      setOverrideModalOpen(false);
      setScoreDelta(0);
      setTokenDelta(0);
    }
  };

  const currentRound = gameState?.current_round;
  const boardType = currentRound?.board_type || 'standard';
  const activeClue = gameState?.active_clue;
  const isBonusExplode = gameState?.state === 'BONUS_MINE_EXPLODE';
  const isBonusBoard = Boolean(gameState?.is_bonus_board) || gameState?.state === 'BONUS_BOARD';
  const isShop = gameState?.state === 'SHOP';
  const showClueModal = activeClue && gameState?.state !== 'BONUS_MINE_EXPLODE' && gameState?.state !== 'BOARD' && gameState?.state !== 'BONUS_BOARD' && !isShop;
  const isLobby = gameState?.state === 'LOBBY';

  // Picker information
  const activePickerId = gameState?.active_picker_id;
  const activePicker = gameState?.players?.find((p: any) => p.id === activePickerId);
  const activePickerName = activePicker ? activePicker.display_name : 'Host';
  const activePickerColor = activePicker ? activePicker.color_hex : '#EC4899';

  const selectedTileId = gameState?.selected_tile_id;

  return (
    <div
      className="min-h-screen text-slate-100 flex flex-col bg-cover bg-center bg-no-repeat fixed inset-0 overflow-y-auto"
      style={{ backgroundImage: `url('/assets/backgrounds/bg-board.png')` }}
    >
      {/* Host Control Header */}
      <header className="px-6 py-3 bg-[#130924]/90 border-b border-white/20 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onLeave}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="bubble-text pink-theme text-xl md:text-2xl font-black uppercase tracking-wider">
                ULTIMATE JEOPARDY
              </h1>
              <span className="px-2.5 py-0.5 bg-amber-950/80 border border-amber-500 rounded-full font-mono text-xs font-black text-amber-300">
                {roomCode}
              </span>
            </div>
            <span className="text-[11px] font-mono text-amber-300">
              State: <strong className="text-white">{gameState?.state}</strong> | Round: {currentRound?.round_name || 'Round 1'} ({boardType})
            </span>
          </div>
        </div>

        {/* Global Host Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Round Selector Dropdown */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#251342] rounded-xl border border-white/20 text-xs font-mono">
            <FastForward className="w-3.5 h-3.5 text-sky-400" />
            <select
              value={gameState?.current_round_idx || 1}
              onChange={(e) => handleAdvanceRound(Number(e.target.value))}
              className="bg-transparent text-white outline-none cursor-pointer font-bold"
            >
              <option value={1} className="bg-slate-900">R1: Minefield</option>
              <option value={2} className="bg-slate-900">R2: Double Jeopardy</option>
              <option value={3} className="bg-slate-900">R3: 5x5 Bingo</option>
              <option value={4} className="bg-slate-900">R4: Hot Potato</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleSaveProgress}
            className="px-3 py-1.5 rounded-xl bg-emerald-700/40 hover:bg-emerald-600/50 border border-emerald-400 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow"
            title="Save current game progress"
          >
            {isProgressSaved ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-emerald-300" />
                <span>Save Progress</span>
              </>
            )}
          </button>

          {isShop ? (
            <button
              type="button"
              onClick={handleCloseShop}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-300 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow animate-pulse"
              title="Close shop and return everyone to the board"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resume Board</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSetShop}
              className="px-3 py-1.5 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-400 text-amber-300 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Open Shop</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSwitchBoard(!isBonusBoard)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow ${
              isBonusBoard
                ? 'bg-amber-500 hover:bg-amber-400 border-amber-300 text-black'
                : 'bg-indigo-900/40 hover:bg-indigo-800/50 border-indigo-400 text-indigo-300'
            }`}
            title="Toggle between Main Board and the Bonus Vault"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{isBonusBoard ? 'Return to Main Board' : 'Bonus Vault'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsActivityLogOpen(!isActivityLogOpen)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-1.5 transition-colors shadow ${
              isActivityLogOpen
                ? 'bg-sky-500 text-black border-sky-300 font-bold'
                : 'bg-slate-800/60 hover:bg-slate-700/60 border-slate-600 text-sky-300'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Activity Log ({gameState?.activity_log?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setOverrideModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-purple-900/50 hover:bg-purple-800/60 border border-purple-400 text-purple-200 text-xs font-mono flex items-center gap-1.5 transition-colors shadow"
          >
            <Sliders className="w-3.5 h-3.5 text-purple-300" />
            <span>Adjust Scores</span>
          </button>
        </div>
      </header>

      {/* Contestants Money & Tokens Row at Top */}
      <ContestantsTopRow
        players={gameState?.players || []}
        activePickerId={activePickerId}
        buzzWinnerId={gameState?.buzzer?.winner?.player_id}
        hotPotatoHolderId={gameState?.hot_potato?.holder_id}
        onSelectPicker={handleSetPicker}
      />

      {/* LOBBY VIEW: Team Shuffling & Match Launch */}
      {isLobby ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-3xl mx-auto w-full">
          <div className="w-full clay-card bg-[#1A0E34]/95 border-2 border-white/20 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-400 text-amber-300 font-mono text-xs font-bold uppercase mb-4">
              <Users className="w-4 h-4 text-amber-400" />
              <span>Contestant Lobby • Room: {roomCode}</span>
            </div>

            <h2 className="bubble-text gold-theme text-3xl md:text-5xl font-black mb-2">
              WAITING FOR PLAYERS
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mb-6">
              Contestants join at <strong className="text-amber-300 font-mono">{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'}</strong> with code <strong className="text-white font-mono bg-black/40 px-2 py-0.5 rounded">{roomCode}</strong>.
            </p>

            {/* Joined Contestant Roster */}
            <div className="mb-8">
              <h3 className="text-xs font-mono uppercase text-slate-400 mb-3 tracking-widest">
                Connected Contestants ({gameState?.players?.length || 0})
              </h3>
              {(!gameState?.players || gameState.players.length === 0) ? (
                <div className="p-6 rounded-2xl bg-black/40 border border-white/10 text-slate-400 text-xs font-mono">
                  No contestants have joined yet. Waiting for players...
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {gameState.players.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-2xl bg-white/5 border border-white/15 flex flex-col items-center text-center shadow"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm mb-2 shadow"
                        style={{ backgroundColor: p.color_hex }}
                      >
                        {p.display_name.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-bold text-sm text-white truncate max-w-full">
                        {p.display_name}
                      </span>
                      <span className="text-[10px] font-mono text-amber-400 mt-1">
                        Team #{p.secret_team_id} (Secret)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Start Match Button */}
            <button
              type="button"
              onClick={handleStartGame}
              disabled={!gameState?.players || gameState.players.length === 0}
              className={`w-full py-4 px-6 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-2xl transition-all border-b-4 ${
                !gameState?.players || gameState.players.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-slate-900'
                  : 'bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:from-pink-400 hover:to-indigo-500 text-white border-purple-900 hover:scale-[1.01] active:scale-95'
              }`}
            >
              <Sparkles className="w-6 h-6 fill-amber-300 text-amber-300 animate-spin" />
              <span className="font-display tracking-wider">START GAME & SHUFFLE TEAMS</span>
            </button>
          </div>
        </div>
      ) : isShop ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto w-full">
          <div className="w-full clay-card bg-[#1A0E34]/95 border-2 border-amber-500/80 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
            <ShoppingBag className="w-16 h-16 text-amber-400 mx-auto mb-4 animate-bounce" />
            <h2 className="bubble-text gold-theme text-3xl font-black mb-2">SHOP INTERMISSION</h2>
            <p className="text-sm font-mono text-slate-300 mb-6">
              Contestants are spending Bounty Tokens to acquire items and buffs.
            </p>
            <button
              type="button"
              onClick={handleCloseShop}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-black font-black text-base font-mono shadow-2xl active:scale-95"
            >
              CLOSE SHOP & RESUME BOARD
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* TURN & SELECTION ACTION BAR */}
          {(gameState?.state === 'BOARD' || gameState?.state === 'BONUS_BOARD') && (
            <div className="px-6 py-2.5 bg-[#170C2D]/95 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shadow-md">
              {/* Left: Picker Status */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-300">Board Control:</span>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 border border-white/20">
                    <span
                      className="w-3 h-3 rounded-full inline-block shadow"
                      style={{ backgroundColor: activePickerColor }}
                    />
                    <span className="font-bold text-xs text-white">
                      {activePickerName}
                    </span>
                  </div>
                </div>

                {/* Quick Picker Delegation Pills */}
                <div className="hidden lg:flex items-center gap-1 text-[11px] font-mono text-slate-400">
                  <span>Pass control:</span>
                  {(gameState?.players || []).map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSetPicker(p.id)}
                      className={`px-2 py-0.5 rounded-lg border text-[10px] transition-colors ${
                        p.id === activePickerId
                          ? 'bg-white/20 border-white text-white font-bold'
                          : 'bg-black/30 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {p.display_name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Reveal Action if Tile Selected */}
              {selectedTileId ? (
                <div className="flex items-center gap-2 animate-bounce">
                  <span className="text-xs font-mono text-amber-300 font-bold">
                    🎯 Tile Chosen by {activePickerName}!
                  </span>
                  <button
                    type="button"
                    onClick={handleRevealSelected}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-black font-black text-xs font-mono flex items-center gap-1.5 shadow-lg border-b-2 border-emerald-900 active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-black" />
                    <span>REVEAL CLUE TO ROOM</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPicker(activePickerId)}
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <div className="text-xs font-mono text-slate-400">
                  Click any tile or wait for {activePickerName} to tap a tile.
                </div>
              )}
            </div>
          )}

          {/* Dedicated Bonus Board Vault Banner */}
          {isBonusBoard && (
            <div className="mx-6 mt-3 p-3 bg-gradient-to-r from-amber-950/90 via-purple-950/90 to-amber-950/90 border-2 border-amber-500/80 rounded-2xl text-center shadow-xl backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 fill-amber-300 text-amber-300 animate-spin" />
                <span className="font-display font-black text-amber-300 text-sm md:text-base tracking-wider uppercase">
                  THE BONUS VAULT • CONTESTANT QUESTIONS • NO PENALTIES ($0 WRONG) • 400-600 PTS
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleSwitchBoard(false)}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold shadow transition-transform active:scale-95"
              >
                Exit to Main Board
              </button>
            </div>
          )}

          {/* Main Board View */}
          <main className="flex-1 p-4 md:p-6 overflow-y-auto">
            {boardType === 'bingo_5x5' ? (
              <BingoBoard
                categories={gameState?.categories || []}
                selectedTileId={selectedTileId}
                pickerColor={activePickerColor}
                pickerName={activePickerName}
                onTileClick={handleTileClick}
              />
            ) : boardType === 'hot_potato' ? (
              <HotPotatoBoard
                timerRemainingMs={gameState?.hot_potato?.timer_remaining_ms || 90000}
                holderId={gameState?.hot_potato?.holder_id}
                players={gameState?.players || []}
                activeClue={activeClue}
                isHost={true}
              />
            ) : (
              <StandardBoard
                categories={gameState?.categories || []}
                selectedTileId={selectedTileId}
                pickerColor={activePickerColor}
                pickerName={activePickerName}
                onTileClick={handleTileClick}
              />
            )}
          </main>
        </>
      )}

      {/* Dedicated Bonus Board Overlay */}
      {isBonusExplode && activeClue && (
        <BonusBoardOverlay
          clue={activeClue}
          isHost={true}
          buzzerState={gameState?.buzzer}
          onUnlockBuzzer={handleUnlockBuzzer}
          onJudge={handleJudge}
          onClose={handleCloseClue}
        />
      )}

      {/* Standard Clue Presentation Modal */}
      {showClueModal && (
        <ClueModal
          clue={activeClue}
          categoryName={activeClue.category_name || 'Jeopardy'}
          isHost={true}
          players={gameState?.players || []}
          buzzerState={gameState?.buzzer}
          onUnlockBuzzer={handleUnlockBuzzer}
          onJudge={handleJudge}
          onSelectBuzzer={handleSelectBuzzer}
          onClose={handleCloseClue}
          activeItemBanners={activeItemBanners}
          onMediaControl={handleMediaControl}
          mediaSyncState={mediaSyncState}
        />
      )}

      {/* Manual Score & Token Override Dialog */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md clay-card bg-[#1E1038] border-2 border-white/20 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Manual Score / Token Override</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Target Contestant:</label>
                <select
                  value={selectedPlayerForOverride}
                  onChange={(e) => setSelectedPlayerForOverride(e.target.value)}
                  className="w-full bg-[#110724] border border-white/20 rounded-xl p-2.5 text-white font-mono text-sm"
                >
                  <option value="">Select Contestant...</option>
                  {(gameState?.players || []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name} (${p.score}, {p.token_balance} Tokens)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Score Delta ($):</label>
                <input
                  type="number"
                  step="100"
                  value={scoreDelta}
                  onChange={(e) => setScoreDelta(Number(e.target.value))}
                  className="w-full bg-[#110724] border border-white/20 rounded-xl p-2.5 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Token Delta:</label>
                <input
                  type="number"
                  step="1"
                  value={tokenDelta}
                  onChange={(e) => setTokenDelta(Number(e.target.value))}
                  className="w-full bg-[#110724] border border-white/20 rounded-xl p-2.5 text-white font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOverrideModalOpen(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-slate-300 rounded-xl text-xs font-mono"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyOverride}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-xl text-xs font-mono shadow"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity & Item Log Drawer */}
      {isActivityLogOpen && (
        <div className="fixed inset-x-0 bottom-0 z-50 max-h-[50vh] bg-[#120824]/98 border-t-2 border-sky-500 shadow-2xl flex flex-col backdrop-blur-xl animate-fade-in">
          <div className="px-6 py-3 bg-[#1A0E34] border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                Live Activity & Item Feed ({gameState?.activity_log?.length || 0} events)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsActivityLogOpen(false)}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono text-slate-300 transition-colors"
            >
              Close Feed
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-2 font-mono text-xs">
            {(!gameState?.activity_log || gameState.activity_log.length === 0) ? (
              <div className="text-slate-500 text-center py-6 italic">No activity logged yet for this match.</div>
            ) : (
              gameState.activity_log.map((log: any, idx: number) => {
                const tagColor =
                  log.event_type === 'ITEM_CAST'
                    ? 'bg-purple-900 text-purple-200 border-purple-600'
                    : log.event_type === 'ITEM_BUY'
                    ? 'bg-amber-900 text-amber-200 border-amber-600'
                    : log.event_type === 'CRIT'
                    ? 'bg-rose-900 text-rose-200 border-rose-500'
                    : log.event_type === 'SHIELD'
                    ? 'bg-blue-900 text-blue-200 border-blue-500'
                    : log.event_type === 'BUZZ'
                    ? 'bg-emerald-900 text-emerald-200 border-emerald-500'
                    : log.event_type === 'BONUS_BOARD'
                    ? 'bg-yellow-900 text-yellow-200 border-yellow-500'
                    : 'bg-slate-800 text-slate-300 border-slate-600';

                return (
                  <div key={idx} className="flex items-center gap-2.5 p-2 rounded-xl bg-black/40 border border-white/5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${tagColor}`}>
                      {log.event_type}
                    </span>
                    <span className="text-white flex-1">{log.message}</span>
                    <span className="text-[10px] text-slate-500">
                      {log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

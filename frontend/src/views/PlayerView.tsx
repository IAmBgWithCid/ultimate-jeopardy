import React, { useEffect, useState, useRef, useCallback } from 'react';
import { BuzzerButton } from '../components/buzzer/BuzzerButton';
import { StandardBoard } from '../components/boards/StandardBoard';
import { BingoBoard } from '../components/boards/BingoBoard';
import { MarkdownViewer } from '../components/markdown/MarkdownViewer';
import { ContestantsTopRow } from '../components/scoreboard/ContestantsTopRow';
import { Zap, ArrowLeft, FolderLock, Sparkles, Clock, Lock } from 'lucide-react';

interface PlayerViewProps {
  roomCode: string;
  playerId: string;
  playerName: string;
  colorHex?: string;
  onLeave: () => void;
}

export const PlayerView: React.FC<PlayerViewProps> = ({
  roomCode,
  playerId,
  playerName,
  colorHex = '#3B82F6',
  onLeave,
}) => {
  const [gameState, setGameState] = useState<any>(null);
  const [secretPartner, setSecretPartner] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState(18);
  const [mediaSyncState, setMediaSyncState] = useState<any>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const pingStartRef = useRef<number>(0);

  // WebSocket Connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/${roomCode}?role=player&player_id=${playerId}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      // Start ping loop
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          pingStartRef.current = Date.now();
          ws.send(JSON.stringify({ type: 'ping', data: { timestamp: pingStartRef.current } }));
        }
      }, 3000);
      (ws as any)._pingInterval = pingInterval;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type;
        const data = msg.data;

        if (type === 'pong') {
          const rtt = Date.now() - pingStartRef.current;
          setPingMs(Math.round(rtt / 2));
        } else if (type === 'state:update') {
          setGameState(data);
        } else if (type === 'media:sync') {
          setMediaSyncState(data);
        } else if (type === 'teams:reveal') {
          const myTeam = Object.values(data.teams || {}).find((members: any) =>
            members.some((m: any) => m.id === playerId)
          ) as any[];
          if (myTeam) {
            const partner = myTeam.find((m: any) => m.id !== playerId);
            if (partner) {
              setSecretPartner(partner.display_name);
            }
          }
        }
      } catch (err) {
        console.error('WS Error:', err);
      }
    };

    ws.onclose = () => {
      clearInterval((ws as any)._pingInterval);
    };

    return () => {
      clearInterval((ws as any)._pingInterval);
      ws.close();
    };
  }, [roomCode, playerId]);

  // Buzzer Trigger Handler
  const handleBuzz = useCallback((reactionDeltaMs: number) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'buzzer:buzz',
          data: { reactionDeltaMs }
        })
      );
    }
  }, []);

  const currentPlayer = gameState?.players?.find((p: any) => p.id === playerId);
  const myScore = currentPlayer?.score ?? 0;

  const isBuzzerUnlocked = Boolean(gameState?.buzzer?.is_unlocked);
  const activeClue = gameState?.active_clue;

  // Buzzer states & queue tracking
  const isBuzzWinner = gameState?.buzzer?.winner?.player_id === playerId;
  const isCandidate = Boolean(gameState?.buzzer?.candidates?.some((c: any) => c.player_id === playerId));
  const hasAlreadyBuzzed = isBuzzWinner || isCandidate;
  const isLockedOut = Boolean(gameState?.buzzer?.locked_out_player_ids?.includes(playerId));

  const queueIndex = gameState?.buzzer?.queue?.findIndex((c: any) => c.player_id === playerId);
  const queuePosition = queueIndex !== undefined && queueIndex >= 0 ? queueIndex + 1 : null;

  const isAuthorLocked = Boolean(
    activeClue?.is_bonus_mine &&
    activeClue?.author_name &&
    activeClue?.author_name.trim().toLowerCase() === playerName.trim().toLowerCase()
  );

  // Global Spacebar Key Listener
  useEffect(() => {
    const handleGlobalSpaceKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        if (isBuzzerUnlocked && !hasAlreadyBuzzed && !isLockedOut) {
          e.preventDefault();
          handleBuzz(120);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalSpaceKey);
    return () => window.removeEventListener('keydown', handleGlobalSpaceKey);
  }, [isBuzzerUnlocked, hasAlreadyBuzzed, isLockedOut, handleBuzz]);

  // Player picks a tile on board
  const handlePlayerTileClick = (clueId: string) => {
    if ((gameState?.state === 'BOARD' || gameState?.state === 'BONUS_BOARD') && gameState?.active_picker_id === playerId) {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'tile:pick',
            data: { clue_id: clueId }
          })
        );
      }
    }
  };

  const isBonusBoard = Boolean(gameState?.is_bonus_board) || gameState?.state === 'BONUS_BOARD';
  const isBoardPhase = gameState?.state === 'BOARD' || gameState?.state === 'BONUS_BOARD';
  const isLobby = gameState?.state === 'LOBBY';

  const isMyTurnToPick = gameState?.active_picker_id === playerId;
  const activePicker = gameState?.players?.find((p: any) => p.id === gameState?.active_picker_id);
  const activePickerName = activePicker ? activePicker.display_name : 'Host';
  const activePickerColor = activePicker ? activePicker.color_hex : '#EC4899';
  const selectedTileId = gameState?.selected_tile_id;
  const boardType = gameState?.current_round?.board_type || 'standard';

  return (
    <div
      className="min-h-screen flex flex-col justify-between text-slate-100 select-none pb-6 bg-cover bg-center bg-no-repeat fixed inset-0 overflow-y-auto"
      style={{ backgroundImage: `url('/assets/backgrounds/bg-board.png')` }}
    >
      {/* Top Bar: Room, Name, Score Pill */}
      <header className="px-4 py-3 bg-[#130924]/90 border-b border-white/20 backdrop-blur-md flex items-center justify-between sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLeave}
            className="p-1 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full shadow" style={{ backgroundColor: colorHex }} />
              <span className="font-bold text-sm text-white">{playerName}</span>
            </div>
            <span className="text-[10px] font-mono text-amber-300 font-bold">{roomCode}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1 bg-[#1A0E34] border border-white/20 rounded-full font-mono text-xs font-black text-emerald-400 shadow">
            ${myScore.toLocaleString()}
          </div>
        </div>
      </header>

      {/* Contestants Row at Top */}
      <ContestantsTopRow
        players={gameState?.players || []}
        currentPlayerId={playerId}
        activePickerId={gameState?.active_picker_id}
        buzzWinnerId={gameState?.buzzer?.winner?.player_id}
        buzzQueue={gameState?.buzzer?.queue || []}
      />

      {/* Secret Partner Intel Card (If Discovered) */}
      {secretPartner && (
        <div className="mx-4 mt-2 p-2.5 rounded-2xl bg-amber-950/60 border border-amber-500/80 flex items-center justify-between text-xs backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-2 text-amber-300">
            <FolderLock className="w-4 h-4 text-amber-400" />
            <span>Secret Partner: <strong className="text-white">{secretPartner}</strong></span>
          </div>
          <span className="text-[10px] font-mono text-amber-400 uppercase font-black">Alliance Active</span>
        </div>
      )}

      {/* LOBBY PHASE */}
      {isLobby && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full">
          <div className="clay-card w-full bg-[#1A0E34]/95 border-2 border-white/20 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
            <div
              className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-black text-white shadow-xl"
              style={{ backgroundColor: colorHex }}
            >
              {playerName.slice(0, 1).toUpperCase()}
            </div>
            <h2 className="bubble-text pink-theme text-3xl font-black mb-1">
              {playerName}
            </h2>
            <p className="text-xs font-mono text-amber-300 mb-4">
              Joined Room: {roomCode}
            </p>
            <div className="p-4 rounded-2xl bg-black/40 border border-white/10 text-xs font-mono text-slate-300 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block mr-2" />
              Connected! Waiting for host to launch the game...
            </div>
          </div>
        </div>
      )}

      {/* BOARD PHASE: Turn-Based Selection */}
      {isBoardPhase && (
        <div className="flex-1 flex flex-col p-3 md:p-6 overflow-y-auto">
          {/* Bonus Vault Banner */}
          {isBonusBoard && (
            <div className="mb-3 p-3 bg-gradient-to-r from-amber-950/90 via-purple-950/90 to-amber-950/90 border-2 border-amber-500/80 rounded-2xl text-center shadow-xl">
              <span className="font-display font-black text-amber-300 text-xs sm:text-sm uppercase tracking-wider block">
                ⭐ THE BONUS VAULT • CONTESTANT QUESTIONS • NO PENALTIES ($0 WRONG) • 400-600 PTS
              </span>
              <span className="text-[10px] font-mono text-slate-300 mt-0.5 block">
                Author gets 1.5s delay. Unclaimed tiles persist across rounds!
              </span>
            </div>
          )}

          {/* Turn Banner */}
          <div className="mb-4 text-center">
            {isMyTurnToPick ? (
              <div className="p-3 rounded-2xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-white shadow-2xl border-2 border-amber-300 animate-pulse">
                <h3 className="font-display font-black text-sm md:text-base uppercase tracking-wider">
                  🎯 IT'S YOUR TURN TO CHOOSE!
                </h3>
                <p className="text-xs font-mono text-amber-200 mt-0.5">
                  {selectedTileId
                    ? 'Tile picked! Waiting for Host to reveal it to everyone...'
                    : 'Tap any available tile below to lock in the next clue.'}
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-black/60 border border-white/20 text-slate-300 shadow-md backdrop-blur-md">
                <span className="text-xs font-mono">
                  ⏳ <strong>{activePickerName}</strong> has board control and is picking the next tile...
                </span>
              </div>
            )}
          </div>

          {/* Render Board */}
          <div className="flex-1">
            {boardType === 'bingo_5x5' ? (
              <BingoBoard
                categories={gameState?.categories || []}
                selectedTileId={selectedTileId}
                pickerColor={activePickerColor}
                pickerName={activePickerName}
                onTileClick={isMyTurnToPick ? handlePlayerTileClick : undefined}
                disabled={!isMyTurnToPick}
              />
            ) : (
              <StandardBoard
                categories={gameState?.categories || []}
                selectedTileId={selectedTileId}
                pickerColor={activePickerColor}
                pickerName={activePickerName}
                onTileClick={isMyTurnToPick ? handlePlayerTileClick : undefined}
                disabled={!isMyTurnToPick}
              />
            )}
          </div>
        </div>
      )}

      {/* CLUE / BUZZER WORKSPACE */}
      {!isBoardPhase && !isLobby && (
        <main className="flex-1 flex flex-col items-center justify-start p-3 md:p-6 max-w-4xl mx-auto w-full overflow-y-auto">
          {/* Clue Card */}
          {activeClue && (
            <div className="w-full clay-card bg-[#1A0E34]/95 border-2 border-white/20 rounded-3xl p-5 md:p-6 shadow-2xl backdrop-blur-xl mb-4 text-left">
              {/* Card Header: Category & Points */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full bg-blue-950/80 border border-blue-400 text-sky-300 font-mono text-xs font-black uppercase tracking-wider">
                    {activeClue.category_name || 'Trivia Clue'}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-amber-950/80 border border-amber-400 text-amber-300 font-mono text-xs font-black">
                    ${activeClue.base_points}
                  </span>
                  {activeClue.author_name && (
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700 text-[11px] font-mono">
                      Submitted by {activeClue.author_name}
                    </span>
                  )}
                </div>

                {/* Status Indicator */}
                <div>
                  {isBuzzWinner ? (
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 font-mono text-xs font-bold animate-pulse">
                      ⚡ YOU ARE ANSWERING!
                    </span>
                  ) : gameState?.buzzer?.winner ? (
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 font-mono text-xs font-bold">
                      ⚡ {gameState.buzzer.winner.display_name} Buzzed In!
                    </span>
                  ) : isBuzzerUnlocked ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-400 font-mono text-xs font-bold animate-pulse">
                      🟢 Buzzers Open!
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono text-xs">
                      🔒 Buzzers Locked
                    </span>
                  )}
                </div>
              </div>

              {/* Requirement 6: When contestant buzzes in, their question disappears! */}
              {isBuzzWinner ? (
                <div className="py-12 px-6 flex flex-col items-center justify-center text-center bg-gradient-to-br from-amber-500/20 via-purple-950/40 to-pink-500/20 rounded-2xl border-2 border-amber-400/80 shadow-2xl animate-pulse">
                  <Zap className="w-16 h-16 text-amber-400 mb-3 animate-bounce" />
                  <h2 className="text-2xl sm:text-3xl font-black font-display text-amber-300 uppercase tracking-wider mb-2">
                    ⚡ YOU BUZZED IN!
                  </h2>
                  <p className="text-base sm:text-lg font-mono text-white font-bold mb-1">
                    SPEAK YOUR ANSWER TO THE HOST!
                  </p>
                  <p className="text-xs font-mono text-slate-300">
                    (Question text is hidden while answering)
                  </p>
                </div>
              ) : hasAlreadyBuzzed && !isBuzzWinner ? (
                <div className="py-10 px-6 flex flex-col items-center justify-center text-center bg-sky-950/40 rounded-2xl border border-sky-400/50 shadow-xl">
                  <Clock className="w-12 h-12 text-sky-400 mb-3 animate-spin" />
                  <h2 className="text-xl sm:text-2xl font-black font-display text-sky-300 uppercase tracking-wider mb-1">
                    YOU ARE IN THE QUEUE (#{queuePosition || 2})
                  </h2>
                  <p className="text-xs font-mono text-slate-300">
                    Your buzz is locked in! If the current answerer is wrong, you're up next!
                  </p>
                </div>
              ) : isLockedOut ? (
                <div className="py-10 px-6 flex flex-col items-center justify-center text-center bg-red-950/40 rounded-2xl border border-red-500/50 shadow-xl">
                  <Lock className="w-12 h-12 text-red-400 mb-3" />
                  <h2 className="text-xl sm:text-2xl font-black font-display text-red-300 uppercase tracking-wider mb-1">
                    LOCKED OUT FOR THIS CLUE
                  </h2>
                  <p className="text-xs font-mono text-slate-300">
                    You gave an incorrect answer for this clue. Waiting for the next clue!
                  </p>
                </div>
              ) : (
                /* Unbuzzed Contestant: Full Clue Question with Media Viewer */
                <div className="text-base sm:text-lg md:text-xl text-slate-100 leading-relaxed max-h-[42vh] overflow-y-auto pr-1">
                  <MarkdownViewer
                    content={activeClue.clue_markdown || 'Loading question...'}
                    isHost={false}
                    mediaSyncState={mediaSyncState}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tactile Buzzer Button */}
          <div className="w-full flex flex-col items-center justify-center my-2">
            <BuzzerButton
              isUnlocked={isBuzzerUnlocked}
              unlockTimestampMs={Date.now()}
              isAuthorLocked={isAuthorLocked}
              authorDelaySeconds={1.5}
              onBuzz={handleBuzz}
              disabled={!isBuzzerUnlocked || hasAlreadyBuzzed || isLockedOut}
            />

            <div className="mt-3 text-center">
              {isBuzzWinner ? (
                <span className="text-xs font-mono text-amber-300 font-bold bg-amber-950/80 px-3 py-1 rounded-full border border-amber-500">
                  ⚡ You won the buzzer race! Speak your answer.
                </span>
              ) : hasAlreadyBuzzed ? (
                <span className="text-xs font-mono text-sky-300 font-bold bg-sky-950/80 px-3 py-1 rounded-full border border-sky-500">
                  ⏳ Queued at position #{queuePosition || 2}. Waiting for host ruling...
                </span>
              ) : isLockedOut ? (
                <span className="text-xs font-mono text-red-400 font-bold bg-red-950/80 px-3 py-1 rounded-full border border-red-500">
                  🔒 Locked out for this clue.
                </span>
              ) : isBuzzerUnlocked ? (
                <span className="text-[11px] font-mono text-emerald-300 bg-black/40 px-3 py-1 rounded-full border border-emerald-500/30">
                  Press <strong className="text-amber-300">[ SPACEBAR ]</strong> or tap the button to buzz in!
                </span>
              ) : (
                <span className="text-[11px] font-mono text-slate-400 bg-black/40 px-3 py-1 rounded-full border border-white/10">
                  Buzzers locked
                </span>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
};

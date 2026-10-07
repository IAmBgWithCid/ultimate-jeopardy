import React, { useEffect, useState } from 'react';
import { StandardBoard } from '../components/boards/StandardBoard';
import { BonusBoardOverlay } from '../components/boards/BonusBoardOverlay';
import { BingoBoard } from '../components/boards/BingoBoard';
import { ClueModal } from '../components/cards/ClueModal';
import { ContestantsTopRow } from '../components/scoreboard/ContestantsTopRow';
import { ASSET_MANIFEST } from '../constants/assetManifest';
import { ArrowLeft } from 'lucide-react';

interface TvViewProps {
  roomCode: string;
  onLeave: () => void;
}

export const TvView: React.FC<TvViewProps> = ({ roomCode, onLeave }) => {
  const [gameState, setGameState] = useState<any>(null);
  const [bingoBanner, setBingoBanner] = useState<any>(null);
  const [mediaSyncState, setMediaSyncState] = useState<any>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/${roomCode}?role=tv`;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state:update') {
          setGameState(msg.data);
        } else if (msg.type === 'bingo:bonus') {
          setBingoBanner(msg.data);
          setTimeout(() => setBingoBanner(null), 6000);
        } else if (msg.type === 'media:sync') {
          setMediaSyncState(msg.data);
        }
      } catch (err) {
        console.error('TV WS Error:', err);
      }
    };

    return () => ws.close();
  }, [roomCode]);

  const currentRound = gameState?.current_round;
  const boardType = currentRound?.board_type || 'standard';
  const activeClue = gameState?.active_clue;
  const isBonusExplode = gameState?.state === 'BONUS_MINE_EXPLODE';
  const isBonusBoard = Boolean(gameState?.is_bonus_board) || gameState?.state === 'BONUS_BOARD';
  const showClueModal = activeClue && gameState?.state !== 'BONUS_MINE_EXPLODE' && gameState?.state !== 'BOARD' && gameState?.state !== 'BONUS_BOARD';

  const getBgStyle = (rawVal: string) => {
    if (!rawVal) return {};
    if (rawVal.startsWith('radial-') || rawVal.startsWith('linear-')) {
      return { background: rawVal };
    }
    return {
      backgroundImage: `url("${rawVal}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    };
  };

  const currentBg = boardType === 'bingo_5x5'
    ? ASSET_MANIFEST.bg_bingo_board.urlOrSvg
    : ASSET_MANIFEST.bg_main_board.urlOrSvg;

  const activePickerId = gameState?.active_picker_id;
  const activePicker = gameState?.players?.find((p: any) => p.id === activePickerId);
  const activePickerName = activePicker ? activePicker.display_name : 'Host';
  const activePickerColor = activePicker ? activePicker.color_hex : '#EC4899';
  const selectedTileId = gameState?.selected_tile_id;

  return (
    <div
      className="min-h-screen text-slate-100 flex flex-col justify-between overflow-x-hidden select-none bg-cover bg-center bg-no-repeat fixed inset-0 overflow-y-auto"
      style={{ backgroundImage: `url('/assets/backgrounds/bg-board.png')` }}
    >
      {/* Top TV Header: Room, Round Name */}
      <header className="px-6 py-3 bg-[#130924]/90 border-b border-white/20 backdrop-blur-md flex items-center justify-between sticky top-0 z-40 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onLeave}
            className="p-1.5 rounded-xl bg-white/10 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="font-display-title text-xl md:text-2xl font-black text-amber-300 tracking-wider uppercase">
              {isBonusBoard ? 'The Bonus Vault' : currentRound?.round_name || 'Ultimate Jeopardy'}
            </span>
            <div className="font-mono text-xs text-amber-400 uppercase tracking-widest">
              Room: <strong>{roomCode}</strong> • {isBonusBoard ? 'Contestant Vault' : boardType}
            </div>
          </div>
        </div>
      </header>

      {/* Contestants Row at Top */}
      <ContestantsTopRow
        players={gameState?.players || []}
        activePickerId={activePickerId}
        buzzWinnerId={gameState?.buzzer?.winner?.player_id}
        buzzQueue={gameState?.buzzer?.queue || []}
      />

      {/* 3D Bubble Marquee Center Title */}
      <div className="text-center pt-3 pb-1">
        <h1 className="bubble-text pink-theme text-3xl sm:text-5xl md:text-6xl font-black tracking-wider uppercase drop-shadow-[0_8px_25px_rgba(0,0,0,0.85)]">
          {isBonusBoard ? 'BONUS VAULT' : 'ULTIMATE JEOPARDY'}
        </h1>

        {/* Bonus Vault Spectator Banner */}
        {isBonusBoard && (
          <div className="mt-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 font-mono text-xs md:text-sm font-bold shadow-lg">
            <span>⭐ CONTESTANT QUESTIONS • NO PENALTIES • 400-600 PTS • 1.5s AUTHOR DELAY</span>
          </div>
        )}

        {/* Turn / Selection Lower-Third Indicator */}
        {(gameState?.state === 'BOARD' || gameState?.state === 'BONUS_BOARD') && (
          <div className="mt-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/60 border border-white/20 backdrop-blur-md shadow-lg">
            {selectedTileId ? (
              <span className="text-xs md:text-sm font-mono text-amber-300 font-bold animate-pulse">
                🎯 {activePickerName} selected a tile! Host revealing shortly...
              </span>
            ) : (
              <div className="flex items-center gap-2 text-xs md:text-sm font-mono text-slate-200">
                <span>Next Clue Pick:</span>
                <span
                  className="w-3 h-3 rounded-full inline-block shadow"
                  style={{ backgroundColor: activePickerColor }}
                />
                <strong className="text-white font-bold">{activePickerName}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Presentation Stage */}
      <main className="flex-1 flex items-center justify-center p-3 md:p-6">
        {boardType === 'bingo_5x5' ? (
          <BingoBoard
            categories={gameState?.categories || []}
            selectedTileId={selectedTileId}
            pickerColor={activePickerColor}
            pickerName={activePickerName}
            disabled={true}
            bingoBanner={bingoBanner}
          />
        ) : (
          <StandardBoard
            categories={gameState?.categories || []}
            selectedTileId={selectedTileId}
            pickerColor={activePickerColor}
            pickerName={activePickerName}
            disabled={true}
          />
        )}
      </main>

      {/* Bonus Minefield Detonation Cutscene */}
      {isBonusExplode && activeClue && (
        <BonusBoardOverlay
          clue={activeClue}
          isHost={false}
          buzzerState={gameState?.buzzer}
        />
      )}

      {/* Standard Clue Presentation Modal (Spectator TV Mode: Question & Media Fully Visible!) */}
      {showClueModal && (
        <ClueModal
          clue={activeClue}
          categoryName={activeClue.category_name || 'Jeopardy'}
          isHost={false}
          buzzerState={gameState?.buzzer}
          mediaSyncState={mediaSyncState}
        />
      )}

      {/* Bottom Spectator Scoreboard Bar */}
      <footer className="px-6 py-4 bg-slate-950/90 border-t border-slate-800 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-4">
          {(gameState?.players || []).map((player: any) => (
            <div
              key={player.id}
              className="flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700/80 shadow-md"
            >
              <div
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: player.color_hex || '#3B82F6' }}
              />
              <div>
                <span className="text-xs font-bold text-slate-200 block truncate max-w-[120px]">
                  {player.display_name}
                </span>
                <span
                  className={`font-mono text-sm font-black ${
                    player.score >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  ${player.score.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
};

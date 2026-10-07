import React, { useEffect, useState, useRef, useCallback } from 'react';
import { BuzzerButton } from '../components/buzzer/BuzzerButton';
import { PlayerScoreboardHUD } from '../components/scoreboard/PlayerScoreboardHUD';
import { DebuffOverlay, DebuffState } from '../components/animations/DebuffOverlay';
import { ItemCastDrawer } from '../components/shop/ItemCastDrawer';
import { ShopModal } from '../components/shop/ShopModal';
import { ShopItemData } from '../components/cards/ItemCard';
import { StandardBoard } from '../components/boards/StandardBoard';
import { BingoBoard } from '../components/boards/BingoBoard';
import { MarkdownViewer } from '../components/markdown/MarkdownViewer';
import { ContestantsTopRow } from '../components/scoreboard/ContestantsTopRow';
import { Coins, Zap, Shield, Users, ArrowLeft, FolderLock, Sparkles, CheckCircle2 } from 'lucide-react';

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
  const [shopCatalog, setShopCatalog] = useState<ShopItemData[]>([]);
  const [debuff, setDebuff] = useState<DebuffState>({ type: null });
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [secretPartner, setSecretPartner] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState(18);
  const [topicPeek, setTopicPeek] = useState<string | null>(null);
  const [mediaSyncState, setMediaSyncState] = useState<any>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const pingStartRef = useRef<number>(0);

  // Fetch shop catalog on mount
  useEffect(() => {
    fetch('/api/shop/items')
      .then((res) => res.json())
      .then((data) => setShopCatalog(data.items || []))
      .catch(() => {});
  }, []);

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
          if (data.state === 'SHOP') {
            setIsShopOpen(true);
          } else {
            setIsShopOpen(false);
          }
        } else if (type === 'media:sync') {
          setMediaSyncState(data);
        } else if (type === 'debuff:static_jammer') {
          setDebuff({ type: 'static_jammer', data });
        } else if (type === 'buff:shield_break') {
          setDebuff({ type: 'shield_break', data });
        } else if (type === 'buff:crit_proc') {
          setDebuff({ type: 'crit_proc', data });
        } else if (type === 'intel:dossier_reveal') {
          setSecretPartner(data.partner_name);
          setDebuff({ type: 'dossier_reveal', data });
        } else if (type === 'intel:radio_reveal') {
          setSecretPartner(data.partner_name);
          setDebuff({ type: 'dossier_reveal', data });
        } else if (type === 'hot_potato:topic_peek') {
          setTopicPeek(data.topic_preview);
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

  // Global Spacebar Key Listener
  useEffect(() => {
    const handleGlobalSpaceKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        // Prevent default scrolling on spacebar
        if (gameState?.state === 'BUZZ_OPEN') {
          e.preventDefault();
          handleBuzz(120);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalSpaceKey);
    return () => window.removeEventListener('keydown', handleGlobalSpaceKey);
  }, [gameState?.state, handleBuzz]);

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

  // Item Cast Handler
  const handleCastItem = (itemKey: string, targetPlayerId?: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'item:cast',
          data: { item_key: itemKey, target_player_id: targetPlayerId }
        })
      );
    }
  };

  // Shop Buy Handler
  const handleBuyItem = (itemKey: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'shop:buy',
          data: { item_key: itemKey }
        })
      );
    }
  };

  // Hot Potato Pass Handler
  const handlePassPotato = (targetPlayerId: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'hot_potato:pass',
          data: { target_player_id: targetPlayerId }
        })
      );
      setTopicPeek(null);
    }
  };

  const currentPlayer = gameState?.players?.find((p: any) => p.id === playerId);
  const myScore = currentPlayer?.score ?? 0;
  const myTokens = currentPlayer?.token_balance ?? 3;
  const myInventory = currentPlayer?.inventory ?? [];

  const isBuzzerUnlocked = Boolean(gameState?.buzzer?.is_unlocked);
  const isJammed = debuff.type === 'static_jammer';

  const activeClue = gameState?.active_clue;
  const isAuthorLocked = Boolean(
    activeClue?.is_bonus_mine &&
    activeClue?.author_name &&
    activeClue?.author_name.trim().toLowerCase() === playerName.trim().toLowerCase()
  );

  const isHotPotatoRound = gameState?.current_round?.board_type === 'hot_potato';
  const hotPotatoHolderId = gameState?.hot_potato?.holder_id;
  const isItemWindow = gameState?.state === 'ITEM_WINDOW';
  const isBonusBoard = Boolean(gameState?.is_bonus_board) || gameState?.state === 'BONUS_BOARD';
  const isShop = gameState?.state === 'SHOP';
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
      {/* Target-Side Debuff & Buff Overlay */}
      <DebuffOverlay debuff={debuff} onClear={() => setDebuff({ type: null })} />

      {/* Top Bar: Room, Name, Token & Score Pills */}
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
          {/* Tokens Pill */}
          <button
            type="button"
            onClick={() => setIsShopOpen(true)}
            className="flex items-center gap-1 px-3 py-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-500 rounded-full text-amber-300 font-mono text-xs font-bold transition-colors shadow"
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>{myTokens}</span>
          </button>

          {/* Score Pill */}
          <div className="px-3 py-1 bg-[#1A0E34] border border-white/20 rounded-full font-mono text-xs font-black text-emerald-400 shadow">
            ${myScore.toLocaleString()}
          </div>
        </div>
      </header>

      {/* Contestants Money & Tokens Row at Top */}
      <ContestantsTopRow
        players={gameState?.players || []}
        currentPlayerId={playerId}
        activePickerId={gameState?.active_picker_id}
        buzzWinnerId={gameState?.buzzer?.winner?.player_id}
        hotPotatoHolderId={hotPotatoHolderId}
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
            <p className="text-[11px] font-mono text-slate-400">
              When the host starts, you'll be assigned a secret teammate and given a starting balance of 3 Bounty Tokens!
            </p>
          </div>
        </div>
      )}

      {/* BOARD PHASE: Interactive Turn-Based Selection */}
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

      {/* SHOP INTERMISSION VIEW (When Host pauses for Shop) */}
      {isShop && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full">
          <div className="clay-card w-full bg-[#1A0E34]/95 border-2 border-amber-500/80 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
            <Coins className="w-12 h-12 text-amber-400 mx-auto mb-3 animate-bounce" />
            <h2 className="bubble-text gold-theme text-2xl md:text-3xl font-black mb-1">
              SHOP INTERMISSION
            </h2>
            <p className="text-xs font-mono text-slate-300 mb-4">
              Spend your Bounty Tokens ({myTokens} available) on tactical items!
            </p>
            <button
              type="button"
              onClick={() => setIsShopOpen(true)}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-sm font-mono shadow-xl transition-transform active:scale-95 mb-3"
            >
              OPEN SHOP CATALOG
            </button>
            <p className="text-[11px] font-mono text-slate-400">
              Waiting for Host to resume the board...
            </p>
          </div>
        </div>
      )}

      {/* CLUE / BUZZER WORKSPACE (Displays Full Question to Everyone) */}
      {!isBoardPhase && !isLobby && !isShop && (
        <main className="flex-1 flex flex-col items-center justify-start p-3 md:p-6 max-w-4xl mx-auto w-full overflow-y-auto">
          {/* Full Clue Presentation Card (Displayed to Contestant) */}
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
                  {gameState?.buzzer?.winner ? (
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 font-mono text-xs font-bold animate-pulse">
                      ⚡ {gameState.buzzer.winner.winner_name || gameState.buzzer.winner.display_name} Buzzed In!
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

              {/* Clue Question Markdown Body */}
              <div className="text-base sm:text-lg md:text-xl text-slate-100 leading-relaxed max-h-[42vh] overflow-y-auto pr-1">
                <MarkdownViewer
                  content={activeClue.clue_markdown || 'Loading question...'}
                  isHost={false}
                  mediaSyncState={mediaSyncState}
                />
              </div>
            </div>
          )}

          {/* Hot Potato Peek & Pass HUD */}
          {isHotPotatoRound && hotPotatoHolderId === playerId && (
            <div className="mb-4 w-full max-w-sm p-4 bg-red-950/80 border-2 border-red-500 rounded-2xl text-center animate-bounce shadow-xl">
              <span className="text-xs font-mono font-bold text-red-200 block mb-1">
                YOU ARE HOLDING THE BOMB!
              </span>
              {topicPeek && (
                <p className="text-xs text-amber-300 font-mono mb-2">Next Clue: "{topicPeek}"</p>
              )}
              <p className="text-[11px] text-slate-300 mb-2">Pass to an eligible player:</p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {gameState?.players
                  ?.filter((p: any) => p.is_hot_potato_eligible && p.id !== playerId)
                  .map((target: any) => (
                    <button
                      key={target.id}
                      onClick={() => handlePassPotato(target.id)}
                      className="py-1 px-3 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg"
                    >
                      {target.display_name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Tactile Buzzer Button */}
          <div className="w-full flex flex-col items-center justify-center my-2">
            <BuzzerButton
              isUnlocked={isBuzzerUnlocked}
              unlockTimestampMs={Date.now()}
              isJammed={isJammed}
              isAuthorLocked={isAuthorLocked}
              authorDelaySeconds={1.5}
              onBuzz={handleBuzz}
              disabled={!isBuzzerUnlocked || Boolean(gameState?.buzzer?.winner)}
            />

            <span className="mt-3 text-[11px] font-mono text-slate-400 bg-black/40 px-3 py-1 rounded-full border border-white/10">
              Keyboard shortcut: <strong className="text-amber-300">[ SPACEBAR ]</strong> to buzz
            </span>
          </div>
        </main>
      )}

      {/* 5-Second Item Cast Window Drawer */}
      <ItemCastDrawer
        isOpen={isItemWindow}
        categoryName={activeClue?.category_name || 'Trivia Clue'}
        points={activeClue?.base_points || 200}
        playerInventory={myInventory}
        catalogItems={shopCatalog}
        players={gameState?.players || []}
        currentPlayerId={playerId}
        onCastItem={handleCastItem}
      />

      {/* Intermission Shop Modal */}
      <ShopModal
        isOpen={isShopOpen}
        onClose={() => setIsShopOpen(false)}
        catalog={shopCatalog}
        playerTokens={myTokens}
        onBuyItem={handleBuyItem}
        purchasedKeys={myInventory}
      />
    </div>
  );
};

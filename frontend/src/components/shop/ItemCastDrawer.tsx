import React, { useState, useEffect } from 'react';
import { Zap, Clock, Shield, Target } from 'lucide-react';
import { ItemCard, ShopItemData } from '../cards/ItemCard';

interface ItemCastDrawerProps {
  isOpen: boolean;
  categoryName: string;
  points: number;
  playerInventory: string[]; // item_keys
  catalogItems: ShopItemData[];
  players: any[];
  currentPlayerId: string;
  onCastItem: (itemKey: string, targetPlayerId?: string) => void;
}

export const ItemCastDrawer: React.FC<ItemCastDrawerProps> = ({
  isOpen,
  categoryName,
  points,
  playerInventory,
  catalogItems,
  players,
  currentPlayerId,
  onCastItem,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(5.0);
  const [selectedTarget, setSelectedTarget] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setSecondsLeft(5.0);
      const interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 0.1) {
            clearInterval(interval);
            return 0;
          }
          return Math.round((prev - 0.1) * 10) / 10;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter opponents for target dropdown (excluding me)
  const opponents = players.filter((p) => p.id !== currentPlayerId);

  // Filter items in player's inventory
  const ownedCastableItems = catalogItems.filter(
    (item) => playerInventory.includes(item.item_key) && item.category !== 'INTEL'
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 bg-slate-950/95 border-t-2 border-amber-500 backdrop-blur-xl shadow-2xl animate-slide-up">
      <div className="max-w-3xl mx-auto">
        {/* Header: 5s Timer & Category */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
              5-Second Pre-Reveal Item Cast Window
            </span>
            <h3 className="text-lg font-black text-white">
              Category: <span className="text-sky-300">{categoryName}</span> (${points})
            </h3>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-950/80 border border-amber-500 rounded-xl text-amber-300 font-mono text-sm font-bold">
            <Clock className="w-4 h-4 animate-spin" />
            <span>{secondsLeft.toFixed(1)}s</span>
          </div>
        </div>

        {/* Content: Inventory Castables */}
        <div className="mt-4">
          {ownedCastableItems.length === 0 ? (
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
              You do not have any combat items in your inventory to cast for this clue.
            </div>
          ) : (
            <div className="space-y-3">
              {/* If player has Static Jammer, show target opponent dropdown */}
              {ownedCastableItems.some((i) => i.item_key === 'static_jammer') && (
                <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-red-300 font-bold">
                    <Target className="w-4 h-4 text-red-400" />
                    <span>Static Jammer Target:</span>
                  </div>
                  <select
                    value={selectedTarget}
                    onChange={(e) => setSelectedTarget(e.target.value)}
                    className="bg-slate-900 border border-red-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none font-mono"
                  >
                    <option value="">Select Opponent to Jam...</option>
                    {opponents.map((opp) => (
                      <option key={opp.id} value={opp.id}>
                        {opp.display_name} (${opp.score})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Grid of items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto">
                {ownedCastableItems.map((item) => {
                  const isJammer = item.item_key === 'static_jammer';
                  const needsTarget = isJammer && !selectedTarget;

                  return (
                    <ItemCard
                      key={item.item_key}
                      item={item}
                      mode="cast"
                      disabled={needsTarget}
                      actionLabel={needsTarget ? 'Select Target First' : `Activate ${item.name}`}
                      onAction={() => onCastItem(item.item_key, isJammer ? selectedTarget : undefined)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

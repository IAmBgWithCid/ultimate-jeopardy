import React from 'react';
import { ShoppingBag, Coins, X, Check } from 'lucide-react';
import { ItemCard, ShopItemData } from '../cards/ItemCard';

interface ShopModalProps {
  isOpen: boolean;
  onClose?: () => void;
  catalog: ShopItemData[];
  playerTokens: number;
  onBuyItem: (itemKey: string) => void;
  purchasedKeys?: string[];
}

export const ShopModal: React.FC<ShopModalProps> = ({
  isOpen,
  onClose,
  catalog,
  playerTokens,
  onBuyItem,
  purchasedKeys = [],
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-5xl bg-slate-950 border-2 border-amber-500/70 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-wider">
                Intermission Bounty Shop
              </h3>
              <p className="text-xs text-slate-400">
                Purchases are completely confidential. Opponents do not see your inventory!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Player's Token Balance */}
            <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-950/80 border border-amber-500 rounded-xl text-amber-300 font-mono text-base font-bold shadow-md">
              <Coins className="w-5 h-5 text-amber-400" />
              <span>{playerTokens} Tokens</span>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Catalog Items Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalog.map((item) => {
              const canAfford = playerTokens >= item.cost_tokens;
              const hasBought = purchasedKeys.includes(item.item_key);

              return (
                <ItemCard
                  key={item.item_key}
                  item={item}
                  mode="shop"
                  canAfford={canAfford}
                  disabled={!canAfford}
                  actionLabel={canAfford ? `Buy (${item.cost_tokens} Tk)` : 'Insufficient Tokens'}
                  onAction={() => onBuyItem(item.item_key)}
                />
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Earn +1 Token per correct answer, +1 pity token per incorrect guess, +2 on Bonus Mines.</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-bold"
            >
              Done Shopping
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

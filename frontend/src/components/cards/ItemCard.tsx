import React from 'react';
import { ASSET_MANIFEST } from '../../constants/assetManifest';
import { Coins } from 'lucide-react';

export interface ShopItemData {
  item_key: string;
  name: string;
  description: string;
  cost_tokens: number;
  category: 'SCORE' | 'BUZZER' | 'DEFENSE' | 'INTEL' | string;
}

interface ItemCardProps {
  item: ShopItemData;
  mode?: 'shop' | 'cast';
  canAfford?: boolean;
  onAction?: () => void;
  actionLabel?: string;
  disabled?: boolean;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  mode = 'shop',
  canAfford = true,
  onAction,
  actionLabel,
  disabled = false,
}) => {
  const manifestEntry = (ASSET_MANIFEST as any)[`item_${item.item_key}`];
  const svgContent = manifestEntry?.urlOrSvg;

  const categoryColors: Record<string, string> = {
    SCORE: 'bg-amber-950 text-amber-300 border-amber-800',
    BUZZER: 'bg-blue-950 text-blue-300 border-blue-800',
    DEFENSE: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    INTEL: 'bg-purple-950 text-purple-300 border-purple-800',
  };

  const badgeClass = categoryColors[item.category] || 'bg-slate-800 text-slate-300 border-slate-700';

  return (
    <div className="relative bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between shadow-xl transition-all">
      {/* Top: Icon & Category */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800/80 p-2 flex items-center justify-center border border-slate-700/60 shadow-inner overflow-hidden">
            {svgContent ? (
              svgContent.trim().startsWith('<svg') ? (
                <div
                  className="w-full h-full flex items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              ) : (
                <img
                  src={svgContent}
                  alt={item.name}
                  className="w-full h-full object-contain"
                />
              )
            ) : (
              <Coins className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <span className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-full border ${badgeClass}`}>
            {item.category}
          </span>
        </div>

        {/* Title */}
        <h4 className="text-base font-bold text-white mb-1">
          {item.name}
        </h4>

        {/* Description */}
        <p className="text-xs text-slate-400 leading-relaxed mb-4 min-h-[40px]">
          {item.description}
        </p>
      </div>

      {/* Bottom: Cost & Action Button */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        {mode === 'shop' && (
          <div className="flex items-center gap-1 text-amber-400 font-mono text-sm font-bold">
            <Coins className="w-4 h-4 text-amber-400" />
            <span>{item.cost_tokens} {item.cost_tokens === 1 ? 'Token' : 'Tokens'}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onAction}
          disabled={disabled || (mode === 'shop' && !canAfford)}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center ${
            disabled || (mode === 'shop' && !canAfford)
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : mode === 'cast'
              ? 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-900/30'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/20'
          }`}
        >
          {actionLabel || (mode === 'cast' ? 'Cast Item' : 'Purchase')}
        </button>
      </div>
    </div>
  );
};

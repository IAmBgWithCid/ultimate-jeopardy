import React from 'react';
import { Check, Star } from 'lucide-react';

interface BingoTileProps {
  row: number;
  col: number;
  points: number;
  topic?: string;
  isClaimed: boolean;
  claimedColor?: string;
  isSelected?: boolean;
  pickerColor?: string;
  pickerName?: string;
  isWinningLine?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export const BingoTile: React.FC<BingoTileProps> = ({
  row,
  col,
  points,
  topic,
  isClaimed,
  claimedColor,
  isSelected = false,
  pickerColor = '#EC4899',
  pickerName,
  isWinningLine = false,
  onClick,
  disabled = false,
}) => {
  const isPivot = row === 2 && col === 2;

  if (isClaimed) {
    return (
      <div
        className={`relative w-full aspect-square rounded-2xl flex flex-col items-center justify-center p-2 text-center shadow-lg transition-all ${
          isWinningLine ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-black animate-pulse shadow-amber-500/50 scale-105' : ''
        }`}
        style={{
          background: claimedColor ? `linear-gradient(180deg, ${claimedColor}40 0%, #16102B 100%)` : '#1E293B',
          borderColor: isWinningLine ? '#FFD166' : (claimedColor || '#3B82F6'),
          borderWidth: '3px'
        }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shadow-md mb-1"
          style={{ backgroundColor: claimedColor || '#3B82F6' }}
        >
          <Check className="w-4 h-4 text-white stroke-[3]" />
        </div>
        <span className="text-[10px] md:text-xs font-mono font-bold text-white uppercase tracking-wider">
          Claimed
        </span>
        <span className="text-[10px] font-mono font-bold text-slate-200">
          +${points}
        </span>
      </div>
    );
  }

  if (isSelected) {
    return (
      <div
        className="relative w-full aspect-square rounded-2xl flex flex-col items-center justify-center p-2 text-center animate-pulse shadow-2xl transition-all"
        style={{
          background: `linear-gradient(180deg, ${pickerColor}44 0%, #16102B 100%)`,
          border: `3px solid ${pickerColor}`,
          boxShadow: `0 0 25px ${pickerColor}99`,
          transform: 'scale(1.04)',
        }}
      >
        <span className="bubble-text gold-theme text-sm md:text-lg">
          ${points}
        </span>
        <div
          className="mt-1 px-1.5 py-0.5 rounded-full text-[8px] font-black text-white uppercase tracking-wider"
          style={{ backgroundColor: pickerColor }}
        >
          🎯 {pickerName || 'Picked'}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`clay-card relative w-full aspect-square rounded-2xl flex flex-col items-center justify-between p-2 md:p-3 text-center transition-all duration-200 select-none
        ${isPivot ? 'bg-gradient-to-br from-amber-900/60 to-purple-950/80 border-2 border-amber-400 shadow-amber-500/20 shadow-xl' : 'bg-gradient-to-br from-[#301B5A] to-[#170C2E] border-2 border-white/20 shadow-md'}
        hover:border-pink-400 hover:shadow-pink-500/30 hover:scale-[1.03] active:scale-[0.97]
        ${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}
      `}
    >
      {/* Top indicator: Pivot badge or coordinate */}
      <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-300">
        <span>[{row},{col}]</span>
        {isPivot && (
          <span className="flex items-center gap-0.5 text-amber-400 font-bold">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> PIVOT
          </span>
        )}
      </div>

      {/* Middle: Topic teaser preview */}
      <div className="my-auto px-1">
        <p className="text-[11px] md:text-xs font-semibold text-slate-200 line-clamp-2 leading-tight">
          {topic || 'Trivia Challenge'}
        </p>
      </div>

      {/* Bottom: Points */}
      <div className="w-full text-center">
        <span className="bubble-text gold-theme text-xs md:text-base">
          ${points}
        </span>
      </div>
    </button>
  );
};

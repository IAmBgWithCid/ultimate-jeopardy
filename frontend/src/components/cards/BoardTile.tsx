import React from 'react';

interface BoardTileProps {
  points: number;
  isClaimed: boolean;
  claimedColor?: string;
  isSelected?: boolean;
  pickerColor?: string;
  pickerName?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export const BoardTile: React.FC<BoardTileProps> = ({
  points,
  isClaimed,
  claimedColor,
  isSelected = false,
  pickerColor = '#EC4899',
  pickerName,
  onClick,
  disabled = false,
}) => {
  if (isClaimed) {
    return (
      <div
        className="w-full h-24 md:h-28 rounded-2xl flex flex-col items-center justify-center p-2 text-center shadow-inner opacity-70 select-none cursor-not-allowed transition-all relative overflow-hidden"
        style={{
          background: claimedColor ? `linear-gradient(180deg, ${claimedColor}33 0%, #110B22 100%)` : '#16102B',
          border: `2px solid ${claimedColor || '#475569'}`,
        }}
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-md mb-1"
          style={{ backgroundColor: claimedColor || '#3B82F6' }}
        >
          ✓
        </div>
        <span className="font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">
          Claimed
        </span>
        <span className="text-[10px] font-mono font-bold" style={{ color: claimedColor || '#94A3B8' }}>
          +${points}
        </span>
      </div>
    );
  }

  if (isSelected) {
    return (
      <div
        className="w-full h-24 md:h-28 rounded-2xl flex flex-col items-center justify-center p-2 text-center transition-all duration-200 select-none relative animate-pulse shadow-2xl"
        style={{
          background: `linear-gradient(180deg, ${pickerColor}40 0%, #201344 100%)`,
          border: `3px solid ${pickerColor}`,
          boxShadow: `0 0 25px ${pickerColor}80, 0 8px 0px rgba(0,0,0,0.4)`,
          transform: 'scale(1.03)',
        }}
      >
        <span className="bubble-text gold-theme text-2xl md:text-4xl drop-shadow-md">
          ${points}
        </span>
        <div
          className="mt-1 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-black text-white uppercase tracking-wider shadow"
          style={{ backgroundColor: pickerColor }}
        >
          🎯 {pickerName ? `${pickerName}` : 'Selected'}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`clay-card w-full h-24 md:h-28 rounded-2xl flex flex-col items-center justify-center p-2 text-center transition-all duration-200 select-none
        bg-gradient-to-b from-[#381F68] to-[#1C0F38] border-2 border-white/20 shadow-lg
        hover:from-[#4E2D8E] hover:to-[#281650] hover:border-amber-300 hover:shadow-purple-500/30 hover:scale-[1.02]
        active:scale-[0.98] ${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}
      `}
    >
      <span className="bubble-text gold-theme text-2xl md:text-4xl drop-shadow-md">
        ${points}
      </span>
    </button>
  );
};

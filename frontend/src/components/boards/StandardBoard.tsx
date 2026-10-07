import React from 'react';
import { BoardTile } from '../cards/BoardTile';

interface StandardBoardProps {
  categories: any[];
  onTileClick?: (clueId: string) => void;
  disabled?: boolean;
  selectedTileId?: string | null;
  pickerColor?: string | null;
  pickerName?: string | null;
}

export const StandardBoard: React.FC<StandardBoardProps> = ({
  categories,
  onTileClick,
  disabled = false,
  selectedTileId,
  pickerColor,
  pickerName,
}) => {
  if (!categories || categories.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 font-mono">
        No board categories available.
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-2 md:p-6 overflow-x-auto">
      <div
        className="grid gap-2 md:gap-3"
        style={{
          gridTemplateColumns: `repeat(${categories.length}, minmax(130px, 1fr))`
        }}
      >
        {/* Category Header Row */}
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="clay-card h-20 md:h-24 p-2 rounded-2xl flex items-center justify-center text-center bg-gradient-to-b from-[#4A267A] to-[#251342] border-2 border-white/20 shadow-lg"
          >
            <h3 className="font-display-title text-xs md:text-sm lg:text-base font-black text-amber-300 uppercase tracking-wider drop-shadow line-clamp-3">
              {cat.name}
            </h3>
          </div>
        ))}

        {/* Rows of Clues (Dynamic Row Count) */}
        {(() => {
          const maxRows = Math.max(1, ...categories.map((c) => (c.clues || []).length));
          const rowIndices = Array.from({ length: maxRows }, (_, i) => i);
          return rowIndices.map((rowIdx) => (
            <React.Fragment key={`row-${rowIdx}`}>
              {categories.map((cat) => {
                const clue = cat.clues?.find((c: any) => c.row_idx === rowIdx) || cat.clues?.[rowIdx];
                if (!clue) {
                  return (
                    <div
                      key={`empty-${cat.id}-${rowIdx}`}
                      className="h-24 md:h-28 rounded-2xl bg-slate-950/40 border border-slate-800/40"
                    />
                  );
                }

                const isClaimed = Boolean(clue.claimed_by_player_id);
                const isSelected = selectedTileId === clue.id;

                return (
                  <BoardTile
                    key={clue.id}
                    points={clue.base_points}
                    isClaimed={isClaimed}
                    claimedColor={clue.claimed_color}
                    isSelected={isSelected}
                    pickerColor={pickerColor || '#EC4899'}
                    pickerName={pickerName || undefined}
                    onClick={() => onTileClick?.(clue.id)}
                    disabled={disabled || isClaimed}
                  />
                );
              })}
            </React.Fragment>
          ));
        })()}
      </div>
    </div>
  );
};

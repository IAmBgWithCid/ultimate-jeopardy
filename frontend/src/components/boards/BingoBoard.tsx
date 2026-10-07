import React from 'react';
import { BingoTile } from '../cards/BingoTile';
import { Trophy } from 'lucide-react';

interface BingoBoardProps {
  categories: any[];
  onTileClick?: (clueId: string) => void;
  disabled?: boolean;
  selectedTileId?: string | null;
  pickerColor?: string | null;
  pickerName?: string | null;
  bingoBanner?: {
    player_id: string;
    player_name?: string;
    lines?: number;
    bonus: number;
    winning_tiles?: Array<{ row_idx: number; col_idx: number }>;
  } | null;
}

export const BingoBoard: React.FC<BingoBoardProps> = ({
  categories,
  onTileClick,
  disabled = false,
  selectedTileId,
  pickerColor,
  pickerName,
  bingoBanner,
}) => {
  // Collect all 25 clues
  const allClues = categories?.[0]?.clues || [];

  const winningCoords = bingoBanner?.winning_tiles || [];
  const isCoordWinning = (r: number, c: number) =>
    winningCoords.some((coord) => coord.row_idx === r && coord.col_idx === c);

  return (
    <div className="w-full max-w-4xl mx-auto p-3 md:p-6">
      {/* 5-in-a-row $1,000 Bonus Banner */}
      {bingoBanner && (
        <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-black shadow-2xl flex items-center justify-between animate-bounce">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 fill-black" />
            <div>
              <h3 className="font-black text-lg md:text-xl uppercase tracking-wider">
                BINGO LINE COMPLETED!
              </h3>
              <p className="text-xs font-mono font-bold">
                5-in-a-row achieved! +${bingoBanner.bonus.toLocaleString()} Flat Bonus Awarded!
              </p>
            </div>
          </div>
          <span className="font-display-title text-3xl font-black">
            +$1,000
          </span>
        </div>
      )}

      {/* Header Info */}
      <div className="mb-4 text-center">
        <h2 className="text-xl md:text-2xl font-black text-amber-400 uppercase tracking-widest">
          The 5x5 Bingo Matrix
        </h2>
        <p className="text-xs md:text-sm text-slate-400 mt-1">
          Complete any horizontal, vertical, or diagonal 5-tile line for a <span className="text-amber-300 font-bold">$1,000 Bonus</span>. Missed clues stay open!
        </p>
      </div>

      {/* 5x5 Grid */}
      <div className="grid grid-cols-5 gap-2 md:gap-3 p-3 md:p-4 rounded-3xl bg-slate-950/70 border-2 border-indigo-900/60 shadow-2xl backdrop-blur-md">
        {[0, 1, 2, 3, 4].map((r) =>
          [0, 1, 2, 3, 4].map((c) => {
            const clue = allClues.find((item: any) => item.row_idx === r && item.col_idx === c);

            if (!clue) {
              return (
                <div
                  key={`empty-${r}-${c}`}
                  className="aspect-square rounded-xl bg-slate-900/50 border border-slate-800"
                />
              );
            }

            const isClaimed = Boolean(clue.claimed_by_player_id);
            const isSelected = selectedTileId === clue.id;
            const isWinningLine = isCoordWinning(r, c);

            return (
              <BingoTile
                key={clue.id}
                row={r}
                col={c}
                points={clue.base_points}
                topic={clue.topic_preview}
                isClaimed={isClaimed}
                claimedColor={clue.claimed_color}
                isSelected={isSelected}
                pickerColor={pickerColor || '#EC4899'}
                pickerName={pickerName || undefined}
                isWinningLine={isWinningLine}
                onClick={() => onTileClick?.(clue.id)}
                disabled={disabled || isClaimed}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

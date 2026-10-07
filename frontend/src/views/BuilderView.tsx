import React, { useState, useEffect, useRef } from 'react';
import { MarkdownViewer } from '../components/markdown/MarkdownViewer';
import { MediaDropzone } from '../components/markdown/MediaDropzone';
import { ArrowLeft, Save, Download, Upload, Plus, Minus, Trash2, CheckCircle, RefreshCw, Eye, Copy, FolderPlus } from 'lucide-react';

interface BuilderViewProps {
  onBack: () => void;
}

export const BuilderView: React.FC<BuilderViewProps> = ({ onBack }) => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default-ultimate-jeopardy');
  const [templateData, setTemplateData] = useState<any>(null);
  const [activeRoundIdx, setActiveRoundIdx] = useState<number>(0);
  const [selectedClue, setSelectedClue] = useState<any>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState(false);
  const [saveAsTitle, setSaveAsTitle] = useState('');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load template list
  useEffect(() => {
    fetch('/api/templates')
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates || []))
      .catch(() => {});
  }, []);

  // Load active template data
  useEffect(() => {
    if (!selectedTemplateId) return;
    fetch(`/api/templates/${selectedTemplateId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.template) {
          setTemplateData(data.template);
          const firstClue = data.template.rounds?.[0]?.categories?.[0]?.clues?.[0];
          setSelectedClue(firstClue || null);
        }
      })
      .catch(() => {});
  }, [selectedTemplateId]);

  // Debounced auto-save (500ms on keystroke)
  const triggerAutoSave = (updatedData: any) => {
    setSaveStatus('dirty');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await fetch(`/api/templates/${updatedData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedData),
        });
        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    }, 500);
  };

  // Immediate save on blur
  const handleImmediateSave = async () => {
    if (!templateData) return;
    setSaveStatus('saving');
    try {
      await fetch(`/api/templates/${templateData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData),
      });
      setSaveStatus('saved');
    } catch (err) {
      console.error('Save error:', err);
    }
  };

  // Update round-level field (name, board_type)
  const updateRoundField = (field: string, value: any) => {
    if (!templateData) return;
    const updatedRounds = [...templateData.rounds];
    if (!updatedRounds[activeRoundIdx]) return;
    updatedRounds[activeRoundIdx] = { ...updatedRounds[activeRoundIdx], [field]: value };
    const newTemplate = { ...templateData, rounds: updatedRounds };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  // Add new round (supports Bonus Minefield, Bingo, Standard, Hot Potato)
  const handleAddRound = (boardType: string = 'bonus_minefield') => {
    if (!templateData) return;
    const newRoundNumber = (templateData.rounds?.length || 0) + 1;
    const typeLabel = boardType === 'bonus_minefield'
      ? 'Bonus Minefield'
      : boardType === 'bingo_5x5'
      ? '5x5 Bingo Matrix'
      : boardType === 'hot_potato'
      ? 'Hot Potato Gauntlet'
      : 'Jeopardy Board';

    const newCategories = [
      {
        id: `r${newRoundNumber}-cat1-${Date.now()}`,
        name: boardType === 'bonus_minefield' ? 'Contestant Submissions' : 'New Category',
        display_order: 0,
        clues: [200, 400, 600, 800, 1000].map((pts, idx) => ({
          id: `r${newRoundNumber}-c1-clue${idx}-${Date.now()}`,
          base_points: pts,
          row_idx: idx,
          col_idx: 0,
          clue_markdown: `Trivia clue for $${pts}.`,
          correct_answer: 'Correct Answer',
          is_bonus_mine: boardType === 'bonus_minefield',
          author_name: boardType === 'bonus_minefield' ? 'Contestant' : null,
        }))
      }
    ];

    const newRound = {
      id: `round-${newRoundNumber}-${Date.now()}`,
      round_number: newRoundNumber,
      round_name: `Round ${newRoundNumber}: ${typeLabel}`,
      board_type: boardType,
      round_timer_seconds: 0,
      shop_follows: true,
      categories: newCategories,
    };

    const newTemplate = {
      ...templateData,
      rounds: [...(templateData.rounds || []), newRound],
    };
    setTemplateData(newTemplate);
    setActiveRoundIdx(newTemplate.rounds.length - 1);
    setSelectedClue(newCategories[0].clues[0]);
    triggerAutoSave(newTemplate);
  };

  // Clue field update
  const updateClueField = (field: string, value: any) => {
    if (!selectedClue || !templateData) return;

    const updatedRounds = [...templateData.rounds];
    const curRound = updatedRounds[activeRoundIdx];
    if (!curRound) return;

    for (const cat of curRound.categories) {
      const clueIndex = cat.clues.findIndex((c: any) => c.id === selectedClue.id);
      if (clueIndex !== -1) {
        cat.clues[clueIndex] = { ...cat.clues[clueIndex], [field]: value };
        setSelectedClue(cat.clues[clueIndex]);
        break;
      }
    }

    const newTemplate = { ...templateData, rounds: updatedRounds };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  // Category Name inline update
  const updateCategoryName = (categoryId: string, newName: string) => {
    if (!templateData) return;
    const updatedRounds = [...templateData.rounds];
    const curRound = updatedRounds[activeRoundIdx];
    if (!curRound) return;

    curRound.categories = curRound.categories.map((c: any) =>
      c.id === categoryId ? { ...c, name: newName } : c
    );

    const newTemplate = { ...templateData, rounds: updatedRounds };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  // Add Column / Category (standard and bonus rounds)
  const handleAddCategory = () => {
    if (!templateData) return;
    const updatedRounds = [...templateData.rounds];
    const curRound = updatedRounds[activeRoundIdx];
    if (!curRound) return;

    const rowCount = curRound.categories[0]?.clues?.length || 5;
    const newCatIndex = curRound.categories.length;
    const newCatId = `r${curRound.round_number}-cat${newCatIndex + 1}-${Date.now()}`;
    const newClues = Array.from({ length: rowCount }, (_, rIdx) => {
      const pts = (rIdx + 1) * 200;
      return {
        id: `${newCatId}-clue${rIdx}-${Date.now()}`,
        base_points: pts,
        row_idx: rIdx,
        col_idx: newCatIndex,
        clue_markdown: `Trivia clue for $${pts}.`,
        correct_answer: 'Correct Answer',
        is_bonus_mine: curRound.board_type === 'bonus_minefield',
        author_name: curRound.board_type === 'bonus_minefield' ? 'Contestant' : null,
      };
    });

    curRound.categories.push({
      id: newCatId,
      name: `Category ${newCatIndex + 1}`,
      display_order: newCatIndex,
      clues: newClues,
    });

    const newTemplate = { ...templateData, rounds: updatedRounds };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  // Delete Column / Category (standard and bonus rounds)
  const handleDeleteCategory = (categoryId: string) => {
    if (!templateData) return;
    const updatedRounds = [...templateData.rounds];
    const curRound = updatedRounds[activeRoundIdx];
    if (!curRound || curRound.categories.length <= 1) return;

    curRound.categories = curRound.categories
      .filter((c: any) => c.id !== categoryId)
      .map((c: any, idx: number) => ({
        ...c,
        display_order: idx,
        clues: (c.clues || []).map((clue: any) => ({ ...clue, col_idx: idx }))
      }));

    if (selectedClue && !curRound.categories.some((c: any) => c.clues.some((cl: any) => cl.id === selectedClue.id))) {
      setSelectedClue(curRound.categories[0]?.clues?.[0] || null);
    }

    const newTemplate = { ...templateData, rounds: updatedRounds };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  // Add Row across all categories (standard and bonus rounds)
  const handleAddRow = () => {
    if (!templateData) return;
    const updatedRounds = [...templateData.rounds];
    const curRound = updatedRounds[activeRoundIdx];
    if (!curRound || curRound.categories.length === 0) return;

    curRound.categories.forEach((cat: any, colIdx: number) => {
      const rowIdx = cat.clues?.length || 0;
      const lastPts = rowIdx > 0 ? (cat.clues[rowIdx - 1]?.base_points || 200) : 0;
      const pts = lastPts + 200;
      const newClue = {
        id: `${cat.id}-clue${rowIdx}-${Date.now()}`,
        base_points: pts,
        row_idx: rowIdx,
        col_idx: colIdx,
        clue_markdown: `Trivia clue for $${pts}.`,
        correct_answer: 'Correct Answer',
        is_bonus_mine: curRound.board_type === 'bonus_minefield',
        author_name: curRound.board_type === 'bonus_minefield' ? 'Contestant' : null,
      };
      cat.clues = [...(cat.clues || []), newClue];
    });

    const newTemplate = { ...templateData, rounds: updatedRounds };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  // Remove Row across all categories (standard and bonus rounds)
  const handleRemoveRow = () => {
    if (!templateData) return;
    const updatedRounds = [...templateData.rounds];
    const curRound = updatedRounds[activeRoundIdx];
    if (!curRound || curRound.categories.length === 0) return;

    const rowCount = curRound.categories[0]?.clues?.length || 0;
    if (rowCount <= 1) return; // Keep at least 1 row

    let resetSelected = false;
    curRound.categories.forEach((cat: any) => {
      if (cat.clues && cat.clues.length > 0) {
        const removed = cat.clues.pop();
        if (selectedClue?.id === removed?.id) {
          resetSelected = true;
        }
      }
    });

    if (resetSelected) {
      setSelectedClue(curRound.categories[0]?.clues?.[0] || null);
    }

    const newTemplate = { ...templateData, rounds: updatedRounds };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  // Export JSON
  const handleExportJson = () => {
    if (!templateData) return;
    const blob = new Blob([JSON.stringify(templateData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateData.id || 'jeopardy-template'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const res = await fetch('/api/templates/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json),
        });
        const data = await res.json();
        if (data.template_id) {
          setSelectedTemplateId(data.template_id);
        }
      } catch (err) {
        alert('Invalid JSON template file');
      }
    };
    reader.readAsText(file);
  };

  // Add a Question to a specific Category
  const handleAddClueToCategory = (categoryId: string) => {
    if (!templateData) return;
    const updatedRounds = [...templateData.rounds];
    const curRound = updatedRounds[activeRoundIdx];
    if (!curRound) return;

    const catIndex = curRound.categories.findIndex((c: any) => c.id === categoryId);
    if (catIndex === -1) return;

    const targetCat = curRound.categories[catIndex];
    const currentCount = targetCat.clues?.length || 0;
    const lastClue = currentCount > 0 ? targetCat.clues[currentCount - 1] : null;
    const nextPoints = lastClue ? (lastClue.base_points || 200) + 200 : 200;

    const newClue = {
      id: `${categoryId}-clue${currentCount}-${Date.now()}`,
      base_points: nextPoints,
      row_idx: currentCount,
      col_idx: targetCat.display_order ?? catIndex,
      clue_markdown: `Trivia clue for $${nextPoints}.`,
      correct_answer: 'Correct Answer',
      is_bonus_mine: curRound.board_type === 'bonus_minefield',
      author_name: curRound.board_type === 'bonus_minefield' ? 'Contestant' : null,
    };

    targetCat.clues = [...(targetCat.clues || []), newClue];
    setSelectedClue(newClue);

    const newTemplate = { ...templateData, rounds: updatedRounds };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  // Delete a specific Question
  const handleDeleteClue = (clueId: string) => {
    if (!templateData) return;
    const updatedRounds = [...templateData.rounds];
    const curRound = updatedRounds[activeRoundIdx];
    if (!curRound) return;

    for (const cat of curRound.categories) {
      const clueIdx = (cat.clues || []).findIndex((c: any) => c.id === clueId);
      if (clueIdx !== -1) {
        cat.clues.splice(clueIdx, 1);
        cat.clues.forEach((c: any, i: number) => {
          c.row_idx = i;
        });
        break;
      }
    }

    if (selectedClue?.id === clueId) {
      const nextClue = curRound.categories[0]?.clues?.[0] || null;
      setSelectedClue(nextClue);
    }

    const newTemplate = { ...templateData, rounds: updatedRounds };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  // Duplicate / Save Board As New Name
  const handleSaveBoardAs = async (newTitle: string) => {
    if (!templateData || !newTitle.trim()) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/templates/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_template_id: templateData.id,
          new_title: newTitle.trim(),
        }),
      });
      const data = await res.json();
      if (data.template_id) {
        const listRes = await fetch('/api/templates');
        const listData = await listRes.json();
        setTemplates(listData.templates || []);
        setSelectedTemplateId(data.template_id);
        setIsSaveAsModalOpen(false);
        setSaveStatus('saved');
      }
    } catch (err) {
      console.error('Failed to duplicate board:', err);
      alert('Failed to save board copy');
    }
  };

  // Create New Blank Board Template
  const handleCreateNewBoard = async () => {
    const newTitle = prompt('Enter name for the new board template:');
    if (!newTitle || !newTitle.trim()) return;

    const newId = `template-${Date.now()}`;
    const blankTemplate = {
      id: newId,
      title: newTitle.trim(),
      status: 'DRAFT',
      rounds: [
        {
          id: `r1-${Date.now()}`,
          round_number: 1,
          round_name: 'Round 1: Standard Jeopardy',
          board_type: 'standard',
          round_timer_seconds: 0,
          shop_follows: true,
          categories: [
            {
              id: `cat1-${Date.now()}`,
              name: 'Category 1',
              display_order: 0,
              clues: [200, 400, 600, 800, 1000].map((pts, idx) => ({
                id: `c1-clue${idx}-${Date.now()}`,
                base_points: pts,
                row_idx: idx,
                col_idx: 0,
                clue_markdown: `Trivia clue for $${pts}.`,
                correct_answer: 'Correct Answer',
                is_bonus_mine: false,
                author_name: null,
              })),
            },
          ],
        },
      ],
    };

    try {
      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blankTemplate),
      });
      const listRes = await fetch('/api/templates');
      const listData = await listRes.json();
      setTemplates(listData.templates || []);
      setSelectedTemplateId(newId);
    } catch (e) {
      console.error('Failed to create new board:', e);
    }
  };

  // Update Board Title directly
  const updateBoardTitle = (title: string) => {
    if (!templateData) return;
    const newTemplate = { ...templateData, title };
    setTemplateData(newTemplate);
    triggerAutoSave(newTemplate);
  };

  const currentRound = templateData?.rounds?.[activeRoundIdx];

  return (
    <div className="min-h-screen bg-[#110724] text-slate-100 flex flex-col">
      {/* Top CMS Header */}
      <header className="px-6 py-4 bg-[#1A0E34] border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="bubble-text pink-theme text-xl md:text-2xl font-black uppercase tracking-wider">
              DYNAMIC GAME BUILDER CMS
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-slate-400">Board:</span>
                <input
                  type="text"
                  value={templateData?.title || ''}
                  onChange={(e) => updateBoardTitle(e.target.value)}
                  onBlur={handleImmediateSave}
                  className="bg-[#100720] border border-amber-400/50 rounded-lg px-2 py-0.5 text-xs font-mono font-bold text-amber-300 focus:outline-none"
                  title="Click to rename board"
                />
              </div>

              {/* Template switcher dropdown */}
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="bg-[#100720] border border-white/20 text-slate-200 font-mono text-xs rounded-lg px-2 py-0.5 font-bold cursor-pointer max-w-[180px] truncate"
                title="Switch active template"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleCreateNewBoard}
                className="p-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500 text-emerald-300 transition-colors"
                title="Create New Blank Board"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-amber-400">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Saving 500ms...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                  <CheckCircle className="w-3 h-3" /> Auto-saved
                </span>
              )}
              {saveStatus === 'dirty' && (
                <span className="text-[11px] font-mono text-slate-400">
                  Unsaved changes...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSaveAsTitle(`${templateData?.title || 'Board'} (Copy)`);
              setIsSaveAsModalOpen(true);
            }}
            className="px-3 py-2 bg-purple-700/80 hover:bg-purple-600 border border-purple-400 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow text-white"
            title="Duplicate and save board under a new name"
          >
            <Copy className="w-3.5 h-3.5" /> Save Board As...
          </button>

          <button
            type="button"
            onClick={handleImmediateSave}
            className="px-3 py-2 bg-pink-600 hover:bg-pink-500 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow"
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>

          <label className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5" /> Import JSON
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>
        </div>
      </header>

      {/* Round Engine Tabs & New Round Controls */}
      <div className="px-6 py-2.5 bg-[#140A2B] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {(templateData?.rounds || []).map((rnd: any, idx: number) => (
            <button
              key={rnd.id || idx}
              type="button"
              onClick={() => setActiveRoundIdx(idx)}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow ${
                activeRoundIdx === idx
                  ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white border border-pink-400'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              R{rnd.round_number}: {rnd.round_name} ({rnd.board_type})
            </button>
          ))}
        </div>

        {/* Add Round Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddRound('bonus_minefield')}
            className="px-3 py-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500 text-red-300 font-mono text-xs font-bold flex items-center gap-1 shadow transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> + Bonus Mine Board
          </button>
          <button
            type="button"
            onClick={() => handleAddRound('standard')}
            className="px-3 py-1.5 rounded-xl bg-blue-950/80 hover:bg-blue-900 border border-blue-500 text-blue-300 font-mono text-xs font-bold flex items-center gap-1 shadow transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> + Standard Round
          </button>
        </div>
      </div>

      {/* Active Round Config Bar */}
      {currentRound && (
        <div className="px-6 py-2.5 bg-[#180D33] border-b border-white/10 flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Round Title:</span>
            <input
              type="text"
              value={currentRound.round_name || ''}
              onChange={(e) => updateRoundField('round_name', e.target.value)}
              className="bg-[#100720] border border-white/20 rounded-lg px-2.5 py-1 text-white text-xs font-bold"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-amber-300 font-bold">Board Engine Type:</span>
            <select
              value={currentRound.board_type}
              onChange={(e) => updateRoundField('board_type', e.target.value)}
              className="bg-[#100720] border border-amber-400/50 rounded-lg px-2.5 py-1 text-amber-300 text-xs font-bold outline-none cursor-pointer"
            >
              <option value="standard">Standard Board (5x5 Grid)</option>
              <option value="bonus_minefield">Bonus Minefield Board (Player Author 1.5x / 0.5x)</option>
              <option value="bingo_5x5">5x5 Bingo Matrix ($1,000 Bonus)</option>
              <option value="hot_potato">Hot Potato Gauntlet (90s Bomb Deck)</option>
            </select>
          </div>
        </div>
      )}

      {/* Main CMS Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Column: Board Tile Selector */}
        <div className="w-full lg:w-1/2 p-6 border-r border-white/10 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-mono uppercase tracking-wider text-slate-300 font-bold">
                Round Structure & Tiles
              </h2>
              <span className="text-xs font-mono text-sky-400 font-bold">
                Engine: {currentRound?.board_type}
              </span>
            </div>

            {/* Row & Column Controls (Available on Standard and Bonus Boards, NOT Bingo) */}
            {currentRound?.board_type !== 'bingo_5x5' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500 text-emerald-300 font-mono text-[11px] font-bold flex items-center gap-1 shadow transition-colors"
                >
                  <Plus className="w-3 h-3" /> + Category (Col)
                </button>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-2.5 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500 text-indigo-300 font-mono text-[11px] font-bold flex items-center gap-1 shadow transition-colors"
                >
                  <Plus className="w-3 h-3" /> + Row
                </button>
                <button
                  type="button"
                  onClick={handleRemoveRow}
                  disabled={(currentRound?.categories?.[0]?.clues?.length || 0) <= 1}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 font-mono text-[11px] font-bold flex items-center gap-1 shadow disabled:opacity-40 transition-colors"
                >
                  <Minus className="w-3 h-3" /> - Row
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {(currentRound?.categories || []).map((cat: any) => (
              <div key={cat.id} className="p-3 bg-[#160B2C] rounded-2xl border border-white/10 shadow">
                {/* Category Name Inline Input & Category Action Buttons */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <input
                    type="text"
                    value={cat.name || ''}
                    onChange={(e) => updateCategoryName(cat.id, e.target.value)}
                    onBlur={handleImmediateSave}
                    placeholder="Category Name"
                    className="flex-1 bg-[#0F061F] border border-white/20 focus:border-amber-400 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-300 outline-none transition-colors"
                  />
                  <div className="flex items-center gap-1.5">
                    {currentRound?.board_type !== 'bingo_5x5' && (
                      <button
                        type="button"
                        title="Add Question to this category"
                        onClick={() => handleAddClueToCategory(cat.id)}
                        className="px-2 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/60 text-emerald-300 font-mono text-[10px] font-bold flex items-center gap-0.5 transition-colors shadow"
                      >
                        <Plus className="w-3 h-3" /> Clue
                      </button>
                    )}
                    {currentRound?.board_type !== 'bingo_5x5' && (currentRound?.categories?.length || 0) > 1 && (
                      <button
                        type="button"
                        title="Delete Category"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-1 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-500/50 text-red-400 hover:text-red-200 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(cat.clues || []).map((clue: any) => {
                    const isSelected = selectedClue?.id === clue.id;
                    return (
                      <button
                        key={clue.id}
                        type="button"
                        onClick={() => setSelectedClue(clue)}
                        className={`px-3 py-2 rounded-xl text-center font-mono text-xs font-bold transition-all min-w-[70px] ${
                          isSelected
                            ? 'bg-amber-400 text-black shadow-lg scale-105 border-2 border-white'
                            : clue.is_bonus_mine
                            ? 'bg-red-950/80 border-2 border-red-500 text-red-300'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                        }`}
                      >
                        ${clue.base_points}
                        {clue.is_bonus_mine && <span className="block text-[8px] font-black text-red-400">💥 MINE</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Live Markdown & Media Clue Editor */}
        <div className="w-full lg:w-1/2 p-6 overflow-y-auto flex flex-col">
          {selectedClue ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">
                  Edit Clue (${selectedClue.base_points})
                </h3>
                <div className="flex items-center gap-2">
                  {currentRound?.board_type !== 'bingo_5x5' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteClue(selectedClue.id)}
                      className="px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-500 text-red-300 font-mono text-xs font-bold flex items-center gap-1 transition-colors shadow"
                      title="Delete this question"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Question
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 text-xs font-mono text-red-400 cursor-pointer ml-1">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedClue.is_bonus_mine)}
                      onChange={(e) => updateClueField('is_bonus_mine', e.target.checked)}
                      className="rounded accent-red-500"
                    />
                    <span>Bonus Mine Tile</span>
                  </label>
                </div>
              </div>

              {/* Question Base Points ($ Value) */}
              <div>
                <label className="block text-xs font-mono text-amber-300 font-bold mb-1">
                  Question Base Points ($ Value):
                </label>
                <input
                  type="number"
                  step={100}
                  min={0}
                  value={selectedClue.base_points ?? 200}
                  onChange={(e) => updateClueField('base_points', parseInt(e.target.value) || 0)}
                  onBlur={handleImmediateSave}
                  className="w-full bg-slate-900 border border-amber-400/50 rounded-xl p-2.5 text-sm text-amber-300 font-mono font-bold focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Contestant Author Attribution (for Bonus Mines) */}
              {selectedClue.is_bonus_mine && (
                <div className="p-3 rounded-2xl bg-red-950/60 border border-red-500/80 space-y-2">
                  <div className="flex items-center gap-2 text-red-300 font-bold text-xs">
                    <span>💥 Bonus Mine Mechanic:</span>
                  </div>
                  <p className="text-[11px] text-red-200">
                    When uncovered, triggers an explosion cutscene! The contestant author is delayed by 3.5 seconds and only earns 0.5x points. Any other contestant who steals it earns 1.5x points! Wrong guesses incur zero point loss.
                  </p>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-300 mb-1">
                      Submitted by Contestant Name (Author):
                    </label>
                    <input
                      type="text"
                      value={selectedClue.author_name || ''}
                      onChange={(e) => updateClueField('author_name', e.target.value)}
                      onBlur={handleImmediateSave}
                      placeholder="e.g. Alex"
                      className="w-full bg-[#100720] border border-red-400/50 rounded-xl p-2.5 text-sm text-white font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Hot Potato Topic Preview Hint */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">
                  Topic Preview (Hot Potato 3-5 Word Teaser):
                </label>
                <input
                  type="text"
                  value={selectedClue.topic_preview || ''}
                  onChange={(e) => updateClueField('topic_preview', e.target.value)}
                  onBlur={handleImmediateSave}
                  placeholder="e.g. 1980s Sci-Fi Cinema"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-sm text-white font-mono"
                />
              </div>

              {/* Clue Markdown Text Input with Drag & Drop / Paste Uploader */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">
                  Clue Markdown & Media (Drag & Drop or Paste files):
                </label>
                <MediaDropzone
                  rows={6}
                  value={selectedClue.clue_markdown || ''}
                  onChange={(val) => updateClueField('clue_markdown', val)}
                  onBlur={handleImmediateSave}
                />
              </div>

              {/* Correct Answer Input */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">
                  Correct Answer:
                </label>
                <input
                  type="text"
                  value={selectedClue.correct_answer || ''}
                  onChange={(e) => updateClueField('correct_answer', e.target.value)}
                  onBlur={handleImmediateSave}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-sm text-emerald-400 font-mono font-bold"
                />
              </div>

              {/* Live Markdown Preview */}
              <div className="mt-4 pt-4 border-t border-slate-800">
                <span className="text-xs font-mono text-sky-400 uppercase tracking-wider block mb-2">
                  Live Clue Preview:
                </span>
                <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800">
                  <MarkdownViewer content={selectedClue.clue_markdown || '*Empty clue*'} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-sm">
              Select a tile from the left to edit clue text and preview media.
            </div>
          )}
        </div>
      </div>

      {/* Save Board As Modal */}
      {isSaveAsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#1E1038] border-2 border-white/20 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Save Board As New Name</h3>
            <p className="text-xs text-slate-300 mb-4">
              Create an independent copy of this game board so you can make modifications without affecting the original.
            </p>
            <input
              type="text"
              value={saveAsTitle}
              onChange={(e) => setSaveAsTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveBoardAs(saveAsTitle);
              }}
              placeholder="Enter new board name..."
              className="w-full bg-[#100720] border border-white/20 focus:border-pink-400 rounded-xl px-4 py-2.5 text-white font-mono text-sm mb-4 outline-none"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSaveAsModalOpen(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-mono text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveBoardAs(saveAsTitle)}
                disabled={!saveAsTitle.trim()}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 rounded-xl text-xs font-mono font-bold text-white shadow"
              >
                Duplicate Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

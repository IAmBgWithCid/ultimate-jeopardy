import React, { useState, useRef } from 'react';
import { Upload, Image, Music, Video, Youtube, Loader2, Paperclip } from 'lucide-react';

interface MediaDropzoneProps {
  value: string;
  onChange: (newValue: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
}

export const MediaDropzone: React.FC<MediaDropzoneProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = 'Type clue markdown here, or drag & drop / paste media files...',
  rows = 5,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to insert text at current cursor position or append
  const insertTextAtCursor = (textToInsert: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const updated = value ? `${value}\n${textToInsert}` : textToInsert;
      onChange(updated);
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const before = value.substring(0, start);
    const after = value.substring(end);

    const separatorBefore = before && !before.endsWith('\n') ? '\n' : '';
    const separatorAfter = after && !after.startsWith('\n') ? '\n' : '';

    const newContent = `${before}${separatorBefore}${textToInsert}${separatorAfter}${after}`;
    onChange(newContent);

    // Reposition cursor after inserted text
    setTimeout(() => {
      const newPos = start + separatorBefore.length + textToInsert.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }, 50);
  };

  // Upload handler for multiple files
  const uploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const tagsToInsert: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadStatus(`Uploading ${file.name} (${i + 1}/${files.length})...`);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Upload failed with status ${res.status}`);
        }

        const data = await res.json();
        if (data.markdown_tag) {
          tagsToInsert.push(data.markdown_tag);
        }
      } catch (err) {
        console.error('File upload error:', err);
        setUploadStatus(`Error uploading ${file.name}`);
        setTimeout(() => setUploadStatus(null), 3000);
      }
    }

    if (tagsToInsert.length > 0) {
      insertTextAtCursor(tagsToInsert.join('\n'));
      setUploadStatus(`Uploaded ${tagsToInsert.length} media file(s)!`);
      setTimeout(() => setUploadStatus(null), 2500);
    }

    setIsUploading(false);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFiles(files);
    }
  };

  // Clipboard Paste handler (Ctrl+V)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const filesToUpload: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          filesToUpload.push(file);
        }
      }
    }

    if (filesToUpload.length > 0) {
      e.preventDefault();
      await uploadFiles(filesToUpload);
    }
    // If not a file, default text paste behavior occurs normally
  };

  // Quick insertion helpers
  const handleInsertYouTube = () => {
    const url = prompt('Enter YouTube Video URL (e.g. https://www.youtube.com/watch?v=...):');
    if (url && url.trim()) {
      insertTextAtCursor(`[youtube: ${url.trim()}]`);
    }
  };

  const handleInsertSampleAudio = () => {
    const url = prompt('Enter Audio URL or audio path (or upload your own file using the paperclip):');
    if (url && url.trim()) {
      insertTextAtCursor(`[audio: ${url.trim()}]`);
    }
  };

  const handleInsertSampleVideo = () => {
    const url = prompt('Enter Video URL or video path (.mp4, .webm):');
    if (url && url.trim()) {
      insertTextAtCursor(`[video: ${url.trim()}]`);
    }
  };

  return (
    <div
      className={`relative rounded-2xl border-2 transition-all ${
        isDragging
          ? 'border-pink-500 bg-pink-500/10 shadow-2xl scale-[1.01]'
          : 'border-slate-700 bg-slate-900/90'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,audio/*,video/*"
        onChange={(e) => {
          if (e.target.files) {
            uploadFiles(e.target.files);
          }
        }}
        className="hidden"
      />

      {/* Media Toolbar Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/60 rounded-t-2xl flex-wrap gap-2 text-xs font-mono">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1 px-2.5 py-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-lg font-bold transition-transform active:scale-95 shadow"
            title="Upload images, audios, or videos from your computer"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>Upload Media</span>
          </button>

          <button
            type="button"
            onClick={handleInsertYouTube}
            className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-lg transition-colors"
            title="Insert YouTube Embed"
          >
            <Youtube className="w-3.5 h-3.5 text-red-400" />
            <span>YouTube</span>
          </button>

          <button
            type="button"
            onClick={handleInsertSampleAudio}
            className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-lg transition-colors"
            title="Insert Audio Tag"
          >
            <Music className="w-3.5 h-3.5 text-blue-400" />
            <span>Audio</span>
          </button>

          <button
            type="button"
            onClick={handleInsertSampleVideo}
            className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-lg transition-colors"
            title="Insert Video Tag"
          >
            <Video className="w-3.5 h-3.5 text-amber-400" />
            <span>Video</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>Drag & Drop or Ctrl+V to Paste</span>
        </div>
      </div>

      {/* Textarea for Clue Markdown */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onPaste={handlePaste}
          placeholder={placeholder}
          className="w-full bg-transparent p-3 text-sm text-white font-mono leading-relaxed outline-none resize-y"
        />

        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm rounded-b-2xl border-2 border-dashed border-pink-400 text-pink-300 pointer-events-none animate-fade-in">
            <Upload className="w-10 h-10 mb-2 animate-bounce" />
            <span className="font-bold text-sm uppercase tracking-wider">
              Drop Images, Audio, or Video Files Here
            </span>
            <span className="text-xs text-slate-400 mt-1">
              Supports multiple files at the same time
            </span>
          </div>
        )}

        {/* Uploading Status Overlay */}
        {isUploading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm rounded-b-2xl text-amber-300 pointer-events-none">
            <Loader2 className="w-8 h-8 mb-2 animate-spin text-pink-400" />
            <span className="font-mono text-xs font-bold">{uploadStatus}</span>
          </div>
        )}
      </div>

      {/* Footer Feedback Status */}
      {uploadStatus && !isUploading && (
        <div className="px-3 py-1.5 bg-emerald-950/80 border-t border-emerald-500/50 text-emerald-300 text-xs font-mono flex items-center justify-between rounded-b-2xl">
          <span>{uploadStatus}</span>
        </div>
      )}
    </div>
  );
};

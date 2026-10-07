import React, { useState } from 'react';
import { AudioPlayer } from './AudioPlayer';
import { VideoPlayer } from './VideoPlayer';
import { Maximize2, X } from 'lucide-react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
  isHost?: boolean;
  onMediaControl?: (action: 'play' | 'pause' | 'seek', src: string, currentTime?: number) => void;
  mediaSyncState?: {
    action: string;
    media_src: string;
    current_time?: number;
    timestamp?: number;
  } | null;
}

interface ImageItem {
  alt: string;
  src: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  className = '',
  isHost = false,
  onMediaControl,
  mediaSyncState,
}) => {
  const [zoomedImage, setZoomedImage] = useState<ImageItem | null>(null);

  // Regex patterns
  const audioRegex = /\[audio:\s*([^\]]+)\]/gi;
  const videoRegex = /\[video:\s*([^\]]+)\]/gi;
  const youtubeRegex = /\[youtube:\s*([^\]]+)\]/gi;
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const codeBlockRegex = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;

  const getYoutubeEmbedUrl = (rawUrl: string): string | null => {
    try {
      const u = rawUrl.trim();
      const match = u.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      return match ? `https://www.youtube.com/embed/${match[1]}?enablejsapi=1` : null;
    } catch {
      return null;
    }
  };

  // Helper to parse a line/block for inline styles
  const formatInlineStyles = (raw: string): string => {
    return raw
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-800 text-amber-300 font-mono text-xs rounded border border-slate-700">$1</code>');
  };

  const renderContentBlock = (textBlock: string) => {
    const lines = textBlock.split('\n');
    const elements: React.ReactNode[] = [];
    let pendingImages: ImageItem[] = [];

    const flushImages = (keyPrefix: string) => {
      if (pendingImages.length === 0) return null;
      const imagesToRender = [...pendingImages];
      pendingImages = [];

      if (imagesToRender.length === 1) {
        const img = imagesToRender[0];
        return (
          <div key={`${keyPrefix}-single-img`} className="my-3 flex flex-col items-center group relative">
            <div className="relative inline-block max-w-full">
              <img
                src={img.src}
                alt={img.alt || 'Clue Media'}
                className="max-h-56 md:max-h-64 max-w-full rounded-2xl border-2 border-slate-700 shadow-xl object-contain mx-auto cursor-pointer hover:border-pink-500 transition-colors"
                onClick={() => setZoomedImage(img)}
              />
              <button
                type="button"
                onClick={() => setZoomedImage(img)}
                className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                title="Enlarge image"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            {img.alt && <span className="text-xs text-slate-400 mt-1 italic">{img.alt}</span>}
          </div>
        );
      }

      // Multiple images gallery grid
      const gridCols = imagesToRender.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';
      return (
        <div key={`${keyPrefix}-gallery`} className={`my-3 grid ${gridCols} gap-3 w-full max-w-2xl mx-auto`}>
          {imagesToRender.map((img, iIdx) => (
            <div key={iIdx} className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-900/60 shadow-lg">
              <img
                src={img.src}
                alt={img.alt || `Media ${iIdx + 1}`}
                className="h-36 sm:h-44 w-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
                onClick={() => setZoomedImage(img)}
              />
              <button
                type="button"
                onClick={() => setZoomedImage(img)}
                className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                title="Enlarge image"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              {img.alt && (
                <div className="p-1.5 bg-slate-950/80 text-[10px] text-slate-300 truncate text-center">
                  {img.alt}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    };

    let audioCount = 0;
    let videoCount = 0;

    for (let lIdx = 0; lIdx < lines.length; lIdx++) {
      let line = lines[lIdx];
      if (!line.trim()) {
        const flushed = flushImages(`line-${lIdx}`);
        if (flushed) elements.push(flushed);
        elements.push(<div key={`blank-${lIdx}`} className="h-2" />);
        continue;
      }

      // Check if line contains audio tag
      const audioMatch = audioRegex.exec(line);
      audioRegex.lastIndex = 0;
      if (audioMatch) {
        const flushed = flushImages(`audio-pre-${lIdx}`);
        if (flushed) elements.push(flushed);

        const url = audioMatch[1].trim();
        audioCount++;
        elements.push(
          <AudioPlayer
            key={`audio-${lIdx}`}
            src={url}
            title={`Audio Track ${audioCount}`}
            isHost={isHost}
            onMediaControl={onMediaControl}
            mediaSyncState={mediaSyncState}
          />
        );
        continue;
      }

      // Check if line contains YouTube tag
      const ytMatch = youtubeRegex.exec(line);
      youtubeRegex.lastIndex = 0;
      if (ytMatch) {
        const flushed = flushImages(`yt-pre-${lIdx}`);
        if (flushed) elements.push(flushed);

        const rawUrl = ytMatch[1].trim();
        const embed = getYoutubeEmbedUrl(rawUrl) || rawUrl;
        elements.push(
          <div key={`yt-${lIdx}`} className="my-3 flex justify-center w-full max-w-xl mx-auto">
            <iframe
              src={embed}
              title="YouTube Clue"
              className="w-full aspect-video rounded-2xl border-2 border-slate-700 shadow-2xl"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
        continue;
      }

      // Check if line contains Video tag
      const videoMatch = videoRegex.exec(line);
      videoRegex.lastIndex = 0;
      if (videoMatch) {
        const flushed = flushImages(`vid-pre-${lIdx}`);
        if (flushed) elements.push(flushed);

        const url = videoMatch[1].trim();
        const ytEmbed = getYoutubeEmbedUrl(url);
        if (ytEmbed) {
          elements.push(
            <div key={`vid-yt-${lIdx}`} className="my-3 flex justify-center w-full max-w-xl mx-auto">
              <iframe
                src={ytEmbed}
                title="Video Clue"
                className="w-full aspect-video rounded-2xl border-2 border-slate-700 shadow-2xl"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          );
        } else {
          videoCount++;
          elements.push(
            <VideoPlayer
              key={`vid-${lIdx}`}
              src={url}
              title={`Video Clip ${videoCount}`}
              isHost={isHost}
              onMediaControl={onMediaControl}
              mediaSyncState={mediaSyncState}
            />
          );
        }
        continue;
      }

      // Check for images on this line (supports multiple images on same line or consecutive lines)
      const lineImages: ImageItem[] = [];
      let imgMatch: RegExpExecArray | null;
      let cleanedLine = line;

      while ((imgMatch = imageRegex.exec(line)) !== null) {
        lineImages.push({
          alt: imgMatch[1],
          src: imgMatch[2],
        });
      }
      imageRegex.lastIndex = 0;

      if (lineImages.length > 0) {
        pendingImages.push(...lineImages);
        // Remove image tags from line to see if there is residual text
        cleanedLine = line.replace(imageRegex, '').trim();
        if (!cleanedLine) {
          continue;
        }
      }

      // If there is regular text (or text after image tags), flush pending images first
      const flushed = flushImages(`text-pre-${lIdx}`);
      if (flushed) elements.push(flushed);

      if (cleanedLine) {
        elements.push(
          <p
            key={`p-${lIdx}`}
            className="leading-relaxed text-slate-100"
            dangerouslySetInnerHTML={{ __html: formatInlineStyles(cleanedLine) }}
          />
        );
      }
    }

    const finalFlushed = flushImages('final');
    if (finalFlushed) elements.push(finalFlushed);

    return <div className="space-y-3">{elements}</div>;
  };

  // Split into code blocks and text blocks
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let codeMatch: RegExpExecArray | null;

  while ((codeMatch = codeBlockRegex.exec(content)) !== null) {
    if (codeMatch.index > lastIdx) {
      parts.push(
        <div key={`text-${lastIdx}`}>
          {renderContentBlock(content.substring(lastIdx, codeMatch.index))}
        </div>
      );
    }
    const lang = codeMatch[1] || 'code';
    const code = codeMatch[2];
    parts.push(
      <div key={`code-${codeMatch.index}`} className="my-3 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 font-mono text-xs shadow-xl">
        <div className="flex items-center justify-between bg-slate-900 px-3 py-1.5 text-[11px] text-slate-400 border-b border-slate-800">
          <span>{lang}</span>
        </div>
        <pre className="p-3 overflow-x-auto text-emerald-400 leading-normal">
          <code>{code}</code>
        </pre>
      </div>
    );
    lastIdx = codeMatch.index + codeMatch[0].length;
  }

  if (lastIdx < content.length) {
    parts.push(
      <div key={`text-${lastIdx}`}>
        {renderContentBlock(content.substring(lastIdx))}
      </div>
    );
  }

  return (
    <div className={`prose-invert text-slate-100 ${className}`}>
      {parts}

      {/* Image Lightbox Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute -top-12 right-0 p-2 text-white bg-slate-800/80 hover:bg-slate-700 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={zoomedImage.src}
              alt={zoomedImage.alt}
              className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl border-2 border-white/20"
            />
            {zoomedImage.alt && (
              <p className="mt-3 text-slate-300 font-mono text-xs text-center">
                {zoomedImage.alt}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

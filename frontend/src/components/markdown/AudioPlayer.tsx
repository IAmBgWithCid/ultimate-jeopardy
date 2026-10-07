import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, RotateCcw } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  isHost?: boolean;
  onMediaControl?: (action: 'play' | 'pause' | 'seek', src: string, currentTime?: number) => void;
  mediaSyncState?: {
    action: string;
    media_src: string;
    current_time?: number;
    timestamp?: number;
  } | null;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title = "Audio Clue",
  isHost = false,
  onMediaControl,
  mediaSyncState,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Helper to check if sync targets this audio
  const matchesSource = (targetSrc: string) => {
    if (!targetSrc) return true;
    const cleanTarget = targetSrc.split('?')[0].split('#')[0];
    const cleanSrc = src.split('?')[0].split('#')[0];
    return cleanTarget === cleanSrc || cleanSrc.endsWith(cleanTarget) || cleanTarget.endsWith(cleanSrc);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onPlayEvent = () => setIsPlaying(true);
    const onPauseEvent = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlayEvent);
    audio.addEventListener('pause', onPauseEvent);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlayEvent);
      audio.removeEventListener('pause', onPauseEvent);
    };
  }, []);

  // React to incoming media sync broadcasts
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !mediaSyncState) return;

    if (!matchesSource(mediaSyncState.media_src)) return;

    const action = mediaSyncState.action;
    const syncTime = mediaSyncState.current_time ?? 0;

    if (action === 'play') {
      if (Math.abs(audio.currentTime - syncTime) > 0.4) {
        audio.currentTime = syncTime;
      }
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch(() => {
          setAutoplayBlocked(true);
        });
    } else if (action === 'pause') {
      audio.pause();
      setIsPlaying(false);
    } else if (action === 'seek') {
      audio.currentTime = syncTime;
      setCurrentTime(syncTime);
    }
  }, [mediaSyncState]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (isHost && onMediaControl) {
        onMediaControl('pause', src, audio.currentTime);
      }
    } else {
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
          if (isHost && onMediaControl) {
            onMediaControl('play', src, audio.currentTime);
          }
        })
        .catch(() => {
          setAutoplayBlocked(true);
        });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
    if (isHost && onMediaControl) {
      onMediaControl('seek', src, time);
    }
  };

  const handleRestart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    if (isHost && onMediaControl) {
      onMediaControl('seek', src, 0);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="relative my-3 p-3.5 bg-slate-900 border border-slate-700 rounded-2xl shadow-xl flex flex-col gap-2 max-w-lg w-full mx-auto">
      <audio ref={audioRef} src={src} preload="metadata" />

      {autoplayBlocked && (
        <button
          type="button"
          onClick={togglePlay}
          className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded-xl font-mono text-xs font-bold shadow-lg animate-bounce flex items-center justify-center gap-1.5"
        >
          <Volume2 className="w-4 h-4" />
          <span>Host started audio — Tap to Play / Unmute</span>
        </button>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 shadow-md"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={handleRestart}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors flex-shrink-0"
          title="Restart from beginning"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
            <span className="font-semibold truncate flex items-center gap-1 text-slate-200">
              <Volume2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="truncate">{title}</span>
            </span>
            <span className="font-mono text-slate-400 flex-shrink-0 ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>

      {isHost && (
        <div className="flex justify-end text-[10px] font-mono text-amber-400 font-bold px-1">
          📡 Host Sync Active
        </div>
      )}
    </div>
  );
};

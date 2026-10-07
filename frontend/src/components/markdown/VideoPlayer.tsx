import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw } from 'lucide-react';

interface VideoPlayerProps {
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

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  title = "Video Clue",
  isHost = false,
  onMediaControl,
  mediaSyncState,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Helper to check if sync targets this video
  const matchesSource = (targetSrc: string) => {
    if (!targetSrc) return true;
    const cleanTarget = targetSrc.split('?')[0].split('#')[0];
    const cleanSrc = src.split('?')[0].split('#')[0];
    return cleanTarget === cleanSrc || cleanSrc.endsWith(cleanTarget) || cleanTarget.endsWith(cleanSrc);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onPlayEvent = () => setIsPlaying(true);
    const onPauseEvent = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);
    video.addEventListener('play', onPlayEvent);
    video.addEventListener('pause', onPauseEvent);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('play', onPlayEvent);
      video.removeEventListener('pause', onPauseEvent);
    };
  }, []);

  // React to incoming media sync broadcasts
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaSyncState) return;

    if (!matchesSource(mediaSyncState.media_src)) return;

    const action = mediaSyncState.action;
    const syncTime = mediaSyncState.current_time ?? 0;

    if (action === 'play') {
      if (Math.abs(video.currentTime - syncTime) > 0.4) {
        video.currentTime = syncTime;
      }
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch(() => {
          setAutoplayBlocked(true);
        });
    } else if (action === 'pause') {
      video.pause();
      setIsPlaying(false);
    } else if (action === 'seek') {
      video.currentTime = syncTime;
      setCurrentTime(syncTime);
    }
  }, [mediaSyncState]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      if (isHost && onMediaControl) {
        onMediaControl('pause', src, video.currentTime);
      }
    } else {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
          if (isHost && onMediaControl) {
            onMediaControl('play', src, video.currentTime);
          }
        })
        .catch(() => {
          setAutoplayBlocked(true);
        });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
    if (isHost && onMediaControl) {
      onMediaControl('seek', src, time);
    }
  };

  const handleRestart = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setCurrentTime(0);
    if (isHost && onMediaControl) {
      onMediaControl('seek', src, 0);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!document.fullscreenElement) {
      video.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="my-3 max-w-xl w-full mx-auto bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Video Container */}
      <div className="relative bg-black flex items-center justify-center group">
        <video
          ref={videoRef}
          src={src}
          preload="metadata"
          playsInline
          className="max-h-56 md:max-h-64 w-full object-contain cursor-pointer"
          onClick={togglePlay}
        />

        {/* Big play button overlay when paused */}
        {!isPlaying && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-pink-600/90 hover:bg-pink-500 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
            title="Play video"
          >
            <Play className="w-7 h-7 ml-1" />
          </button>
        )}

        {/* Autoplay unlock badge */}
        {autoplayBlocked && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded-full font-mono text-xs font-bold shadow-xl animate-bounce flex items-center gap-1.5 z-20"
          >
            <Volume2 className="w-4 h-4" />
            <span>Host playing video — Tap to Unmute / Play</span>
          </button>
        )}
      </div>

      {/* Control Bar */}
      <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-pink-600 hover:bg-pink-500 text-white flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 shadow"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Restart video from beginning"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>

          <span className="font-mono text-xs text-slate-400 flex-shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors flex-shrink-0"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors flex-shrink-0"
            title="Fullscreen"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono px-1">
          <span className="truncate">{title}</span>
          {isHost && (
            <span className="text-amber-400 font-bold text-[10px] uppercase tracking-wider">
              📡 Host Sync Active
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

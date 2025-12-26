import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Play, Pause, Square, Headphones, Waves } from 'lucide-react';
import { Language } from '../types';
import { BackgroundTts } from '../services/backgroundTts';

export interface TTSPlayerHandle {
  jumpToOffset: (absoluteOffset: number) => void;
}

interface TTSPlayerProps {
  text: string;
  topic: string;
  language: Language;
  isGenerating: boolean;
  onProgress?: (offset: number) => void;
}

const CHUNK_GRANULARITY = 700;
const describeError = (err: unknown) => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.length) return maybeMessage;
    const maybeError = (err as { error?: unknown }).error;
    if (typeof maybeError === 'string' && maybeError.length) return maybeError;
    try {
      const serialized = JSON.stringify(err);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      // ignore
    }
  }
  return '';
};

const TTSPlayer = forwardRef<TTSPlayerHandle, TTSPlayerProps>((props, ref) => {
  const { text, topic, language, isGenerating, onProgress } = props;
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [waitsForNextChunk, setWaitsForNextChunk] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isNativeAndroid =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const [nativeSupported, setNativeSupported] = useState(isNativeAndroid);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const latestTextRef = useRef(text);
  const offsetRef = useRef(0);
  const generatingRef = useRef(isGenerating);
  const mapperRef = useRef<number[]>([]);
  const nativeChunkRef = useRef<{
    utteranceId: string;
    start: number;
    chunkEnd: number;
    mapper: number[];
  } | null>(null);
  const nativeSessionIdRef = useRef('');
  const nativeListenersRef = useRef<PluginListenerHandle[]>([]);
  const nativeSpeakRef = useRef<(offset?: number) => void>(() => undefined);
  const nativeReadyRef = useRef(false);

  const speechSupported = isNativeAndroid
    ? nativeSupported
    : typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  const updateOffset = useCallback(
    (value: number) => {
      offsetRef.current = value;
      setCurrentOffset(value);
      onProgress?.(value);
    },
    [onProgress]
  );

  useEffect(() => {
    generatingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => {
    if (!isNativeAndroid) return;
    BackgroundTts.isSupported()
      .then(({ supported }) => setNativeSupported(Boolean(supported)))
      .catch(() => setNativeSupported(true));
  }, [isNativeAndroid]);

  useEffect(() => {
    if (!nativeSupported) {
      nativeReadyRef.current = false;
    }
  }, [nativeSupported]);

  const ensureNativeReady = useCallback(async () => {
    if (!isNativeAndroid) return true;
    if (nativeReadyRef.current && nativeSupported) return true;

    try {
      const { display } = await LocalNotifications.checkPermissions();
      if (display !== 'granted') {
        const request = await LocalNotifications.requestPermissions();
        if (request.display !== 'granted') {
          setError('Cần bật quyền thông báo để TTS nền hoạt động.');
          return false;
        }
      }
    } catch {
      // Ignore notification permission failures; TTS may still work on older Android.
    }

    try {
      const { supported } = await BackgroundTts.isSupported();
      setNativeSupported(Boolean(supported));
      if (!supported) {
        setError('Thiết bị chưa sẵn sàng cho TTS nền.');
        return false;
      }
    } catch (err) {
      const detail = describeError(err);
      setError(
        detail
          ? `Không thể khởi tạo TTS nền: ${detail}`
          : 'Không thể khởi tạo TTS nền. Vui lòng thử lại.'
      );
      return false;
    }

    nativeReadyRef.current = true;
    return true;
  }, [isNativeAndroid, nativeSupported]);

  const computeChunkEnd = useCallback((source: string, start: number) => {
    const maxEnd = Math.min(source.length, start + CHUNK_GRANULARITY);
    if (start >= maxEnd) return start;

    const slice = source.slice(start, maxEnd);
    const newlineIdx = slice.lastIndexOf('\n');
    if (newlineIdx > 80) {
      return start + newlineIdx + 1;
    }

    const punctuationRegex = /[.!?]\s/g;
    let punctuationIdx = -1;
    let match: RegExpExecArray | null;
    while ((match = punctuationRegex.exec(slice))) {
      punctuationIdx = match.index + match[0].length;
    }

    if (punctuationIdx > 120) {
      return start + punctuationIdx;
    }

    return maxEnd;
  }, []);

  const sanitizeChunkForSpeech = useCallback((chunk: string) => {
    const mapper: number[] = [];
    let spoken = "";
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];
      if (char === "*") continue;
      mapper.push(i);
      spoken += char;
    }
    return { spoken, mapper };
  }, []);

  const stopPlayback = useCallback(
    (resetOffset = true) => {
      if (isNativeAndroid) {
        BackgroundTts.stop().catch(() => undefined);
      } else if (speechSupported) {
        window.speechSynthesis.cancel();
      }
      utteranceRef.current = null;
      mapperRef.current = [];
      nativeChunkRef.current = null;
      nativeSessionIdRef.current = '';
      setIsPlaying(false);
      setIsPaused(false);
      setWaitsForNextChunk(false);
      setError(null);
      if (resetOffset) {
        updateOffset(0);
      }
    },
    [isNativeAndroid, speechSupported, updateOffset]
  );

  const speakFromOffsetWeb = useCallback(
    (maybeOffset?: number) => {
      if (!speechSupported) return;

      const source = latestTextRef.current;
      const start = Math.max(0, Math.min(maybeOffset ?? offsetRef.current, source.length));
      const remaining = source.slice(start);

      if (!remaining.trim().length) {
        updateOffset(start);
        if (generatingRef.current) {
          setWaitsForNextChunk(true);
        } else {
          setIsPlaying(false);
        }
        return;
      }

      const chunkEnd = computeChunkEnd(source, start);
      const chunkText = source.slice(start, chunkEnd);
      if (!chunkText.trim().length) {
        updateOffset(chunkEnd);
        speakFromOffsetWeb(chunkEnd);
        return;
      }

      const { spoken, mapper } = sanitizeChunkForSpeech(chunkText);
      if (!spoken.trim().length) {
        updateOffset(chunkEnd);
        speakFromOffsetWeb(chunkEnd);
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.rate = parseFloat(rate.toFixed(2));
      utterance.pitch = parseFloat(pitch.toFixed(2));
      utterance.lang = language === 'vi' ? 'vi-VN' : 'en-US';
      mapperRef.current = mapper;

      utterance.onboundary = (event) => {
        if (typeof event.charIndex === 'number') {
          const originalIndex = mapperRef.current[event.charIndex] ?? event.charIndex;
          updateOffset(start + originalIndex);
        }
      };

      utterance.onend = () => {
        const newOffset = start + chunkText.length;
        updateOffset(newOffset);
        utteranceRef.current = null;
        mapperRef.current = [];
        if (latestTextRef.current.length > newOffset + 5) {
          speakFromOffsetWeb(newOffset);
        } else if (generatingRef.current) {
          setWaitsForNextChunk(true);
        } else {
          setIsPlaying(false);
        }
      };

      utterance.onerror = (event) => {
        if ((event as SpeechSynthesisErrorEvent).error === 'canceled') {
          return;
        }
        setError('Lỗi phát sinh từ TTS hệ thống. Có thể cần làm mới.');
        utteranceRef.current = null;
        mapperRef.current = [];
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      updateOffset(start);
      setIsPlaying(true);
      setIsPaused(false);
      setWaitsForNextChunk(false);
      setError(null);
    },
    [computeChunkEnd, language, pitch, rate, sanitizeChunkForSpeech, speechSupported, updateOffset]
  );

  const speakFromOffsetNative = useCallback(
    async (maybeOffset?: number) => {
      if (!nativeSupported) return;
      const ready = await ensureNativeReady();
      if (!ready) {
        setIsPlaying(false);
        return;
      }

      const source = latestTextRef.current;
      const start = Math.max(0, Math.min(maybeOffset ?? offsetRef.current, source.length));
      const remaining = source.slice(start);

      if (!remaining.trim().length) {
        updateOffset(start);
        if (generatingRef.current) {
          setWaitsForNextChunk(true);
        } else {
          setIsPlaying(false);
        }
        return;
      }

      updateOffset(start);
      setIsPlaying(true);
      setIsPaused(false);
      setWaitsForNextChunk(false);
      setError(null);

      try {
        const sessionId = `rn_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        nativeSessionIdRef.current = sessionId;
        nativeChunkRef.current = null;
        await BackgroundTts.speak({
          text: source,
          rate: parseFloat(rate.toFixed(2)),
          pitch: parseFloat(pitch.toFixed(2)),
          language: language === 'vi' ? 'vi-VN' : 'en-US',
          utteranceId: sessionId,
          title: topic || 'Radio Nocturne',
          startOffset: start,
          continuous: true,
          sessionId,
        });
      } catch (err) {
        const detail = describeError(err);
        setError(
          detail
            ? `Không thể khởi chạy TTS nền: ${detail}`
            : 'Không thể khởi chạy TTS nền. Vui lòng thử lại.'
        );
        setIsPlaying(false);
      }
    },
    [
      ensureNativeReady,
      language,
      nativeSupported,
      pitch,
      rate,
      topic,
      updateOffset,
    ]
  );

  const speakFromOffset = useCallback(
    (maybeOffset?: number) => {
      if (isNativeAndroid) {
        void speakFromOffsetNative(maybeOffset);
        return;
      }
      speakFromOffsetWeb(maybeOffset);
    },
    [isNativeAndroid, speakFromOffsetNative, speakFromOffsetWeb]
  );

  useEffect(() => {
    latestTextRef.current = text;
    if (waitsForNextChunk && text.length > offsetRef.current) {
      setWaitsForNextChunk(false);
      if (isPlaying && !isPaused) {
        speakFromOffset(offsetRef.current);
      }
    }
  }, [text, waitsForNextChunk, isPlaying, isPaused, speakFromOffset]);

  useEffect(() => {
    nativeSpeakRef.current = (offset?: number) => {
      void speakFromOffsetNative(offset);
    };
  }, [speakFromOffsetNative]);

  useEffect(() => {
    if (!isNativeAndroid) return;

    const handles: PluginListenerHandle[] = [];
    BackgroundTts.addListener('ttsProgress', (event: any) => {
      const sessionId = typeof event?.sessionId === 'string' ? event.sessionId : '';
      if (sessionId && sessionId !== nativeSessionIdRef.current) return;
      if (typeof event.absoluteIndex === 'number') {
        updateOffset(event.absoluteIndex);
        return;
      }
      const current = nativeChunkRef.current;
      if (!current || current.utteranceId !== event.utteranceId) return;
      if (typeof event.charIndex === 'number') {
        const originalIndex = current.mapper[event.charIndex] ?? event.charIndex;
        updateOffset(current.start + originalIndex);
      }
    })
      .then((handle) => handles.push(handle))
      .catch(() => undefined);

    BackgroundTts.addListener('ttsDone', (event: any) => {
      const sessionId = typeof event?.sessionId === 'string' ? event.sessionId : '';
      if (sessionId && sessionId !== nativeSessionIdRef.current) return;
      if (typeof event?.nextOffset === 'number') {
        updateOffset(event.nextOffset);
      }
      if (typeof event?.isFinal === 'boolean') {
        if (event.isFinal) {
          const currentOffset = typeof event?.nextOffset === 'number' ? event.nextOffset : offsetRef.current;
          if (latestTextRef.current.length > currentOffset + 5) {
            nativeSpeakRef.current(currentOffset);
          } else if (generatingRef.current) {
            setWaitsForNextChunk(true);
          } else {
            setIsPlaying(false);
          }
        }
        return;
      }
      const current = nativeChunkRef.current;
      if (!current || current.utteranceId !== event.utteranceId) return;
      const newOffset = current.chunkEnd;
      updateOffset(newOffset);
      nativeChunkRef.current = null;
      if (latestTextRef.current.length > newOffset + 5) {
        nativeSpeakRef.current(newOffset);
      } else if (generatingRef.current) {
        setWaitsForNextChunk(true);
      } else {
        setIsPlaying(false);
      }
    })
      .then((handle) => handles.push(handle))
      .catch(() => undefined);

    BackgroundTts.addListener('ttsError', (event: any) => {
      const sessionId = typeof event?.sessionId === 'string' ? event.sessionId : '';
      if (sessionId && sessionId !== nativeSessionIdRef.current) return;
      const message =
        typeof event?.error === 'string' && event.error.length
          ? `TTS nền gặp lỗi: ${event.error}`
          : 'TTS nền gặp lỗi. Vui lòng thử lại.';
      setError(message);
      setIsPlaying(false);
      nativeChunkRef.current = null;
    })
      .then((handle) => handles.push(handle))
      .catch(() => undefined);

    nativeListenersRef.current = handles;

    return () => {
      nativeListenersRef.current.forEach((handle) => handle.remove());
      nativeListenersRef.current = [];
      BackgroundTts.shutdown().catch(() => undefined);
    };
  }, [isNativeAndroid, updateOffset]);

  const handlePlay = useCallback(() => {
    if (!speechSupported || !latestTextRef.current.trim().length) return;

    if (!isNativeAndroid) {
      if (isPaused && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
        setIsPlaying(true);
        return;
      }
    }

    speakFromOffset(offsetRef.current);
  }, [isNativeAndroid, isPaused, speakFromOffset, speechSupported]);

  const handlePause = useCallback(() => {
    if (!speechSupported) return;
    if (isNativeAndroid) {
      BackgroundTts.stop().catch(() => undefined);
      setIsPlaying(false);
      setIsPaused(true);
      return;
    }
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, [isNativeAndroid, speechSupported]);
  
  const handleTogglePlayPause = useCallback(() => {
    if (isPlaying && !isPaused) {
      handlePause();
    } else {
      handlePlay();
    }
  }, [isPlaying, isPaused, handlePause, handlePlay]);

  const handleStop = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  useImperativeHandle(
    ref,
    () => ({
      jumpToOffset: (absoluteOffset: number) => {
        if (!speechSupported) return;
        updateOffset(absoluteOffset);
        speakFromOffset(absoluteOffset);
      },
    }),
    [speechSupported, speakFromOffset, updateOffset]
  );

  useEffect(() => {
    if (!text.length) {
      stopPlayback();
    }
  }, [text, stopPlayback]);

  useEffect(() => {
    // This effect can cause issues if it re-triggers speech unnecessarily.
    // It's currently disabled, but was likely for re-starting speech on param change.
    // A better approach would be to only re-speak if parameters change *during* playback.
    // if (isPlaying && !isPaused) {
    //   speakFromOffset(offsetRef.current);
    // }
  }, [rate, pitch]);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const mediaSession = (navigator as any).mediaSession;
    const MediaMetadataCtor = (window as any).MediaMetadata;
    if (!mediaSession || !MediaMetadataCtor) return;

    try {
      mediaSession.metadata = new MediaMetadataCtor({
        title: topic || 'Radio Nocturne',
        artist: 'Morgan Hayes',
        album: 'Live Transmission',
      });

      mediaSession.setActionHandler('play', handlePlay);
      mediaSession.setActionHandler('pause', handlePause);
      mediaSession.setActionHandler('stop', handleStop);
    } catch {
      // Some browsers throw if Media Session API unsupported
    }
  }, [topic, handlePlay, handlePause, handleStop]);

  useEffect(() => {
    return () => {
      stopPlayback(false);
    };
  }, [stopPlayback]);

  if (!speechSupported) {
    const message = isNativeAndroid
      ? 'Thiết bị chưa sẵn sàng cho TTS nền.'
      : 'Trình duyệt này không hỗ trợ TTS hệ thống.';
    return (
      <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-500">
        <p>{message}</p>
      </div>
    );
  }

  const progress = text.length === 0 ? 0 : Math.min(100, (currentOffset / text.length) * 100);

  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-2 text-zinc-300 text-sm font-mono">
          <Headphones size={16} className="text-red-500" />
          <span>LIVE TTS PLAYER</span>
        </div>
        {waitsForNextChunk && (
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500">
            <Waves className="animate-pulse" size={14} />
            <span>Chờ tín hiệu tiếp theo...</span>
          </div>
        )}
      </div>

      <div className="px-4 py-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleTogglePlayPause}
            className="p-3 rounded-full bg-red-700 hover:bg-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!text.length}
            title={isPlaying && !isPaused ? 'Tạm dừng' : 'Phát'}
          >
            {isPlaying && !isPaused ? (
              <Pause size={18} className="text-white" />
            ) : (
              <Play size={18} className="text-white" />
            )}
          </button>
          <button
            onClick={handleStop}
            disabled={!isPlaying && !isPaused}
            className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40"
            title="Dừng"
          >
            <Square size={18} />
          </button>

          <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1 text-zinc-400">
            Tốc độ ({rate.toFixed(2)}x)
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full accent-red-600"
            />
          </label>

          <label className="flex flex-col gap-1 text-zinc-400">
            Cao độ ({pitch.toFixed(2)})
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="w-full accent-red-600"
            />
          </label>
        </div>

        <p className="text-[11px] uppercase tracking-widest text-zinc-500">
          Nhấn đúp bất kỳ đoạn nào trong bản ghi để nhảy tới vị trí đó.
        </p>

        {error && (
          <div className="text-xs text-red-400 bg-red-900/30 border border-red-900/40 px-3 py-2 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
});

TTSPlayer.displayName = 'TTSPlayer';

export default TTSPlayer;

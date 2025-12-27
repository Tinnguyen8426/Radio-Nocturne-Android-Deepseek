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
import { Play, Pause, Headphones, Waves, SlidersHorizontal, X, SkipBack, SkipForward } from 'lucide-react';
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
  storyKey: number;
  startFromOffset?: number;
  onProgress?: (offset: number) => void;
}

const CHUNK_GRANULARITY = 420;
const NOW_PLAYING_ACTION = 'tts-controls';
const NOW_PLAYING_NOTIFICATION_ID = 4242;
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
  const { text, topic, language, isGenerating, storyKey, startFromOffset = 0, onProgress } = props;
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [waitsForNextChunk, setWaitsForNextChunk] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showTuning, setShowTuning] = useState(false);

  const isNativeAndroid =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const [nativeSupported, setNativeSupported] = useState(isNativeAndroid);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const latestTextRef = useRef(text);
  const lastTextLengthRef = useRef(text.length);
  const offsetRef = useRef(0);
  const generatingRef = useRef(isGenerating);
  const prevGeneratingRef = useRef(isGenerating);
  const mapperRef = useRef<number[]>([]);
  const nativeChunkRef = useRef<{
    utteranceId: string;
    start: number;
    chunkEnd: number;
    mapper: number[];
  } | null>(null);
  const nativeSpeakingRef = useRef(false);
  const nativeSessionIdRef = useRef('');
  const nativeListenersRef = useRef<PluginListenerHandle[]>([]);
  const nativeSpeakRef = useRef<(offset?: number) => void>(() => undefined);
  const nativeReadyRef = useRef(false);
  const externalStartRef = useRef(startFromOffset);
  const notificationActionRef = useRef<PluginListenerHandle | null>(null);

  const speechSupported = isNativeAndroid
    ? nativeSupported
    : typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  const clearNowPlayingNotification = useCallback(() => {
    if (!isNativeAndroid) return;
    LocalNotifications.cancel({ notifications: [{ id: NOW_PLAYING_NOTIFICATION_ID }] }).catch(() => undefined);
  }, [isNativeAndroid]);

  const pushNowPlayingNotification = useCallback(
    async (status: 'playing' | 'paused') => {
      if (!isNativeAndroid) return;
      try {
        await LocalNotifications.registerActionTypes({
          types: [
            {
              id: NOW_PLAYING_ACTION,
              actions: [
                { id: 'tts_play', title: 'Tiếp tục' },
                { id: 'tts_pause', title: 'Tạm dừng' },
              ],
            },
          ],
        });
      } catch {
        // Ignore registration issues
      }

      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: NOW_PLAYING_NOTIFICATION_ID,
              title: topic || 'Radio Nocturne',
              body: status === 'playing' ? 'Đang phát truyện...' : 'Đã tạm dừng phát.',
              ongoing: true,
              actionTypeId: NOW_PLAYING_ACTION,
            },
          ],
        });
      } catch {
        // Ignore scheduling errors
      }
    },
    [isNativeAndroid, topic]
  );

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

    const nextNewline = source.indexOf('\n', start);
    if (nextNewline >= 0 && nextNewline + 1 <= maxEnd) {
      return nextNewline + 1;
    }

    const slice = source.slice(start, maxEnd);
    const punctuationRegex = /[.!?]\s/g;
    let punctuationIdx = -1;
    let match: RegExpExecArray | null;
    while ((match = punctuationRegex.exec(slice))) {
      punctuationIdx = match.index + match[0].length;
    }

    if (punctuationIdx > 80) {
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
      nativeSpeakingRef.current = false;
      nativeSessionIdRef.current = '';
      setIsPlaying(false);
      setIsPaused(false);
      setWaitsForNextChunk(false);
      setError(null);
      clearNowPlayingNotification();
      if (resetOffset) {
        updateOffset(0);
      }
    },
    [clearNowPlayingNotification, isNativeAndroid, speechSupported, updateOffset]
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
          setIsPlaying(true);
          setIsPaused(false);
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
          setIsPlaying(true);
          setIsPaused(false);
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
        nativeSpeakingRef.current = true;
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
        nativeSpeakingRef.current = false;
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
    const startedGenerating = isGenerating && !prevGeneratingRef.current;
    prevGeneratingRef.current = isGenerating;

    if (!startedGenerating) return;
    if (!speechSupported) return;

    // Auto-arm playback so the first chunks stream without extra taps
    setIsPaused(false);
    setIsPlaying(true);
    if (latestTextRef.current.trim().length) {
      speakFromOffset(offsetRef.current);
    } else {
      setWaitsForNextChunk(true);
    }
  }, [isGenerating, speechSupported, speakFromOffset]);

  useEffect(() => {
    latestTextRef.current = text;
    const hasNewContent = text.length > lastTextLengthRef.current;
    const wasWaitingForChunk = waitsForNextChunk && hasNewContent;
    const noActiveSpeech = isNativeAndroid ? !nativeSpeakingRef.current : !utteranceRef.current;
    
    // Check if we're near the end of current text and should continue with new content
    const currentTextLength = latestTextRef.current.length;
    const isNearEnd = currentTextLength > 0 && offsetRef.current >= Math.max(0, currentTextLength - 100);

    if (wasWaitingForChunk) {
      setWaitsForNextChunk(false);
    }

    // During generation, ensure TTS continues when new content arrives
    if (generatingRef.current && !isPaused && hasNewContent) {
      // If not playing at all, start playing
      if (!isPlaying) {
        setIsPlaying(true);
        speakFromOffset(offsetRef.current);
      }
      // If waiting for next chunk, continue
      else if (wasWaitingForChunk) {
        speakFromOffset(offsetRef.current);
      }
      // If no active speech (finished speaking), continue
      else if (noActiveSpeech) {
        speakFromOffset(offsetRef.current);
      }
      // If near end of current text, continue with new content
      else if (isNearEnd) {
        speakFromOffset(offsetRef.current);
      }
    }

    lastTextLengthRef.current = text.length;
  }, [
    isNativeAndroid,
    isPaused,
    isPlaying,
    speakFromOffset,
    speakFromOffsetNative,
    text,
    waitsForNextChunk,
  ]);

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
      nativeSpeakingRef.current = false;
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
      nativeSpeakingRef.current = false;
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
      nativeSpeakingRef.current = false;
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

  useEffect(() => {
    if (!isNativeAndroid) return;
    if (!isPlaying && !isPaused) {
      clearNowPlayingNotification();
      return;
    }
    pushNowPlayingNotification(isPaused ? 'paused' : 'playing');
  }, [clearNowPlayingNotification, isNativeAndroid, isPaused, isPlaying, pushNowPlayingNotification]);

  const handlePlay = useCallback(() => {
    if (!speechSupported) return;

    if (!latestTextRef.current.trim().length) {
      if (generatingRef.current) {
        setIsPaused(false);
        setIsPlaying(true);
        setWaitsForNextChunk(true);
        speakFromOffset(0);
      }
      return;
    }

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
      nativeSpeakingRef.current = false;
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

  useEffect(() => {
    if (!isNativeAndroid) return;
    LocalNotifications.requestPermissions().catch(() => undefined);
    LocalNotifications.registerActionTypes({
      types: [
        {
          id: NOW_PLAYING_ACTION,
          actions: [
            { id: 'tts_play', title: 'Tiếp tục' },
            { id: 'tts_pause', title: 'Tạm dừng' },
          ],
        },
      ],
    }).catch(() => undefined);

    LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      if (event?.notification?.id !== NOW_PLAYING_NOTIFICATION_ID) return;
      if (event.actionId === 'tts_pause') {
        handlePause();
      }
      if (event.actionId === 'tts_play') {
        handlePlay();
      }
    })
      .then((handle) => {
        notificationActionRef.current = handle;
      })
      .catch(() => undefined);

    return () => {
      notificationActionRef.current?.remove();
      notificationActionRef.current = null;
    };
  }, [handlePause, handlePlay, isNativeAndroid]);

  const handleStop = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const formatTime = useCallback((offset: number) => {
    // Estimate time based on reading speed (assuming ~150 words per minute)
    const words = text.slice(0, offset).split(/\s+/).filter(Boolean).length;
    const minutes = Math.floor(words / 150);
    const seconds = Math.floor((words % 150) / 2.5);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [text]);

  const handleSkipBackward = useCallback(() => {
    const skipAmount = 100; // ~10 seconds worth of text
    const newOffset = Math.max(0, offsetRef.current - skipAmount);
    updateOffset(newOffset);
    speakFromOffset(newOffset);
  }, [speakFromOffset, updateOffset]);

  const handleSkipForward = useCallback(() => {
    const skipAmount = 100; // ~10 seconds worth of text
    const newOffset = Math.min(text.length, offsetRef.current + skipAmount);
    updateOffset(newOffset);
    speakFromOffset(newOffset);
  }, [text.length, speakFromOffset, updateOffset]);

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
    latestTextRef.current = text;
  }, [text]);

  useEffect(() => {
    latestTextRef.current = text;
    lastTextLengthRef.current = text.length;
    const normalized = Math.max(0, Math.min(startFromOffset, text.length));
    externalStartRef.current = normalized;

    if (!text.length) {
      stopPlayback();
      return;
    }

    updateOffset(normalized);
    if (isNativeAndroid) {
      BackgroundTts.stop().catch(() => undefined);
      nativeSpeakingRef.current = false;
    } else if (speechSupported) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setWaitsForNextChunk(false);
  }, [
    isNativeAndroid,
    speechSupported,
    startFromOffset,
    stopPlayback,
    storyKey,
    updateOffset,
  ]);

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
    <div className="pointer-events-auto w-full bg-zinc-950/95 backdrop-blur-md border border-zinc-900 rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-zinc-400 font-mono">
          <Headphones size={14} className="text-red-500" />
          <span>TTS</span>
          {waitsForNextChunk && (
            <span className="flex items-center gap-1 text-red-400 text-[10px]">
              <Waves className="animate-pulse" size={14} />
              <span>{language === 'vi' ? 'Tự động nối tiếp' : 'Auto-continue'}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleTogglePlayPause}
            className="p-3 rounded-full bg-red-700 hover:bg-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
            disabled={!text.length && !isGenerating}
            title={isPlaying && !isPaused ? (language === 'vi' ? 'Tạm dừng' : 'Pause') : (language === 'vi' ? 'Phát' : 'Play')}
          >
            {isPlaying && !isPaused ? (
              <Pause size={20} className="text-white" />
            ) : (
              <Play size={20} className="text-white ml-0.5" />
            )}
          </button>
          <button
            onClick={() => setShowTuning((prev) => !prev)}
            className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition"
            title={language === 'vi' ? 'Điều chỉnh tốc độ & cao độ' : 'Adjust speed & pitch'}
          >
            {showTuning ? <X size={18} /> : <SlidersHorizontal size={18} />}
          </button>
        </div>
      </div>

      <div className="px-4 pb-4">
        {/* Timeline Scrubber */}
        <div className="mb-3">
          <input
            type="range"
            min="0"
            max={text.length || 1}
            value={currentOffset}
            onChange={(e) => {
              const newOffset = Number(e.target.value);
              updateOffset(newOffset);
              speakFromOffset(newOffset);
            }}
            className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
            style={{
              background: `linear-gradient(to right, rgb(220, 38, 38) 0%, rgb(220, 38, 38) ${progress}%, rgb(39, 39, 42) ${progress}%, rgb(39, 39, 42) 100%)`
            }}
            disabled={!text.length}
          />
        </div>

        {/* Time and Controls */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSkipBackward}
              disabled={!text.length || currentOffset === 0}
              className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title={language === 'vi' ? 'Lùi 10 giây' : 'Rewind 10s'}
            >
              <SkipBack size={16} className="text-zinc-300" />
            </button>
            <span className="text-[11px] text-zinc-500 font-mono min-w-[45px]">
              {text.length > 0 ? formatTime(currentOffset) : '0:00'}
            </span>
          </div>
          
          <div className="flex-1 text-center">
            <span className="text-[11px] text-zinc-500 font-mono">{progress.toFixed(0)}%</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500 font-mono min-w-[45px] text-right">
              {text.length > 0 ? formatTime(text.length) : '0:00'}
            </span>
            <button
              onClick={handleSkipForward}
              disabled={!text.length || currentOffset >= text.length}
              className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title={language === 'vi' ? 'Tới 10 giây' : 'Forward 10s'}
            >
              <SkipForward size={16} className="text-zinc-300" />
            </button>
          </div>
        </div>

        {showTuning && (
          <div className="mt-4 flex flex-col gap-4">
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

            <div className="flex items-center justify-between text-[11px] text-zinc-500 uppercase tracking-wide">
              <span>Nhấn đúp đoạn văn để nhảy tới vị trí đó</span>
              <button
                onClick={handleStop}
                disabled={!isPlaying && !isPaused}
                className="px-3 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40"
                title="Dừng phát"
              >
                Dừng phát
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs text-red-400 bg-red-900/30 border border-red-900/40 px-3 py-2 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
});

TTSPlayer.displayName = 'TTSPlayer';

export default TTSPlayer;

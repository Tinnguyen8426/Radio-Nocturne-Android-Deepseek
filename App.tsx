import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { streamStoryWithControls } from './services/deepseekService';
import { StoryStatus, GenerationState, GENRE_PROMPTS, Language, StoryRecord } from './types';
import StoryDisplay from './components/StoryDisplay';
import TTSPlayer, { TTSPlayerHandle } from './components/TTSPlayer';
import StoryLibrary from './components/StoryLibrary';
import { Radio, AlertCircle, Dices } from 'lucide-react';
import {
  clearApiKey,
  getStoredApiKey,
  hasFallbackApiKey,
  setApiKey,
} from './services/apiKeyStore';
import {
  initStoryStore,
  listStories,
  saveStory,
  setStoryFavorite,
} from './services/storyStore';
import { BackgroundStory } from './services/backgroundStory';
import { BackgroundTts } from './services/backgroundTts';
import {
  getAllowBackgroundGeneration,
  setAllowBackgroundGeneration,
} from './services/settingsStore';

// UI Translation Dictionary
const TRANSLATIONS = {
  vi: {
    subtitle: "Tần số: 03:00 Sáng // Host: Morgan Hayes",
    labelSubject: "Chủ đề / Hướng truyện",
    placeholderInput: "Nhập chủ đề hoặc gợi ý hướng truyện... (để trống để Morgan Hayes tự quyết)",
    randomBtnTitle: "Gợi ý ngẫu nhiên",
    broadcast: "Phát sóng",
    stop: "Dừng phát",
    resume: "Tiếp tục phát",
    tuning: "Đang dò...",
    suggested: "TẦN SỐ GỢI Ý:",
    autoTopicHint: "Có thể nhập chủ đề hoặc gợi ý hướng truyện. Để trống nếu muốn Morgan Hayes tự đúc theo thể loại mặc định.",
    autoTopicLabel: "Morgan Hayes tự chọn hướng truyện",
    footerCaution: "CẢNH BÁO: NỘI DUNG CÓ THỂ GÂY HOANG MANG TỘT ĐỘ.",
    error: "Mất kết nối. Tín hiệu chìm vào nhiễu sóng...",
    paused: "Đã dừng. Tín hiệu đang treo ở giữa bóng tối...",
    apiKeyLabel: "DeepSeek API Key",
    apiKeyPlaceholder: "Nhập API key để dùng trực tiếp trong app...",
    apiKeySave: "Lưu key",
    apiKeyClear: "Xoá",
    apiKeyStored: "Đã lưu trên thiết bị.",
    apiKeyFallback: "Đang dùng API key cấu hình sẵn.",
    apiKeyMissing: "Chưa có API key.",
    navHome: "Trang chủ",
    navLibrary: "Kho truyện",
    navSettings: "Cài đặt",
    settingsTitle: "Thiết lập thiết bị",
    backgroundLabel: "Cho phép tạo truyện nền",
    backgroundHint: "Bật để app tiếp tục tạo truyện khi bạn chuyển sang ứng dụng khác.",
    backgroundUnavailable: "Thiết bị chưa hỗ trợ chạy nền.",
    backgroundGenerating: "Đang tạo truyện...",
    ttsSettings: "Cài đặt giọng đọc",
    ttsSettingsHint: "Chọn giọng đọc của Google hoặc hệ thống.",
    ttsInstall: "Cài dữ liệu TTS",
  },
  en: {
    subtitle: "Frequency: 03:00 AM // Host: Morgan Hayes",
    labelSubject: "Subject / Story Direction",
    placeholderInput: "Enter a topic or story direction... (leave blank for Morgan to improvise)",
    randomBtnTitle: "Random Prompt",
    broadcast: "Broadcast",
    stop: "Stop",
    resume: "Resume",
    tuning: "Tuning...",
    suggested: "SUGGESTED FREQUENCIES:",
    autoTopicHint: "Enter a topic or story direction. Leave empty to let Morgan Hayes invent one automatically.",
    autoTopicLabel: "Morgan Hayes chooses the direction",
    footerCaution: "CAUTION: LISTENING MAY CAUSE EXISTENTIAL DREAD.",
    error: "Connection lost. The signal faded into the static...",
    paused: "Paused. The signal is suspended in the dark...",
    apiKeyLabel: "DeepSeek API Key",
    apiKeyPlaceholder: "Paste your API key to use it in-app...",
    apiKeySave: "Save key",
    apiKeyClear: "Clear",
    apiKeyStored: "Stored on this device.",
    apiKeyFallback: "Using the bundled API key.",
    apiKeyMissing: "No API key set.",
    navHome: "Home",
    navLibrary: "Library",
    navSettings: "Settings",
    settingsTitle: "Device Settings",
    backgroundLabel: "Allow background generation",
    backgroundHint: "Keep generating stories while you switch to other apps.",
    backgroundUnavailable: "Background mode is unavailable.",
    backgroundGenerating: "Generating story...",
    ttsSettings: "TTS Settings",
    ttsSettingsHint: "Choose Google or system voice.",
    ttsInstall: "Install TTS data",
  }
};

const THEMED_RANDOM_TOPICS: Record<Language, string[]> = {
  vi: [
    "Bản kê đồ thất lạc của chuyến tàu điện ngầm không có trên bản đồ",
    "Nhật ký của người thuê căn hộ 12B và cái cửa thứ hai trong phòng tắm",
    "Đơn khiếu nại về người hàng xóm luôn trả lời trước khi tôi hỏi",
    "Tờ rơi cảnh báo về một quán tạp hoá chỉ mở lúc 03:00 và không bán đồ ăn",
    "Biên bản của bảo vệ toà nhà: tầng hầm xuất hiện thêm một lối đi mỗi đêm mưa",
    "Thư tay tìm thấy trong hộp thư: “Đừng nhìn thẳng vào gương thang máy”",
    "Hồ sơ người mất tích: tất cả đều biến mất sau khi gọi vào một số máy lạ",
    "Bản ghi lời khai về một con hẻm đổi chỗ sau mỗi lần tôi quay đầu",
    "Tờ giấy biên nhận thuê phòng trọ ghi sai năm—và tôi bắt đầu sống theo năm đó",
    "Danh sách cư dân bị xoá khỏi sổ hộ khẩu của một khu phố chưa từng tồn tại",
  ],
  en: [
    "Lost-and-found manifest from a subway line not on any map",
    "Diary of a tenant in Apartment 12B and the second door inside the bathroom",
    "Complaint letter about a neighbor who answers before I speak",
    "Warning flyer about a convenience store that opens only at 3 AM and sells nothing edible",
    "Security log: a new corridor appears in the basement every rainy night",
    "Handwritten mail found in my box: “Don’t stare into the elevator mirror”",
    "Missing persons dossier: they all vanished after calling the same unlisted number",
    "Witness statement about an alley that swaps places whenever I look away",
    "Receipt for a rented room dated with the wrong year—and I start living that year",
    "Resident registry pages torn out from a neighborhood that “never existed”",
  ],
};

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>('vi');
  const t = TRANSLATIONS[language];

  const [state, setState] = useState<GenerationState>({
    status: StoryStatus.IDLE,
    text: '',
    topic: '',
  });
  const [activeTab, setActiveTab] = useState<'home' | 'library' | 'settings'>('home');
  const [topicInput, setTopicInput] = useState('');
  const storyCacheRef = useRef<Map<string, { text: string }>>(new Map());
  const ttsRef = useRef<TTSPlayerHandle>(null);
  const [ttsOffset, setTtsOffset] = useState(0);
  const generationControllerRef = useRef<AbortController | null>(null);
  const generationIdRef = useRef(0);
  const lastTopicRef = useRef('');
  const lastUsingAutoTopicRef = useRef(false);
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<'stored' | 'fallback' | 'missing'>('missing');
  const lastSavedKeyRef = useRef('');
  const [allowBackground, setAllowBackground] = useState(true);
  const [backgroundSupported, setBackgroundSupported] = useState(false);
  const isNativeAndroid =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  useEffect(() => {
    setTopicInput('');
    storyCacheRef.current.clear();
    console.log("Language changed, cache cleared.");
  }, [language]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        await initStoryStore();
        const [storedStories, storedKey, backgroundAllowed] = await Promise.all([
          listStories(),
          getStoredApiKey(),
          getAllowBackgroundGeneration(),
        ]);
        if (!alive) return;
        setStories(storedStories);
        setAllowBackground(backgroundAllowed);
        if (storedKey) {
          setApiKeyInput(storedKey);
          setApiKeyStatus('stored');
        } else if (hasFallbackApiKey()) {
          setApiKeyStatus('fallback');
        } else {
          setApiKeyStatus('missing');
        }
      } catch (error) {
        console.error("Init storage failed:", error);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!state.text) {
      setTtsOffset(0);
    }
  }, [state.text]);

  useEffect(() => {
    if (!isNativeAndroid) return;
    BackgroundStory.isSupported()
      .then(({ supported }) => setBackgroundSupported(Boolean(supported)))
      .catch(() => setBackgroundSupported(true));
  }, [isNativeAndroid]);

  const handleGenerate = async () => {
    setActiveStoryId(null);
    const trimmedTopic = topicInput.trim();
    const usingAutoTopic = trimmedTopic.length === 0;
    const displayTopic = usingAutoTopic ? t.autoTopicLabel : trimmedTopic;
    const cacheKey = usingAutoTopic ? null : `${language}:${trimmedTopic}`;
    lastTopicRef.current = trimmedTopic;
    lastUsingAutoTopicRef.current = usingAutoTopic;

    setState({
      status: StoryStatus.GENERATING,
      text: '',
      error: undefined,
      topic: displayTopic,
    });

    if (cacheKey && storyCacheRef.current.has(cacheKey)) {
      const cached = storyCacheRef.current.get(cacheKey)!;
      console.log("Cache hit for topic:", trimmedTopic);
      setState({
        status: StoryStatus.COMPLETE,
        text: cached.text,
        topic: displayTopic,
        error: undefined,
      });
      return;
    }

    const requestId = ++generationIdRef.current;
    const controller = new AbortController();
    generationControllerRef.current = controller;

    try {
      let fullText = '';
      await streamStoryWithControls(
        trimmedTopic,
        language,
        (chunk) => {
          if (requestId !== generationIdRef.current) return;
          fullText += chunk;
          setState(prev => ({ ...prev, text: prev.text + chunk }));
        },
        { signal: controller.signal }
      );

      if (cacheKey) {
        storyCacheRef.current.set(cacheKey, { text: fullText });
        console.log("Cached new story for topic:", trimmedTopic);
      }

      if (requestId !== generationIdRef.current) return;
      setState(prev => ({ ...prev, status: StoryStatus.COMPLETE }));
    } catch (error) {
      if (requestId !== generationIdRef.current) return;
      if (error instanceof Error && error.name === 'AbortError') {
        setState(prev => ({
          ...prev,
          status: StoryStatus.PAUSED,
          error: undefined,
        }));
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      setState(prev => ({
        ...prev,
        status: StoryStatus.ERROR,
        error: detail || t.error,
      }));
    } finally {
      if (requestId === generationIdRef.current) {
        generationControllerRef.current = null;
      }
    }
  };

  const handleStopBroadcast = () => {
    if (state.status !== StoryStatus.GENERATING) return;
    generationControllerRef.current?.abort();
  };

  const handleResumeBroadcast = async () => {
    if (state.status !== StoryStatus.PAUSED) return;
    if (!state.text.trim().length) return;

    setActiveStoryId(null);
    const trimmedTopic = lastTopicRef.current;
    const usingAutoTopic = lastUsingAutoTopicRef.current;
    const displayTopic = usingAutoTopic ? t.autoTopicLabel : trimmedTopic;
    const cacheKey = usingAutoTopic ? null : `${language}:${trimmedTopic}`;
    const requestId = ++generationIdRef.current;
    const controller = new AbortController();
    generationControllerRef.current = controller;

    const initialText = state.text;

    setState(prev => ({
      ...prev,
      status: StoryStatus.GENERATING,
      topic: displayTopic,
      error: undefined,
    }));

    try {
      let fullText = initialText;
      await streamStoryWithControls(
        trimmedTopic,
        language,
        (chunk) => {
          if (requestId !== generationIdRef.current) return;
          fullText += chunk;
          setState(prev => ({ ...prev, text: prev.text + chunk }));
        },
        { signal: controller.signal, existingText: initialText }
      );

      if (requestId !== generationIdRef.current) return;
      if (cacheKey) {
        storyCacheRef.current.set(cacheKey, { text: fullText });
        console.log("Cached new story for topic:", trimmedTopic);
      }

      setState(prev => ({ ...prev, status: StoryStatus.COMPLETE }));
    } catch (error) {
      if (requestId !== generationIdRef.current) return;
      if (error instanceof Error && error.name === 'AbortError') {
        setState(prev => ({
          ...prev,
          status: StoryStatus.PAUSED,
          error: undefined,
        }));
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      setState(prev => ({
        ...prev,
        status: StoryStatus.ERROR,
        error: detail || t.error,
      }));
    } finally {
      if (requestId === generationIdRef.current) {
        generationControllerRef.current = null;
      }
    }
  };

  const handleRandomTopic = () => {
    if (state.status === StoryStatus.GENERATING) return;
    const candidates = THEMED_RANDOM_TOPICS[language];
    if (!candidates.length) return;
    const selection = candidates[Math.floor(Math.random() * candidates.length)];
    setTopicInput(selection);
  };

  useEffect(() => {
    if (state.status !== StoryStatus.COMPLETE) return;
    if (!state.text.trim().length) return;
    if (activeStoryId) return;
    const saveKey = `${language}:${state.topic}:${state.text.length}`;
    if (lastSavedKeyRef.current === saveKey) return;
    lastSavedKeyRef.current = saveKey;
    saveStory({
      topic: state.topic,
      language,
      text: state.text,
    })
      .then((record) => setStories((prev) => [record, ...prev]))
      .catch((error) => console.error("Failed to save story:", error));
  }, [state.status, state.text, state.topic, language, activeStoryId]);

  const handleSelectStory = (story: StoryRecord) => {
    generationControllerRef.current?.abort();
    generationIdRef.current += 1;
    setActiveStoryId(story.id);
    setActiveTab('home');
    setTopicInput(story.topic);
    setState({
      status: StoryStatus.COMPLETE,
      text: story.text,
      topic: story.topic,
      error: undefined,
    });
    setTtsOffset(0);
  };

  const handleToggleFavorite = async (story: StoryRecord) => {
    const next = !story.isFavorite;
    try {
      await setStoryFavorite(story.id, next);
      setStories((prev) =>
        prev.map((item) => (item.id === story.id ? { ...item, isFavorite: next } : item))
      );
    } catch (error) {
      console.error("Failed to update favorite:", error);
    }
  };

  const handleSaveApiKey = async () => {
    try {
      await setApiKey(apiKeyInput);
      if (apiKeyInput.trim().length) {
        setApiKeyStatus('stored');
      } else if (hasFallbackApiKey()) {
        setApiKeyStatus('fallback');
      } else {
        setApiKeyStatus('missing');
      }
    } catch (error) {
      console.error("Failed to save API key:", error);
    }
  };

  const handleClearApiKey = async () => {
    try {
      await clearApiKey();
      setApiKeyInput('');
      setApiKeyStatus(hasFallbackApiKey() ? 'fallback' : 'missing');
    } catch (error) {
      console.error("Failed to clear API key:", error);
    }
  };

  const handleToggleBackground = async () => {
    const next = !allowBackground;
    setAllowBackground(next);
    try {
      await setAllowBackgroundGeneration(next);
      if (next && isNativeAndroid) {
        await LocalNotifications.requestPermissions();
      }
    } catch (error) {
      console.error("Failed to update background setting:", error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 md:px-8 bg-black text-gray-200 selection:bg-red-900 selection:text-white">
      <header className="mb-12 text-center relative group cursor-default w-full max-w-6xl mx-auto flex flex-col items-center">
        <div className="absolute top-0 right-0 md:top-4 md:right-0 z-50">
           <div className="bg-zinc-900 border border-zinc-800 rounded-full p-1 flex items-center shadow-lg">
             <button onClick={() => setLanguage('vi')} className={`px-3 py-1 text-xs font-mono rounded-full transition-all ${language === 'vi' ? 'bg-red-900 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>VN</button>
             <button onClick={() => setLanguage('en')} className={`px-3 py-1 text-xs font-mono rounded-full transition-all ${language === 'en' ? 'bg-red-900 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>EN</button>
           </div>
        </div>
        <div className="absolute -inset-1 bg-gradient-to-r from-red-900 to-purple-900 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
        <div className="relative">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter noir-text text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-600 mb-2">RADIO NOCTURNE</h1>
          <p className="text-red-500 font-mono text-sm tracking-[0.3em] uppercase flicker">{t.subtitle}</p>
        </div>
      </header>

      <div className="w-full max-w-4xl mx-auto flex flex-col items-start mb-6">
        <nav className="w-full flex flex-wrap gap-2 bg-zinc-950 border border-zinc-800 rounded-full p-2 shadow-lg">
          {([
            { id: 'home', label: t.navHome },
            { id: 'library', label: t.navLibrary },
            { id: 'settings', label: t.navSettings },
          ] as const).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 min-w-[100px] px-4 py-2 rounded-full font-mono text-xs uppercase tracking-widest transition ${
                activeTab === item.id
                  ? 'bg-red-700 text-white shadow-lg shadow-red-900/40'
                  : 'bg-transparent text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 items-start mb-8">
        {activeTab === 'home' && (
          <>
            <div className="w-full bg-zinc-900 border border-zinc-800 p-6 rounded-lg shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-20"><Radio size={48} /></div>
              <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">{t.labelSubject}</label>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <button onClick={handleRandomTopic} disabled={state.status === StoryStatus.GENERATING} className="px-4 bg-zinc-800 border border-zinc-700 rounded-md hover:bg-zinc-700 hover:text-red-400 transition-colors text-zinc-400 disabled:opacity-50 shrink-0" title={t.randomBtnTitle}>
                    <Dices size={20} />
                  </button>
                  <input type="text" value={topicInput} onChange={(e) => setTopicInput(e.target.value)} placeholder={t.placeholderInput} className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 text-zinc-100 p-3 rounded-md focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-900 transition-all font-mono placeholder-zinc-700 text-sm" disabled={state.status === StoryStatus.GENERATING} onKeyDown={(e) => e.key === 'Enter' && handleGenerate()} />
                </div>
                <p className="text-[11px] font-mono uppercase tracking-wide text-zinc-500">{t.autoTopicHint}</p>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={handleGenerate}
                    disabled={state.status === StoryStatus.GENERATING}
                    className={`flex-1 py-3 rounded font-bold uppercase text-sm tracking-wider transition-all ${
                      state.status === StoryStatus.GENERATING
                        ? 'bg-zinc-800 text-zinc-500 cursor-wait'
                        : 'bg-red-700 hover:bg-red-600 text-white shadow-lg hover:shadow-red-900/50'
                    }`}
                  >
                    {state.status === StoryStatus.GENERATING ? t.tuning : t.broadcast}
                  </button>
                  {state.status === StoryStatus.GENERATING && (
                    <button
                      onClick={handleStopBroadcast}
                      className="px-4 py-3 rounded font-bold uppercase text-sm tracking-wider transition-all bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                    >
                      {t.stop}
                    </button>
                  )}
                  {state.status === StoryStatus.PAUSED && (
                    <button
                      onClick={handleResumeBroadcast}
                      className="px-4 py-3 rounded font-bold uppercase text-sm tracking-wider transition-all bg-red-700 hover:bg-red-600 text-white shadow-lg hover:shadow-red-900/50"
                    >
                      {t.resume}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-[10px] text-zinc-600 mb-2 font-mono uppercase tracking-wide">{t.suggested}</p>
                <div className="flex flex-wrap gap-2">
                  {GENRE_PROMPTS[language].map((prompt) => (<button key={prompt} onClick={() => setTopicInput(prompt)} className="px-2 py-1 bg-zinc-950 border border-zinc-800 text-zinc-400 text-[10px] hover:border-red-900 hover:text-red-400 transition-colors">{prompt}</button>))}
                </div>
              </div>
            </div>
            
            <StoryDisplay 
              text={state.text} 
              isGenerating={state.status === StoryStatus.GENERATING} 
              topic={state.topic} 
              language={language}
              currentOffset={ttsOffset}
              onJumpRequest={(offset) => ttsRef.current?.jumpToOffset(offset)}
            />

            <TTSPlayer 
              ref={ttsRef}
              text={state.text}
              topic={state.topic}
              language={language}
              isGenerating={state.status === StoryStatus.GENERATING}
              onProgress={setTtsOffset}
            />

            {state.status === StoryStatus.PAUSED && (
              <div className="w-full mt-4 p-3 bg-zinc-950/40 border border-zinc-800 rounded flex items-center gap-2 text-zinc-300 text-xs">
                <AlertCircle size={16} />
                {t.paused}
              </div>
            )}
            {state.status === StoryStatus.ERROR && (
              <div className="w-full mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle size={16} />
                {state.error}
              </div>
            )}
          </>
        )}

        {activeTab === 'library' && (
          <StoryLibrary
            stories={stories}
            language={language}
            onSelect={handleSelectStory}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'settings' && (
          <>
            <div className="w-full bg-zinc-900 border border-zinc-800 p-6 rounded-lg shadow-xl relative overflow-hidden">
              <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">
                {t.apiKeyLabel}
              </label>
              <div className="flex flex-col gap-3">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={t.apiKeyPlaceholder}
                  className="w-full bg-zinc-950 border border-zinc-700 text-zinc-100 p-3 rounded-md focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-900 transition-all font-mono placeholder-zinc-700 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveApiKey}
                    className="px-4 py-2 rounded font-bold uppercase text-xs tracking-wider transition-all bg-red-700 hover:bg-red-600 text-white shadow-lg hover:shadow-red-900/50"
                  >
                    {t.apiKeySave}
                  </button>
                  <button
                    onClick={handleClearApiKey}
                    className="px-4 py-2 rounded font-bold uppercase text-xs tracking-wider transition-all bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                  >
                    {t.apiKeyClear}
                  </button>
                </div>
                <p className="text-[11px] font-mono uppercase tracking-wide text-zinc-500">
                  {apiKeyStatus === 'stored'
                    ? t.apiKeyStored
                    : apiKeyStatus === 'fallback'
                      ? t.apiKeyFallback
                      : t.apiKeyMissing}
                </p>
              </div>
            </div>

            <div className="w-full bg-zinc-900 border border-zinc-800 p-6 rounded-lg shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wide text-zinc-500">{t.settingsTitle}</p>
                  <p className="text-sm text-zinc-200 mt-2">{t.backgroundLabel}</p>
                  <p className="text-xs text-zinc-500 mt-1">{t.backgroundHint}</p>
                  {isNativeAndroid && !backgroundSupported && (
                    <p className="text-xs text-red-400 mt-2">{t.backgroundUnavailable}</p>
                  )}
                </div>
                <button
                  onClick={handleToggleBackground}
                  disabled={!backgroundSupported || !isNativeAndroid}
                  className={`relative w-16 h-9 rounded-full border transition shrink-0 ${
                    allowBackground ? 'bg-red-700 border-red-600' : 'bg-zinc-800 border-zinc-700'
                  } ${!backgroundSupported || !isNativeAndroid ? 'opacity-40 cursor-not-allowed' : ''}`}
                  aria-pressed={allowBackground}
                >
                  <span
                    className={`absolute top-1 left-1 h-7 w-7 rounded-full bg-zinc-100 shadow-md transition-transform ${
                      allowBackground ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="w-full bg-zinc-900 border border-zinc-800 p-6 rounded-lg shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wide text-zinc-500">{t.ttsSettings}</p>
                  <p className="text-xs text-zinc-500 mt-2">{t.ttsSettingsHint}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => BackgroundTts.openTtsSettings().catch(() => undefined)}
                    className="px-3 py-2 rounded font-bold uppercase text-[10px] tracking-wider transition-all bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
                  >
                    {t.ttsSettings}
                  </button>
                  <button
                    onClick={() => BackgroundTts.installTtsData().catch(() => undefined)}
                    className="px-3 py-2 rounded font-bold uppercase text-[10px] tracking-wider transition-all bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
                  >
                    {t.ttsInstall}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      <footer className="mt-16 text-zinc-700 text-xs font-mono text-center">
        <p>{t.footerCaution}</p>
        <p className="mt-2 opacity-50">Powered by DeepSeek</p>
      </footer>
    </div>
  );
};

export default App;

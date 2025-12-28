import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { generateTopicBatch, generateStoryTitle, OUTRO_SIGNATURE, streamStoryWithControls, clearGenerationHistory, completeStoryWithOutro } from './services/deepseekService';
import { StoryStatus, GenerationState, GENRE_PROMPTS, Language, StoryRecord } from './types';
import StoryDisplay from './components/StoryDisplay';
import TTSPlayer, { TTSPlayerHandle } from './components/TTSPlayer';
import StoryLibrary from './components/StoryLibrary';
import PauseDialog from './components/PauseDialog';
import { AlertCircle, ChevronDown, Dices, Loader2, Radio } from 'lucide-react';
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
  updateStoryProgress,
} from './services/storyStore';
import { BackgroundStory } from './services/backgroundStory';
import { BackgroundTts } from './services/backgroundTts';
import {
  DEFAULT_STORY_PERSONALIZATION,
  getTtsPitch,
  getTtsRate,
  getAllowBackgroundGeneration,
  initSettingsStore,
  getStoryPersonalization,
  getStoryModel,
  getStoryTemperature,
  TARGET_MAX_OFFSET,
  TARGET_MAX_WORDS,
  TARGET_MIN_OFFSET,
  TARGET_MIN_WORDS,
  setAllowBackgroundGeneration,
  setTtsPitch as persistTtsPitch,
  setTtsRate as persistTtsRate,
  getReuseStoryCache,
  setStoryPersonalization,
  setReuseStoryCache,
  setStoryModel,
  setStoryTemperature as persistStoryTemperature,
} from './services/settingsStore';
import type { NarrativeStyle, StoryModel, StoryPersonalization } from './services/settingsStore';

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
    reuseCacheLabel: "Dùng cache chống trùng lặp",
    reuseCacheHint: "Dùng truyện đã tạo làm điểm tựa để tránh lặp ý tưởng và motif.",
    storyModelLabel: "Model tạo truyện",
    storyModelHint: "Chọn model dùng cho phần tạo truyện.",
    storyModelReasoner: "deepseek-reasoner (logic, chặt chẽ)",
    storyModelChat: "deepseek-chat (linh hoạt, giàu cảm xúc)",
    backgroundGenerating: "Đang tạo truyện...",
    personalizationTitle: "Cá nhân hóa nội dung",
    personalizationHint: "Tùy chỉnh mức rùng rợn, phong cách kể và độ dài mục tiêu.",
    horrorLabel: "Độ rùng rợn/siêu nhiên",
    horrorHint: "0 = tinh tế, 100 = siêu nhiên dồn dập.",
    styleLabel: "Phong cách kể",
    styleHint: "Chọn phong cách tường thuật ưu tiên.",
    lengthLabel: "Độ dài mục tiêu",
    lengthHint: "Dải hiện tại:",
    wordsLabel: "từ",
    actualLengthLabel: "độ dài thực tế",
    styleDefault: "Mặc định (Morgan Hayes)",
    styleConfession: "Lời thú tội",
    styleDossier: "Hồ sơ / tài liệu tổng hợp",
    styleDiary: "Nhật ký cá nhân",
    styleInvestigation: "Điều tra / báo cáo hiện trường",
    horrorLow: "Tinh tế",
    horrorMedium: "Cân bằng",
    horrorHigh: "Dồn dập",
    ttsSettings: "Cài đặt giọng đọc",
    ttsSettingsHint: "Chọn giọng đọc của Google hoặc hệ thống.",
    ttsInstall: "Cài dữ liệu TTS",
    temperatureLabel: "Nhiệt độ tạo truyện (Temperature)",
    temperatureHint: "Điều chỉnh độ sáng tạo và ngẫu nhiên. Thấp = nhất quán hơn, Cao = đa dạng hơn.",
    temperatureLow: "Thấp (0.1)",
    temperatureHigh: "Cao (2.0)",
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
    reuseCacheLabel: "Avoid repetition with cache",
    reuseCacheHint: "Use cached stories as anchors so new stories avoid duplicating them.",
    storyModelLabel: "Story model",
    storyModelHint: "Choose the model used for story generation.",
    storyModelReasoner: "deepseek-reasoner (structured)",
    storyModelChat: "deepseek-chat (expressive)",
    backgroundGenerating: "Generating story...",
    personalizationTitle: "Story Personalization",
    personalizationHint: "Tune intensity, narrative style, and target length.",
    horrorLabel: "Horror/Supernatural Intensity",
    horrorHint: "0 = subtle, 100 = relentless supernatural.",
    styleLabel: "Narrative Style",
    styleHint: "Choose a preferred narration style.",
    lengthLabel: "Target Length",
    lengthHint: "Current range:",
    wordsLabel: "words",
    actualLengthLabel: "actual length",
    styleDefault: "Default (Morgan Hayes)",
    styleConfession: "Confession",
    styleDossier: "Dossier / compiled evidence",
    styleDiary: "Personal diary",
    styleInvestigation: "Investigation report",
    horrorLow: "Subtle",
    horrorMedium: "Balanced",
    horrorHigh: "Relentless",
    ttsSettings: "TTS Settings",
    ttsSettingsHint: "Choose Google or system voice.",
    ttsInstall: "Install TTS data",
    temperatureLabel: "Story Generation Temperature",
    temperatureHint: "Adjust creativity and randomness. Low = more consistent, High = more diverse.",
    temperatureLow: "Low (0.1)",
    temperatureHigh: "High (2.0)",
  }
};

const normalizeOutroSignature = (text: string) => {
  if (!text) return text;
  const lastIndex = text.lastIndexOf(OUTRO_SIGNATURE);
  if (lastIndex === -1) return text;
  const before = text.slice(0, lastIndex);
  const cleanedBefore = before.split(OUTRO_SIGNATURE).join('');
  return cleanedBefore + OUTRO_SIGNATURE;
};

const THEMED_RANDOM_TOPICS: Record<Language, string[]> = {
  vi: [
    "Bản kê đồ thất lạc của chuyến tàu điện ngầm không có trên bản đồ",
    "Nhật ký của người thuê căn hộ 12B và cái cửa thứ hai trong phòng tắm",
    "Đơn khiếu nại về người hàng xóm luôn trả lời trước khi tôi hỏi",
    "Tờ rơi cảnh báo về một quán tạp hoá chỉ mở lúc 03:00 và không bán đồ ăn",
    "Biên bản của bảo vệ toà nhà: tầng hầm xuất hiện thêm một lối đi mỗi đêm mưa",
    "Thư tay tìm thấy trong hộp thư: \"Đừng nhìn thẳng vào gương thang máy\"",
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
    "Handwritten mail found in my box: \"Don’t stare into the elevator mirror\"",
    "Missing persons dossier: they all vanished after calling the same unlisted number",
    "Witness statement about an alley that swaps places whenever I look away",
    "Receipt for a rented room dated with the wrong year—and I start living that year",
    "Resident registry pages torn out from a neighborhood that \"never existed\"",
  ],
};

const CACHE_ANCHOR_LIMIT = 4;
const CACHE_SNIPPET_LINES = 3;
const CACHE_SNIPPET_MAX_CHARS = 240;
const INTRO_SENTENCE_MIN = 12;

const toStoryLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const extractCacheSnippet = (text: string) => {
  const lines = toStoryLines(text).filter((line) => line !== OUTRO_SIGNATURE);
  if (!lines.length) return '';
  const startIndex =
    lines.length > INTRO_SENTENCE_MIN
      ? INTRO_SENTENCE_MIN
      : Math.max(0, lines.length - CACHE_SNIPPET_LINES);
  const snippet = lines.slice(startIndex, startIndex + CACHE_SNIPPET_LINES).join(' ');
  const compact = snippet.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > CACHE_SNIPPET_MAX_CHARS
    ? `${compact.slice(0, CACHE_SNIPPET_MAX_CHARS)}...`
    : compact;
};

const extractStoryElements = (text: string) => {
  const lines = toStoryLines(text).filter((line) => line !== OUTRO_SIGNATURE);
  if (!lines.length) return { protagonist: '', setting: '', anomaly: '', motif: '' };
  
  const fullText = lines.join(' ').toLowerCase();
  
  // Detect protagonist (common patterns)
  const protagonistPatterns = [
    /tôi là (\w+\s*\w*)/i,
    /tôi tên là (\w+\s*\w*)/i,
    /tôi, (\w+\s*\w*),/i,
  ];
  
  let protagonist = '';
  for (const pattern of protagonistPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      protagonist = match[1];
      break;
    }
  }
  
  // Detect setting (common locations)
  const settingKeywords = [
    'căn hộ', 'chung cư', 'apartment', 'tòa nhà', 'building',
    'bệnh viện', 'hospital', 'trạm y tế', 'clinic',
    'trường học', 'school', 'giáo dục', 'university',
    'công ty', 'office', 'văn phòng', 'workplace',
    'siêu thị', 'mall', 'cửa hàng', 'store',
    'nhà ga', 'station', 'xe buýt', 'bus',
    'khu dân cư', 'neighborhood', 'khu phố', 'street'
  ];
  
  let setting = '';
  for (const keyword of settingKeywords) {
    if (fullText.includes(keyword)) {
      setting = keyword;
      break;
    }
  }
  
  // Detect anomaly (supernatural/unusual elements)
  const anomalyKeywords = [
    'cánh cửa', 'door', 'cửa biến mất', 'missing door',
    'tiếng vọng', 'echo', 'âm thanh lạ', 'strange sound',
    'bóng đen', 'dark shadow', 'cái bóng', 'shadow',
    'ký hiệu', 'symbol', 'dấu hiệu', 'sign',
    'lặp lại', 'repeating', 'lặp đi lặp lại', 'loop',
    'ký ức', 'memory', 'quên', 'forget',
    'thực tại', 'reality', 'không thực', 'unreal',
    'giấc mơ', 'dream', 'mơ', 'dreaming'
  ];
  
  let anomaly = '';
  for (const keyword of anomalyKeywords) {
    if (fullText.includes(keyword)) {
      anomaly = keyword;
      break;
    }
  }
  
  // Detect motif (recurring patterns)
  const motifKeywords = [
    'danh sách', 'list', 'tên', 'names',
    'chìa khóa', 'key', 'mở', 'unlock',
    'thư', 'letter', 'email', 'message',
    'ảnh', 'photo', 'hình ảnh', 'picture',
    'số', 'number', 'con số', 'counting',
    'đồng hồ', 'clock', 'thời gian', 'time',
    'gương', 'mirror', 'phản chiếu', 'reflection'
  ];
  
  let motif = '';
  for (const keyword of motifKeywords) {
    if (fullText.includes(keyword)) {
      motif = keyword;
      break;
    }
  }
  
  return { protagonist, setting, anomaly, motif };
};

const buildCacheAnchors = (
  records: StoryRecord[],
  language: Language,
  autoTopicLabel: string
) => {
  const sorted = [...records]
    .filter((story) => story.language === language && story.text.trim().length)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const anchors: string[] = [];
  const seen = new Set<string>();

  for (const story of sorted) {
    if (anchors.length >= CACHE_ANCHOR_LIMIT) break;
    const topic = story.topic.trim();
    const safeTopic = topic && topic !== autoTopicLabel ? topic : '';
    const snippet = extractCacheSnippet(story.text);
    const elements = extractStoryElements(story.text);
    
    const anchorParts = [
      safeTopic ? `Topic: "${safeTopic}"` : '',
      snippet ? `Snippet: "${snippet}"` : '',
      elements.protagonist ? `Protagonist: "${elements.protagonist}"` : '',
      elements.setting ? `Setting: "${elements.setting}"` : '',
      elements.anomaly ? `Anomaly: "${elements.anomaly}"` : '',
      elements.motif ? `Motif: "${elements.motif}"` : ''
    ].filter(Boolean);
    
    const anchor = anchorParts.join(' | ').trim();
    if (!anchor || seen.has(anchor)) continue;
    seen.add(anchor);
    anchors.push(anchor);
  }

  return anchors;
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
  const ttsRef = useRef<TTSPlayerHandle>(null);
  const [ttsOffset, setTtsOffset] = useState(0);
  const [startFromOffset, setStartFromOffset] = useState(0);
  const [ttsStoryKey, setTtsStoryKey] = useState(0);
  const generationControllerRef = useRef<AbortController | null>(null);
  const generationIdRef = useRef(0);
  const lastTopicRef = useRef('');
  const lastUsingAutoTopicRef = useRef(false);
  const generationSeedRef = useRef('');
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<'stored' | 'fallback' | 'missing'>('missing');
  const lastSavedKeyRef = useRef('');
  const [allowBackground, setAllowBackground] = useState(true);
  const [backgroundSupported, setBackgroundSupported] = useState(false);
  const [reuseCache, setReuseCache] = useState(false);
  const [storyModel, setStoryModelState] = useState<StoryModel>('deepseek-reasoner');
  const [storyTemperature, setStoryTemperature] = useState(1.5);
  const [personalization, setPersonalization] = useState<StoryPersonalization>(
    DEFAULT_STORY_PERSONALIZATION
  );
  const [ttsRate, setTtsRateState] = useState(1);
  const [ttsPitch, setTtsPitchState] = useState(1);
  const settingsLoadedRef = useRef(false);
  const [thoughtStream, setThoughtStream] = useState('');
  const [randomizingTopic, setRandomizingTopic] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pausedStoryTitle, setPausedStoryTitle] = useState('');
  const aiTopicCacheRef = useRef<string[]>([]);
  const isNativeAndroid =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const targetMinWords = TARGET_MIN_WORDS;
  const targetMaxWords = TARGET_MAX_WORDS;
  const targetWords = Math.min(targetMaxWords, Math.max(targetMinWords, personalization.targetWords));
  const derivedMinWords = Math.min(
    targetMaxWords,
    Math.max(targetMinWords, targetWords - TARGET_MIN_OFFSET)
  );
  const derivedHardMaxWords = Math.max(
    derivedMinWords,
    Math.min(targetMaxWords, Math.max(targetMinWords, targetWords + TARGET_MAX_OFFSET))
  );
  const horrorLabel =
    personalization.horrorLevel <= 30
      ? t.horrorLow
      : personalization.horrorLevel <= 70
        ? t.horrorMedium
        : t.horrorHigh;
  const narrativeOptions: Array<{ value: NarrativeStyle; label: string }> = [
    { value: 'default', label: t.styleDefault },
    { value: 'confession', label: t.styleConfession },
    { value: 'dossier', label: t.styleDossier },
    { value: 'diary', label: t.styleDiary },
    { value: 'investigation', label: t.styleInvestigation },
  ];

  useEffect(() => {
    setTopicInput('');
    aiTopicCacheRef.current = [];
    console.log("Language changed, cache cleared.");
  }, [language]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        await Promise.all([initStoryStore(), initSettingsStore()]);
        const [
          storedStories,
          storedKey,
          backgroundAllowed,
          storedPersonalization,
          storedReuseCache,
          storedStoryModel,
          storedTemperature,
          storedTtsRate,
          storedTtsPitch,
        ] = await Promise.all([
          listStories(),
          getStoredApiKey(),
          getAllowBackgroundGeneration(),
          getStoryPersonalization(),
          getReuseStoryCache(),
          getStoryModel(),
          getStoryTemperature(),
          getTtsRate(),
          getTtsPitch(),
        ]);
        if (!alive) return;
        setStories(storedStories);
        setAllowBackground(backgroundAllowed);
        setPersonalization(storedPersonalization);
        setReuseCache(storedReuseCache);
        setStoryModelState(storedStoryModel);
        setStoryTemperature(storedTemperature);
        setTtsRateState(storedTtsRate);
        setTtsPitchState(storedTtsPitch);
        settingsLoadedRef.current = true;
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
    if (settingsLoadedRef.current) {
      persistTtsRate(ttsRate).catch((error) => {
        console.error('Failed to persist TTS rate:', error);
      });
    }
  }, [ttsRate]);

  useEffect(() => {
    if (settingsLoadedRef.current) {
      persistTtsPitch(ttsPitch).catch((error) => {
        console.error('Failed to persist TTS pitch:', error);
      });
    }
  }, [ttsPitch]);

  useEffect(() => {
    if (state.text.length > 0 && thoughtStream) {
      setThoughtStream('');
    }
  }, [state.text, thoughtStream]);

  useEffect(() => {
    if (!isNativeAndroid) return;
    BackgroundStory.isSupported()
      .then(({ supported }) => setBackgroundSupported(Boolean(supported)))
      .catch(() => setBackgroundSupported(true));
  }, [isNativeAndroid]);

  const updatePersonalization = (next: Partial<StoryPersonalization>) => {
    setPersonalization((prev) => {
      const targetWords =
        typeof next.targetWords === 'number'
          ? Math.min(targetMaxWords, Math.max(targetMinWords, next.targetWords))
          : prev.targetWords;
      const merged = {
        ...prev,
        ...next,
        targetWords,
      };
      setStoryPersonalization(merged).catch((error) => {
        console.error("Failed to save personalization:", error);
      });
      return merged;
    });
  };

  const handleGenerate = async () => {
    setActiveStoryId(null);
    setStartFromOffset(0);
    setTtsStoryKey((key) => key + 1);
    setTtsOffset(0);
    setThoughtStream('');
    
    // Clean up previous generation request
    if (generationControllerRef.current) {
      generationControllerRef.current.abort();
      generationControllerRef.current = null;
    }
    
    // Reset all refs for new story generation
    lastSavedKeyRef.current = '';
    generationIdRef.current += 1; // Ensure new request ID
    
    const trimmedTopic = topicInput.trim();
    const usingAutoTopic = trimmedTopic.length === 0;
    const displayTopic = usingAutoTopic ? t.autoTopicLabel : trimmedTopic;
    const generationSeed = `${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
    generationSeedRef.current = generationSeed;
    const cacheAnchors = reuseCache
      ? buildCacheAnchors(stories, language, t.autoTopicLabel)
      : [];
    lastTopicRef.current = trimmedTopic;
    lastUsingAutoTopicRef.current = usingAutoTopic;

    setState({
      status: StoryStatus.GENERATING,
      text: '',
      error: undefined,
      topic: displayTopic,
    });

    const requestId = generationIdRef.current;
    const controller = new AbortController();
    generationControllerRef.current = controller;

    try {
      let fullText = '';
      let hasStoryText = false;
      await streamStoryWithControls(
        trimmedTopic,
        language,
        (chunk) => {
          if (requestId !== generationIdRef.current) return;
          if (!hasStoryText && chunk.trim().length > 0) {
            hasStoryText = true;
            setThoughtStream(''); // Clear thinking view only when first actual text arrives
          }
          fullText += chunk;
          setState(prev => ({ ...prev, text: prev.text + chunk }));
        },
        {
          signal: controller.signal,
          seed: generationSeed,
          cacheAnchors,
          onReasoningChunk: (reasoning) => {
            if (requestId !== generationIdRef.current) return;
            // Only update thought stream if we haven't started receiving story text for THIS pass
            if (!hasStoryText) {
              setThoughtStream((prev) => (prev + reasoning).slice(-4000));
            }
          },
        }
      );

      fullText = normalizeOutroSignature(fullText);

      if (requestId !== generationIdRef.current) return;
      setState(prev => ({ ...prev, status: StoryStatus.COMPLETE, text: fullText }));
    } catch (error) {
      if (requestId !== generationIdRef.current) return;
      if (error instanceof Error && error.name === 'AbortError') {
        setThoughtStream('');
        setState(prev => ({
          ...prev,
          status: StoryStatus.PAUSED,
          error: undefined,
        }));
        return;
      }
      setThoughtStream('');
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
    setThoughtStream('');
    // Tạo tiêu đề trước khi dừng
    if (state.text.trim().length > 0) {
      generateStoryTitle(language, lastTopicRef.current, state.text)
        .then(title => {
          setPausedStoryTitle(title || state.topic);
        })
        .catch(() => {
          setPausedStoryTitle(state.topic);
        });
    } else {
      setPausedStoryTitle(state.topic);
    }
    setShowPauseDialog(true);
    generationControllerRef.current?.abort();
    
    // Cleanup history to prevent memory leak
    clearGenerationHistory();
  };

  const handleResumeBroadcast = async () => {
    if (state.status !== StoryStatus.PAUSED) return;
    if (!state.text.trim().length) return;

    setActiveStoryId(null);
    setThoughtStream('');
    
    // Clean up previous generation request
    if (generationControllerRef.current) {
      generationControllerRef.current.abort();
      generationControllerRef.current = null;
    }
    
    // Increment request ID for this resume attempt
    generationIdRef.current += 1;
    
    const trimmedTopic = lastTopicRef.current;
    const usingAutoTopic = lastUsingAutoTopicRef.current;
    const displayTopic = usingAutoTopic ? t.autoTopicLabel : trimmedTopic;
    const generationSeed =
      generationSeedRef.current ||
      `${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
    generationSeedRef.current = generationSeed;
    const cacheAnchors = reuseCache
      ? buildCacheAnchors(stories, language, t.autoTopicLabel)
      : [];
    const requestId = generationIdRef.current;
    const controller = new AbortController();
    generationControllerRef.current = controller;

    const initialText = state.text;
    let hasStoryText = initialText.trim().length > 0;

    setState(prev => ({
      ...prev,
      status: StoryStatus.GENERATING,
      topic: displayTopic,
      error: undefined,
    }));

    try {
      let fullText = initialText;
      let hasPassStoryText = false;
      await streamStoryWithControls(
        trimmedTopic,
        language,
        (chunk) => {
          if (requestId !== generationIdRef.current) return;
          if (!hasPassStoryText && chunk.trim().length > 0) {
            hasPassStoryText = true;
            setThoughtStream(''); 
          }
          fullText += chunk;
          setState(prev => ({ ...prev, text: prev.text + chunk }));
        },
        {
          signal: controller.signal,
          existingText: initialText,
          seed: generationSeed,
          cacheAnchors,
          onReasoningChunk: (reasoning) => {
            if (requestId !== generationIdRef.current) return;
            if (!hasPassStoryText) {
              setThoughtStream((prev) => (prev + reasoning).slice(-4000));
            }
          },
        }
      );

      fullText = normalizeOutroSignature(fullText);
      
      // Auto-complete story if missing outro signature
      if (!fullText.includes(OUTRO_SIGNATURE)) {
        const apiKey = await getStoredApiKey();
        if (apiKey) {
          try {
            setState(prev => ({ ...prev, error: language === 'vi' ? 'Đang hoàn thiện kết thúc...' : 'Completing story ending...' }));
            fullText = await completeStoryWithOutro(fullText, language, apiKey);
            fullText = normalizeOutroSignature(fullText);
          } catch (error) {
            console.error('Failed to auto-complete story:', error);
            setState(prev => ({
              ...prev, 
              error: language === 'vi' ? 'Không thể hoàn thiện kết thúc tự động' : 'Failed to auto-complete ending'
            }));
          }
        }
      }
      
      if (requestId !== generationIdRef.current) return;

      setState(prev => ({ ...prev, status: StoryStatus.COMPLETE, text: fullText, error: undefined }));
    } catch (error) {
      if (requestId !== generationIdRef.current) return;
      if (error instanceof Error && error.name === 'AbortError') {
        setThoughtStream('');
        setState(prev => ({
          ...prev,
          status: StoryStatus.PAUSED,
          error: undefined,
        }));
        return;
      }
      setThoughtStream('');
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

  const handleRandomTopic = async () => {
    if (state.status === StoryStatus.GENERATING || randomizingTopic) return;
    setRandomizingTopic(true);
    try {
      let candidates = aiTopicCacheRef.current;
      if (!candidates.length) {
        candidates = await generateTopicBatch(language).catch(() => []);
        aiTopicCacheRef.current = candidates;
      }

      const fallback = THEMED_RANDOM_TOPICS[language];
      const pool = candidates.length ? candidates : fallback;
      if (!pool.length) return;

      const selectionIndex = Math.floor(Math.random() * pool.length);
      const selection = pool[selectionIndex];
      if (candidates.length) {
        aiTopicCacheRef.current = candidates.filter((_, idx) => idx !== selectionIndex);
      }
      setTopicInput(selection);
    } finally {
      setRandomizingTopic(false);
    }
  };

  useEffect(() => {
    if (state.status !== StoryStatus.COMPLETE) return;
    if (!state.text.trim().length) return;
    if (activeStoryId) return;
    
    // Check if story has outro signature before saving
    const hasOutro = state.text.includes(OUTRO_SIGNATURE);
    if (!hasOutro) {
      console.warn("Story is incomplete - missing outro signature. Not saving to library.");
      return;
    }
    
    const saveKey = `${language}:${state.topic}:${state.text.length}`;
    if (lastSavedKeyRef.current === saveKey) return;
    lastSavedKeyRef.current = saveKey;
    
    // Tạo tiêu đề trước khi lưu
    generateStoryTitle(language, lastTopicRef.current, state.text)
      .then(title => {
        return saveStory({
          topic: state.topic,
          language,
          text: state.text,
          title,
        });
      })
      .catch(() => {
        // Nếu sinh tiêu đề thất bại, lưu mà không có title
        return saveStory({
          topic: state.topic,
          language,
          text: state.text,
        });
      })
      .then((record) => {
        setStories((prev) => [record, ...prev]);
        setActiveStoryId(record.id);
        setStartFromOffset(0);
      })
      .catch((error) => console.error("Failed to save story:", error));
  }, [state.status, state.text, state.topic, language, activeStoryId]);

  const handleSelectStory = (story: StoryRecord) => {
    // Stop current generation and clear controller
    if (generationControllerRef.current) {
      generationControllerRef.current.abort();
      generationControllerRef.current = null;
    }
    // Increment request ID to invalidate any pending requests
    generationIdRef.current += 1;
    
    // Reset generation refs
    generationSeedRef.current = '';
    lastSavedKeyRef.current = '';
    lastTopicRef.current = '';
    lastUsingAutoTopicRef.current = false;
    setThoughtStream('');
    
    setActiveStoryId(story.id);
    setActiveTab('home');
    setTopicInput(story.topic);
    const offset = Math.max(0, Math.min(story.lastOffset ?? 0, story.text.length));
    setState({
      status: StoryStatus.COMPLETE,
      text: story.text,
      topic: story.topic,
      error: undefined,
    });
    setStartFromOffset(offset);
    setTtsStoryKey((key) => key + 1);
    setTtsOffset(offset);
  };

  const handleResumePausedStory = () => {
    setShowPauseDialog(false);
    // Tiếp tục tạo truyện hiện tại
    handleResumeBroadcast();
  };

  const handleCreateNewFromPause = () => {
    setShowPauseDialog(false);
    
    // Cleanup history to prevent memory leak
    clearGenerationHistory();
    
    // Lưu truyện hiện tại
    if (state.text.trim().length > 0) {
      // Check if story has outro signature before saving
      const hasOutro = state.text.includes(OUTRO_SIGNATURE);
      if (hasOutro) {
        saveStory({
          topic: state.topic,
          language,
          text: state.text,
          title: pausedStoryTitle,
        })
          .then((record) => {
            setStories((prev) => [record, ...prev]);
          })
          .catch((error) => console.error("Failed to save story:", error));
      } else {
        console.warn("Paused story is incomplete - missing outro signature. Not saving to library.");
      }
    }
    // Abort current generation if running
    generationControllerRef.current?.abort();
    
    // Reset all generation-related refs to prepare for new story
    generationIdRef.current += 1; // Increment to invalidate previous request
    generationSeedRef.current = ''; // Clear seed
    lastSavedKeyRef.current = ''; // Clear saved key check
    lastTopicRef.current = ''; // Clear last topic
    lastUsingAutoTopicRef.current = false; // Reset auto topic flag
    generationControllerRef.current = null; // Clear controller
    
    // Tạo truyện mới
    setTopicInput('');
    setTtsOffset(0);
    setStartFromOffset(0);
    setTtsStoryKey((key) => key + 1);
    setState({
      status: StoryStatus.IDLE,
      text: '',
      topic: '',
      error: undefined,
    });
    setActiveStoryId(null);
    setPausedStoryTitle('');
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

  const handleToggleReuseCache = async () => {
    const next = !reuseCache;
    setReuseCache(next);
    try {
      await setReuseStoryCache(next);
    } catch (error) {
      console.error("Failed to update cache setting:", error);
    }
  };

  useEffect(() => {
    if (!activeStoryId) return;
    if (progressSaveRef.current) {
      clearTimeout(progressSaveRef.current);
    }
    progressSaveRef.current = setTimeout(() => {
      const safeOffset = Math.max(0, ttsOffset);
      const timestamp = new Date().toISOString();
      setStories((prev) =>
        prev.map((story) =>
          story.id === activeStoryId
            ? { ...story, lastOffset: safeOffset, lastProgressAt: timestamp }
            : story
        )
      );
      updateStoryProgress(activeStoryId, safeOffset).catch((error) => {
        console.error('Failed to persist progress:', error);
      });
    }, 350);

    return () => {
      if (progressSaveRef.current) {
        clearTimeout(progressSaveRef.current);
      }
    };
  }, [ttsOffset, activeStoryId]);

  const handleStoryModelChange = async (next: StoryModel) => {
    setStoryModelState(next);
    try {
      await setStoryModel(next);
    } catch (error) {
      console.error("Failed to update story model:", error);
    }
  };

  const handleTemperatureChange = async (value: number) => {
    setStoryTemperature(value);
    try {
      await persistStoryTemperature(value);
    } catch (error) {
      console.error("Failed to save temperature:", error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center pt-12 pb-40 px-4 md:px-8 bg-black text-gray-200 selection:bg-red-900 selection:text-white">
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
              className={`flex-1 min-w-[100px] px-4 py-2 rounded-full font-mono text-xs uppercase tracking-widest transition ${activeTab === item.id
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
            <div className="w-full bg-zinc-900 border border-zinc-800 p-5 sm:p-6 rounded-lg shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-20"><Radio size={48} /></div>
              <div className="grid gap-4 lg:grid-cols-[1.3fr,1fr] items-start">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-mono text-zinc-500 uppercase">{t.labelSubject}</label>
                  </div>
                  <div className="flex gap-2 flex-col sm:flex-row items-stretch">
                    <input
                      type="text"
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      placeholder={t.placeholderInput}
                      className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 text-zinc-100 p-3 rounded-md focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-900 transition-all font-mono placeholder-zinc-700 text-sm"
                      disabled={state.status === StoryStatus.GENERATING}
                      onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    />
                    <button
                      onClick={handleRandomTopic}
                      disabled={state.status === StoryStatus.GENERATING || randomizingTopic}
                      className="px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-md hover:bg-zinc-700 hover:text-red-400 transition-colors text-zinc-400 disabled:opacity-50 shrink-0 flex items-center justify-center"
                      title={t.randomBtnTitle}
                      aria-busy={randomizingTopic}
                    >
                      {randomizingTopic ? <Loader2 className="h-5 w-5 animate-spin" /> : <Dices size={20} />}
                    </button>
                  </div>
                  <p className="text-[11px] font-mono uppercase tracking-wide text-zinc-500">{t.autoTopicHint}</p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setShowSuggestions((prev) => !prev)}
                      className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-md text-[10px] font-mono uppercase tracking-wide text-zinc-400 hover:border-red-800 hover:text-red-400 transition"
                      aria-expanded={showSuggestions}
                    >
                      <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide">{t.suggested}</span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${showSuggestions ? 'rotate-180 text-red-400' : 'text-zinc-600'}`}
                      />
                    </button>
                    {showSuggestions && (
                      <div className="flex flex-wrap gap-2">
                        {GENRE_PROMPTS[language].map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => setTopicInput(prompt)}
                            className="px-2 py-1 bg-zinc-950 border border-zinc-800 text-zinc-400 text-[10px] hover:border-red-900 hover:text-red-400 transition-colors rounded"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 w-full flex-wrap">
                    <button
                      onClick={handleGenerate}
                      disabled={state.status === StoryStatus.GENERATING}
                      className={`flex-1 py-3 rounded font-bold uppercase text-sm tracking-wider transition-all ${state.status === StoryStatus.GENERATING
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
              </div>
            </div>

            <StoryDisplay
              text={state.text}
              isGenerating={state.status === StoryStatus.GENERATING}
              topic={state.topic}
              language={language}
              thoughtStream={thoughtStream}
              currentOffset={ttsOffset}
              onJumpRequest={(offset) => ttsRef.current?.jumpToOffset(offset)}
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
                  className={`relative w-16 h-9 rounded-full border transition shrink-0 ${allowBackground ? 'bg-red-700 border-red-600' : 'bg-zinc-800 border-zinc-700'} ${!backgroundSupported || !isNativeAndroid ? 'opacity-40 cursor-not-allowed' : ''}`}
                  aria-pressed={allowBackground}
                >
                  <span
                    className={`absolute top-1 left-1 h-7 w-7 rounded-full bg-zinc-100 shadow-md transition-transform ${allowBackground ? 'translate-x-7' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              <div className="flex items-start justify-between gap-4 mt-5 pt-5 border-t border-zinc-800">
                <div>
                  <p className="text-sm text-zinc-200">{t.reuseCacheLabel}</p>
                  <p className="text-xs text-zinc-500 mt-1">{t.reuseCacheHint}</p>
                </div>
                <button
                  onClick={handleToggleReuseCache}
                  className={`relative w-16 h-9 rounded-full border transition shrink-0 ${reuseCache ? 'bg-red-700 border-red-600' : 'bg-zinc-800 border-zinc-700'}`}
                  aria-pressed={reuseCache}
                >
                  <span
                    className={`absolute top-1 left-1 h-7 w-7 rounded-full bg-zinc-100 shadow-md transition-transform ${reuseCache ? 'translate-x-7' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              <div className="mt-5 pt-5 border-t border-zinc-800">
                <label className="flex flex-col gap-2 text-zinc-400">
                  <span className="text-sm text-zinc-200">{t.storyModelLabel}</span>
                  <select
                    value={storyModel}
                    onChange={(e) => handleStoryModelChange(e.target.value as StoryModel)}
                    className="w-full bg-zinc-950 border border-zinc-700 text-zinc-100 p-2 rounded-md focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-900 transition-all font-mono text-sm"
                  >
                    <option value="deepseek-reasoner">{t.storyModelReasoner}</option>
                    <option value="deepseek-chat">{t.storyModelChat}</option>
                  </select>
                  <span className="text-xs text-zinc-500">{t.storyModelHint}</span>
                </label>
              </div>
              <div className="mt-5 pt-5 border-t border-zinc-800">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-zinc-200 font-medium">
                      {t.temperatureLabel}
                    </label>
                    <span className="text-sm font-mono text-zinc-400 bg-zinc-800 px-2 py-1 rounded">
                      {storyTemperature.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.05"
                    value={storyTemperature}
                    onChange={(e) => handleTemperatureChange(Number(e.target.value))}
                    className="w-full accent-red-600 h-2 cursor-pointer"
                  />
                  <div className="flex justify-between items-center text-[11px] text-zinc-500">
                    <span>{t.temperatureLow}</span>
                    <span>{t.temperatureHigh}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                    {t.temperatureHint}
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full bg-zinc-900 border border-zinc-800 p-6 rounded-lg shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wide text-zinc-500">{t.personalizationTitle}</p>
                  <p className="text-xs text-zinc-500 mt-2">{t.personalizationHint}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <label className="flex flex-col gap-1 text-zinc-400">
                  {t.horrorLabel} ({horrorLabel})
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={personalization.horrorLevel}
                    onChange={(e) => updatePersonalization({ horrorLevel: Number(e.target.value) })}
                    className="w-full accent-red-600"
                  />
                  <span className="text-[11px] text-zinc-500">{t.horrorHint}</span>
                </label>

                <label className="flex flex-col gap-1 text-zinc-400">
                  {t.styleLabel}
                  <select
                    value={personalization.narrativeStyle}
                    onChange={(e) =>
                      updatePersonalization({ narrativeStyle: e.target.value as NarrativeStyle })
                    }
                    className="w-full bg-zinc-950 border border-zinc-700 text-zinc-100 p-2 rounded-md focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-900 transition-all font-mono text-sm"
                  >
                    {narrativeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-zinc-500">{t.styleHint}</span>
                </label>

                <label className="flex flex-col gap-1 text-zinc-400 md:col-span-2">
                  {t.lengthLabel} ({targetWords.toLocaleString()} {t.wordsLabel})
                  <input
                    type="range"
                    min={targetMinWords}
                    max={targetMaxWords}
                    step="100"
                    value={targetWords}
                    onChange={(e) => updatePersonalization({ targetWords: Number(e.target.value) })}
                    className="w-full accent-red-600"
                  />
                  <div className="flex justify-between items-center text-[11px] text-zinc-500">
                    <span>{derivedMinWords.toLocaleString()} - {derivedHardMaxWords.toLocaleString()} {t.wordsLabel}</span>
                    <span>{t.actualLengthLabel}</span>
                  </div>
                </label>
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
      
      <div
        className="fixed left-0 right-0 bottom-0 z-40 px-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)' }}
      >
        <div className="max-w-4xl mx-auto">
          <TTSPlayer
            ref={ttsRef}
            text={state.text}
            topic={state.topic}
            language={language}
            isGenerating={state.status === StoryStatus.GENERATING}
            storyKey={ttsStoryKey}
            onProgress={setTtsOffset}
            startFromOffset={startFromOffset}
            initialRate={ttsRate}
            initialPitch={ttsPitch}
            onRateChange={setTtsRateState}
            onPitchChange={setTtsPitchState}
          />
        </div>
      </div>

      <PauseDialog
        isOpen={showPauseDialog}
        storyTitle={pausedStoryTitle}
        onResume={handleResumePausedStory}
        onCreateNew={handleCreateNewFromPause}
        onClose={() => setShowPauseDialog(false)}
        language={language}
      />

      <footer className="mt-16 text-zinc-700 text-xs font-mono text-center">
        <p>{t.footerCaution}</p>
        <p className="mt-2 opacity-50">Powered by DeepSeek</p>
      </footer>
    </div>
  );
};

export default App;
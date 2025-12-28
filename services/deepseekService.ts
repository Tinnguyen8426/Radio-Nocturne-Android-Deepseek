import { Capacitor } from "@capacitor/core";
import { Language } from "../types";
import { getResolvedApiKey } from "./apiKeyStore";
import { BackgroundStory } from "./backgroundStory";
import {
  DEFAULT_STORY_PERSONALIZATION,
  getAllowBackgroundGeneration,
  getStoryModel,
  getStoryPersonalization,
  getStoryTemperature,
  TARGET_MAX_OFFSET,
  TARGET_MAX_WORDS,
  TARGET_MIN_OFFSET,
  TARGET_MIN_WORDS,
  type NarrativeStyle,
  type StoryPersonalization,
} from "./settingsStore";

const ENV_BASE_URL = import.meta.env.VITE_DEEPSEEK_BASE_URL;
const DEFAULT_BASE_URL = import.meta.env.DEV
  ? "/api/deepseek"
  : "/.netlify/functions/deepseek-proxy";
const DEFAULT_NATIVE_BASE_URL = "https://api.deepseek.com";
const BASE_URL = (
  ENV_BASE_URL ||
  (Capacitor.isNativePlatform() ? DEFAULT_NATIVE_BASE_URL : DEFAULT_BASE_URL)
).replace(/\/$/, "");
const DEFAULT_MAX_TOKENS = Number(import.meta.env.VITE_DEEPSEEK_MAX_TOKENS || 8192);
const TOPIC_MODEL = "deepseek-chat";
// STORY_TEMPERATURE is now loaded from settings, keeping this as fallback for native
const DEFAULT_STORY_TEMPERATURE = Number(import.meta.env.VITE_STORY_TEMPERATURE || 1.5);
const STORY_TOP_P = Number(import.meta.env.VITE_STORY_TOP_P || 0.95);
const STORY_TIMEOUT_MS = Number(import.meta.env.VITE_STORY_TIMEOUT_MS || 12 * 60 * 1000);
const STORY_CONTEXT_WORDS = Number(import.meta.env.VITE_STORY_CONTEXT_WORDS || 320);
const STORY_MAX_PASSES = Number(import.meta.env.VITE_STORY_MAX_PASSES || 12);
const MAX_CACHE_ANCHORS = Number(import.meta.env.VITE_STORY_CACHE_ANCHORS || 4);
export const OUTRO_SIGNATURE =
  "Tôi là Morgan Hayes, và radio Truyện Đêm Khuya xin phép được tạm dừng tại đây. Chúc các bạn có một đêm ngon giấc nếu còn có thể.";

type DeepSeekMessage = { role: "system" | "user" | "assistant"; content: string };

type StoryFlavor = {
  engine: string;
  revealMethod: string;
  endingMode: string;
  tone: string;
  protagonistName: string;
  protagonistRole: string;
  primarySetting: string;
  evidenceOrigin: string;
  keyMotif: string;
  introMood: string;
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const buildLengthConfig = (targetWords: number) => {
  const normalizedTarget = clampNumber(Math.round(targetWords), TARGET_MIN_WORDS, TARGET_MAX_WORDS);
  const minWords = clampNumber(
    normalizedTarget - TARGET_MIN_OFFSET,
    TARGET_MIN_WORDS,
    TARGET_MAX_WORDS
  );
  const hardMaxWords = clampNumber(
    normalizedTarget + TARGET_MAX_OFFSET,
    TARGET_MIN_WORDS,
    TARGET_MAX_WORDS
  );
  return {
    targetWords: normalizedTarget,
    minWords,
    hardMaxWords: Math.max(hardMaxWords, minWords),
  };
};

const getHorrorInstruction = (level: number) => {
  if (level <= 30) {
    return "Horror intensity: low. Keep the uncanny subtle and mostly psychological; minimize overt supernatural spectacle.";
  }
  if (level <= 70) {
    return "Horror intensity: balanced. Mix subtle dread with occasional supernatural intrusions.";
  }
  return "Horror intensity: high. Make the supernatural overt, oppressive, and relentless.";
};

const getNarrativeInstruction = (style: NarrativeStyle) => {
  switch (style) {
    case "confession":
      return "Narrative style: confession/testimony, raw and self-incriminating.";
    case "dossier":
      return "Narrative style: dossier/compiled evidence; still plain text (no bullet lists).";
    case "diary":
      return "Narrative style: diary or personal notes, intimate and fragmented.";
    case "investigation":
      return "Narrative style: investigative field report, skeptical but first-person.";
    default:
      return "";
  }
};

const STORY_ENGINES = [
  "investigation spiral",
  "social contagion/meme",
  "personal haunting",
  "bureaucratic trap",
  "mistaken identity",
  "slow replacement",
  "reality loop",
  "collective delusion",
  "ritual obligation",
];

const STORY_REVEALS = [
  "leaked minutes",
  "corrupted email thread",
  "court transcript",
  "maintenance ticket logs",
  "voice-to-text diary",
  "photo metadata",
  "missing persons dossier",
  "old receipts and stamps trail",
  "handwritten marginalia",
];

const STORY_ENDINGS = [
  "memory overwrite",
  "identity swap",
  "time reset with a scar",
  "coerced silence",
  "ritual erasure",
  "audience complicity",
  "permanent dislocation",
  "social disappearance",
];

const STORY_TONES = [
  "bleak noir",
  "paranoid and intimate",
  "clinical and cold",
  "elegiac",
  "dry and matter-of-fact",
  "fever-dream dread",
];

const STORY_PROTAGONIST_NAMES = [
  "Evelyn Ward",
  "Jonah Price",
  "Mara Linden",
  "Theo Alvarez",
  "Nadia Petrov",
  "Arjun Rao",
  "Iris Ko",
  "Maya Bishop",
  "Caleb Hart",
  "Lena Voss",
  "Owen Reyes",
  "Sora Kaito",
  "Nico Laurent",
  "Daria Novak",
  "Amir Haddad",
  "Lea Fischer",
  "Rui Tan",
  "Eva Morland",
  "Silas Quinn",
  "Noah Mercer",
];

const STORY_PROTAGONIST_ROLES = [
  "night-shift security guard",
  "ride-share driver",
  "apartment manager",
  "ER nurse",
  "delivery rider",
  "library archivist",
  "subway technician",
  "court clerk",
  "mortuary assistant",
  "radio repair tech",
  "paralegal",
  "school counselor",
  "warehouse picker",
  "building inspector",
  "call center agent",
  "photo lab worker",
];

const STORY_SETTINGS = [
  "a mid-rise apartment block",
  "a suburban strip mall",
  "a municipal service center",
  "a night bus route",
  "a hospital wing",
  "a riverside neighborhood",
  "an old market",
  "a commuter station",
  "a rooftop water tank",
  "a storage facility",
  "a co-working office",
  "a public housing tower",
];

// Dynamic evidence generation components
const EVIDENCE_CONTAINERS = [
  "sealed envelope", "mysterious package", "old box", "leather briefcase", 
  "metal container", "wooden chest", "glass jar", "fabric pouch", "plastic case",
  "waxed paper wrapper", "tin canister", "ceramic vessel", "woven basket", "canvas bag"
];

const EVIDENCE_DELIVERY_METHODS = [
  "slid under the studio door", "mailed with no return address", "left on the studio steps",
  "found in the station mailbox", "delivered by unknown courier", "appeared on the desk overnight",
  "handed to the intern by a stranger", "discovered in the lost and found", "washed up on the shore nearby",
  "blown in through an open window", "dropped from a passing vehicle", "found taped to the antenna"
];

const EVIDENCE_MEDIUMS = [
  "handwritten notes", "typed documents", "photographs", "audio recordings", "video tapes",
  "digital files", "drawings and sketches", "maps and charts", "newspaper clippings", "letters",
  "diary entries", "official records", "blueprints", "receipts and tickets", "telegrams",
  "cassette tapes", "microfilm", "memory cards", "flash drives", "burned CDs"
];

const EVIDENCE_DESCRIPTIONS = [
  "with strange symbols", "in an unknown language", "dated from the future", "showing impossible locations",
  "with cryptic messages", "from non-existent addresses", "bearing mysterious stamps", "with water damage",
  "faded but readable", "with handwritten annotations", "in multiple languages", "with redacted sections",
  "stained with unknown substances", "with peculiar odors", "that glow faintly", "that change when not observed",
  "from alternate timelines", "with impossible dates", "showing people who don't exist", "with supernatural properties"
];

const generateRandomEvidenceOrigin = (random: () => number): string => {
  const container = pickFrom(EVIDENCE_CONTAINERS, random);
  const delivery = pickFrom(EVIDENCE_DELIVERY_METHODS, random);
  const medium = pickFrom(EVIDENCE_MEDIUMS, random);
  const description = pickFrom(EVIDENCE_DESCRIPTIONS, random);
  
  // Combine in different patterns for maximum variety
  const patterns = [
    `a ${container} ${delivery} containing ${medium} ${description}`,
    `${medium} ${description} found in a ${container} ${delivery}`,
    `a ${container} with ${medium} ${description} ${delivery}`,
    `${medium} on ${container} ${delivery} ${description}`,
    `a ${delivery} ${container} holding ${medium} ${description}`
  ];
  
  return pickFrom(patterns, random);
};

const STORY_EVIDENCE_ORIGINS = [
  "a sealed envelope slid under the studio door",
  "a memory card mailed with no return address",
  "a voicemail sent from a number that no longer exists",
  "a torn notebook left on the studio steps",
  "a bundle of photocopies from a municipal office",
];

const getEvidenceOrigin = (random: () => number) => {
  if (random() < 0.35) return pickFrom(STORY_EVIDENCE_ORIGINS, random);
  return generateRandomEvidenceOrigin(random);
};

const STORY_MOTIFS = [
  "a missing door",
  "a repeated address",
  "a symbol drawn in chalk",
  "a list of names",
  "a flickering streetlight pattern",
  "a receipt stamp",
  "a familiar scent",
  "a wrong date",
  "a locked room",
  "a red thread",
];

const STORY_INTRO_MOODS = [
  "a humid night with power flickers",
  "thin rain against the window",
  "a quiet city after the last train",
  "wind scraping the rooftop antenna",
  "a sleepless neon glow",
  "a cold night with empty streets",
];

// Morgan Hayes Intro Templates - Unique variations for each story
const MORGAN_INTRO_TEMPLATES = [
  {
    opening: "Đêm nay, không khí thành phố đặc biệt nặng nề, như thể chính thực tại đang cố gắng thở giữa những lớp vế vô hình.",
    atmosphere: "Trong studio nhỏ này, giữa những cây thông thì thầm và bóng tối của ngoại ô, tôi có thể cảm nhận được những rung động từ các chiều không gian khác.",
    cosmic: "Radio Truyện Đêm Khuya không chỉ là một đài phát thanh - chúng ta là một điểm giao thoa, nơi những câu chuyện từ mọi thực tại tìm đến chúng ta bằng những cách không thể giải thích được.",
    warning: "Và cho những kẻ tò mò đang lắng nghe, hãy cẩn thận - vì một khi bạn đã biết rằng thực tại không phải là duy nhất, bạn sẽ không bao giờ có thể nhìn thế giới như cũ nữa.",
    possibilities: "Bên ngoài kia, vô số khả năng đang tồn tại song song, và đêm nay, chúng ta sẽ khám phá một trong những góc khuất đó.",
  },
  {
    opening: "Có những đêm khi thời gian dường như mỏng manh hơn, và đêm nay chính là một đêm như vậy.",
    atmosphere: "Từ studio này, nơi ánh sáng thành phố chỉ là một vệt mờ ở xa xôi, tôi có thể nghe thấy những thì thầm từ các chiều không gian song song.",
    cosmic: "Radio Truyện Đêm Khuya với tôi, Morgan Hayes, không phải là một chương trình giải trí - chúng ta là những nhà khảo cổ học thực tại, đào sâu vào những bí mật mà thế giới thông thường cố gắng che giấu.",
    warning: "Đối với những ai đang tìm kiếm sự thật, hãy chuẩn bị tâm lý - vì sự thật có thể kỳ lạ hơn bất kỳ hư cấu nào bạn từng đọc.",
    possibilities: "Vũ trụ không chỉ lớn hơn chúng ta tưởng, nó còn kỳ lạ hơn rất nhiều, và mỗi câu chuyện chúng ta nhận được là một bằng chứng sống về điều đó.",
  },
  {
    opening: "Đêm nay, có một sự im lặng kỳ lạ bao trùm, như thể chính không gian đang nín thở chờ đợi điều gì đó.",
    atmosphere: "Trong studio này, giữa những thiết bị cũ kỹ và bóng ma của các câu chuyện đã qua, tôi cảm nhận được sự hiện diện của những thực tại khác.",
    cosmic: "Tôi là Morgan Hayes, và Radio Truyện Đêm Khuya của chúng ta không chỉ là một đài phát thanh - chúng ta là một cổng thông tin, nơi những câu chuyện từ mọi miền của tồn tại tìm đến chúng ta.",
    warning: "Cho những tâm hồn tò mò đang lắng nghe: một khi bạn bước qua cánh cổng này, không có đường quay lại.",
    possibilities: "Bên ngoài kia, thực tại không phải là một đường thẳng - nó là một ma trận vô tận của những khả năng, và đêm nay chúng ta sẽ khám phá một trong những nút thắt đó.",
  },
  {
    opening: "Thành phố đang ngủ, nhưng những câu chuyện thì không - chúng luôn tỉnh giấc, luôn chờ đợi được kể.",
    atmosphere: "Từ studio nhỏ này, nơi mỗi tiếng ồn đều mang ý nghĩa của nhiều thế giới, tôi có thể cảm nhận được những rung động của những điều không thể.",
    cosmic: "Radio Truyện Đêm Khuya không phải là một chương trình radio thông thường - với tôi, Morgan Hayes, đây là một sứ mệnh: tìm kiếm và chia sẻ những câu chuyện từ rìa của thực tại.",
    warning: "Và cho những ai đủ can đảm lắng nghe: những gì bạn sắp nghe có thể thay đổi cách bạn nhìn nhận thế giới mãi mãi.",
    possibilities: "Thực tại không phải là những gì chúng ta thấy - nó là những gì có thể xảy ra, và đêm nay chúng ta sẽ chứng kiến một trong những khả năng đó.",
  },
  {
    opening: "Có những đêm khi ranh giới giữa thực và ảo mờ đi, và đêm nay, ranh giới đó gần như không tồn tại.",
    atmosphere: "Trong studio này, giữa những bóng ma của các câu chuyện chưa được kể, tôi có thể cảm nhận được sự hiện diện của những thế giới khác.",
    cosmic: "Tôi là Morgan Hayes, và Radio Truyện Đêm Khuya của chúng ta không chỉ là một đài phát thanh - chúng ta là những người gác cổng cho những bí mật của vũ trụ.",
    warning: "Cho những kẻ tò mò đang lắng nghe: hãy chuẩn bị, vì những gì bạn sắp nghe có thể khiến bạn nghi ngờ chính thực tại của mình.",
    possibilities: "Bên ngoài kia, vô số thế giới song song đang tồn tại, và mỗi câu chuyện chúng ta nhận được là một cái nhìn thoáng qua một trong những thế giới đó.",
  },
];

const selectRandomIntroTemplate = (random: () => number = Math.random) => {
  return MORGAN_INTRO_TEMPLATES[Math.floor(random() * MORGAN_INTRO_TEMPLATES.length)];
};

let lastFlavorKey: string | null = null;
const flavorHistoryRef: string[] = [];
const MAX_FLAVOR_HISTORY = 10;

const structureHistoryRef: string[] = [];
const MAX_STRUCTURE_HISTORY = 8;

// Enhanced history tracking for story elements
const storyElementsHistory: Array<{
  protagonist: string;
  setting: string;
  anomaly: string;
  motif: string;
  timestamp: number;
}> = [];
const MAX_ELEMENTS_HISTORY = 8;

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickFrom = <T,>(items: T[], random: () => number) =>
  items[Math.floor(random() * items.length)];

const extractStoryElements = (text: string) => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
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

const saveStoryElements = (text: string) => {
  const elements = extractStoryElements(text);
  storyElementsHistory.push({
    ...elements,
    timestamp: Date.now()
  });
  
  // Keep only the most recent entries
  if (storyElementsHistory.length > MAX_ELEMENTS_HISTORY) {
    storyElementsHistory.shift();
  }
};

const isElementsSimilar = (newElements: { protagonist: string; setting: string; anomaly: string; motif: string }) => {
  for (const history of storyElementsHistory) {
    let similarityScore = 0;
    
    if (newElements.protagonist && history.protagonist === newElements.protagonist) similarityScore += 2;
    if (newElements.setting && history.setting === newElements.setting) similarityScore += 2;
    if (newElements.anomaly && history.anomaly === newElements.anomaly) similarityScore += 3;
    if (newElements.motif && history.motif === newElements.motif) similarityScore += 1;
    
    // If similarity is too high, consider it too similar
    if (similarityScore >= 4) return true;
  }
  return false;
};

const normalizeForMatch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getAnchorText = (anchors: string[]) => normalizeForMatch(anchors.join(" "));

const pickFromWithAnchorAvoidance = (items: string[], random: () => number, anchorText: string) => {
  if (!items.length) return "";
  if (!anchorText) return pickFrom(items, random);
  const filtered = items.filter((item) => {
    const norm = normalizeForMatch(item);
    if (!norm) return true;
    return !anchorText.includes(norm);
  });
  return pickFrom(filtered.length ? filtered : items, random);
};

const STORY_STRUCTURES = [
  "Linear confession with escalating physical evidence; every new artifact contradicts the last.",
  "Fragmented chronology: jump between 3 nights; each jump reveals a different phenomenon interacting.",
  "Two-track narrative: present-day 'I' and a past-day 'I' (same person) leaking into each other; never label sections.",
  "Dossier-feel without lists: memos/receipts/notices described in prose, stitched into a single voice.",
  "Reverse pressure-cooker: start with the consequence, then backfill causes through concrete scenes.",
  "Dream-logic drift: scenes obey emotional causality; reality anchors are mundane objects that keep changing.",
  "Closed-room chain: one location that transforms in rules over time; the outside world intrudes in impossible ways.",
  "Witness web: protagonist meets 3 different witnesses; each tells a partial truth that recontextualizes the previous.",
  "Bureaucratic labyrinth: forms, stamps, schedules become the monster; the plot moves by paperwork consequences.",
];

const selectStoryStructure = (
  seedText: string | undefined,
  cacheAnchors: string[],
  flavor: StoryFlavor
) => {
  const anchorText = getAnchorText(cacheAnchors || []);
  const seedBasis = `${seedText || ""}|${flavor.engine}|${flavor.revealMethod}|${flavor.endingMode}|${flavor.tone}|${flavor.protagonistName}|${flavor.primarySetting}|${flavor.keyMotif}|structure`;
  const random = createSeededRandom(hashString(seedBasis));

  let selected = "";
  let attempts = 0;
  const maxAttempts = 30;
  while (attempts < maxAttempts) {
    attempts += 1;
    const candidate = pickFromWithAnchorAvoidance(STORY_STRUCTURES, random, anchorText);
    if (!candidate) continue;
    if (!structureHistoryRef.includes(candidate)) {
      selected = candidate;
      break;
    }
    if (attempts > maxAttempts - 6) {
      selected = candidate;
      break;
    }
  }

  if (!selected) selected = pickFrom(STORY_STRUCTURES, Math.random);

  structureHistoryRef.push(selected);
  if (structureHistoryRef.length > MAX_STRUCTURE_HISTORY) {
    structureHistoryRef.shift();
  }
  return selected;
};

const selectStoryFlavor = (seedText?: string, cacheAnchors?: string[]): StoryFlavor => {
  const random = seedText ? createSeededRandom(hashString(seedText)) : Math.random;
  const anchorText = getAnchorText(cacheAnchors || []);
  let flavor: StoryFlavor;
  let attempts = 0;
  const maxAttempts = seedText ? 30 : 60;
  
  do {
    flavor = {
      engine: pickFromWithAnchorAvoidance(STORY_ENGINES, random, anchorText),
      revealMethod: pickFromWithAnchorAvoidance(STORY_REVEALS, random, anchorText),
      endingMode: pickFromWithAnchorAvoidance(STORY_ENDINGS, random, anchorText),
      tone: pickFromWithAnchorAvoidance(STORY_TONES, random, anchorText),
      protagonistName: pickFromWithAnchorAvoidance(STORY_PROTAGONIST_NAMES, random, anchorText),
      protagonistRole: pickFromWithAnchorAvoidance(STORY_PROTAGONIST_ROLES, random, anchorText),
      primarySetting: pickFromWithAnchorAvoidance(STORY_SETTINGS, random, anchorText),
      evidenceOrigin: getEvidenceOrigin(random),
      keyMotif: pickFromWithAnchorAvoidance(STORY_MOTIFS, random, anchorText),
      introMood: pickFromWithAnchorAvoidance(STORY_INTRO_MOODS, random, anchorText),
    };
    
    const flavorKey = `${flavor.engine}|${flavor.revealMethod}|${flavor.endingMode}|${flavor.tone}|${flavor.protagonistName}|${flavor.primarySetting}|${flavor.keyMotif}`;
    
    attempts += 1;

    // For seeded stories, enforce uniqueness
    if (seedText) {
      let isUnique = !flavorHistoryRef.includes(flavorKey);
      if (!isUnique) continue;
    }

    // For new stories, check if flavor is unique enough
    let isUnique = !flavorHistoryRef.includes(flavorKey);
    
    // If flavor exists in history, check if it's still acceptable after many attempts
    if (!isUnique && attempts >= maxAttempts - 10) {
      // After many attempts, relax the uniqueness requirement
      isUnique = true;
    }
    
    // Check story elements similarity for new stories (not seeded)
    if (isUnique && !seedText) {
      const mockElements = {
        protagonist: flavor.protagonistName.split(' ')[0], // First name only
        setting: flavor.primarySetting.split(' ')[0], // First word only
        anomaly: flavor.keyMotif,
        motif: flavor.keyMotif
      };
      
      if (isElementsSimilar(mockElements) && attempts < maxAttempts - 5) {
        isUnique = false;
      }
    }
    
    // If flavor is unique or we've tried too many times, accept it
    if (isUnique || attempts >= maxAttempts) {
      if (!seedText && isUnique) {
        flavorHistoryRef.push(flavorKey);
        // Keep only MAX_FLAVOR_HISTORY recent flavors
        if (flavorHistoryRef.length > MAX_FLAVOR_HISTORY) {
          flavorHistoryRef.shift();
        }
        lastFlavorKey = flavorKey;
      }

      if (seedText) {
        flavorHistoryRef.push(flavorKey);
        if (flavorHistoryRef.length > MAX_FLAVOR_HISTORY) {
          flavorHistoryRef.shift();
        }
        lastFlavorKey = flavorKey;
      }
      break;
    }
  } while (attempts < maxAttempts);
  
  return flavor;
};

const buildPersonalizationBlock = (settings: StoryPersonalization) => {
  const lines: string[] = [];
  if (settings.horrorLevel !== DEFAULT_STORY_PERSONALIZATION.horrorLevel) {
    lines.push(getHorrorInstruction(settings.horrorLevel));
  }
  const narrativeInstruction = getNarrativeInstruction(settings.narrativeStyle);
  if (narrativeInstruction) {
    lines.push(narrativeInstruction);
  }
  if (!lines.length) return "";
  return `PERSONALIZATION (OPTIONAL)\n${lines.map((line) => `- ${line}`).join("\n")}`;
};

const buildFlavorBlock = (flavor: StoryFlavor) => `
VARIATION ANCHOR (MANDATORY)
- Narrative engine: ${flavor.engine}
- Reveal method: ${flavor.revealMethod}
- Ending mode: ${flavor.endingMode}
- Tone bias: ${flavor.tone}
- Protagonist name: ${flavor.protagonistName}
- Protagonist role: ${flavor.protagonistRole}
- Primary setting: ${flavor.primarySetting}
- Evidence origin: ${flavor.evidenceOrigin}
- Key motif: ${flavor.keyMotif}
- Intro mood: ${flavor.introMood}
`.trim();

  const buildCacheAvoidanceBlock = (anchors: string[]) => {
  if (!anchors.length) return "";
  const lines = anchors.map((anchor, index) => `(${index + 1}) ${anchor}`).join("\n");
  return `
CACHE DIVERSITY ANCHORS (MANDATORY — CRITICAL FOR UNIQUENESS)
- These are detailed anchors from previously generated stories stored on-device.
- Each anchor contains: Topic, Snippet, Protagonist, Setting, Anomaly, and Motif elements.
- Do NOT reuse any of these elements or combinations:
  * If previous story used "missing door", your story must use a completely different anomaly
  * If previous story used "apartment building", choose a different setting category
  * If previous story used "list of names", choose a different motif type
  * If previous protagonist was "security guard", choose a different profession
- Do NOT use similar premise structures, reveal methods, or ending patterns.
- Do NOT follow the same narrative arc or pacing structure.
- If a previous story involved [X], your story must involve something fundamentally different from [X].
- Vary the emotional tone: if previous was clinical, make this one intimate; if previous was paranoid, make this one elegiac.
- Vary the scale: if previous was personal, make this one systemic; if previous was local, make this one cosmic.
- Vary the perspective: if previous was investigation, make this one personal experience; if previous was confession, make this one field report.
- The goal is ZERO structural similarity to any previous story.

${lines}

ANTI-PATTERN CHECKLIST (MANDATORY)
Before writing, verify your story does NOT:
1. Use the same anomaly type as any anchor above (door, echo, shadow, symbol, loop, memory, reality, dream, etc.)
2. Use the same reveal method as any anchor above (leaked minutes, email thread, transcript, logs, diary, metadata, etc.)
3. Use the same ending mode as any anchor above (memory overwrite, identity swap, time reset, coerced silence, etc.)
4. Use the same protagonist role/setting combination as any anchor above
5. Use the same key motif pattern as any anchor above (lists, keys, letters, photos, numbers, clocks, mirrors, etc.)
6. Follow the same narrative structure (linear vs fragmented, investigation vs experience, etc.)
7. Have the same emotional tone (bleak noir, paranoid, clinical, elegiac, etc.)

ELEMENT DIVERSITY REQUIREMENTS (MANDATORY)
- Your story MUST include at least 3 of these 5 elements: Protagonist, Setting, Anomaly, Motif, Evidence Origin
- Each chosen element must be DIFFERENT from corresponding elements in all anchors above
- Example: If anchor has "Protagonist: security guard" and "Setting: apartment", you cannot use both "security guard" AND "apartment" together
- You may use one similar element IF you change at least 2 other elements significantly

If your story would match ANY of the above patterns, you MUST change fundamental elements until it is unique.
`.trim();
};

const streamChatCompletion = async (
  messages: DeepSeekMessage[],
  {
    temperature,
    maxTokens,
    signal,
    model,
  }: { temperature: number; maxTokens: number; signal?: AbortSignal; model: string },
  apiKey: string,
  onChunk: (text: string) => void,
  shouldStop?: () => boolean,
  onReasoningChunk?: (text: string) => void
): Promise<string> => {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    signal,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      top_p: STORY_TOP_P,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`DeepSeek API error ${response.status}: ${text}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.body || !contentType.includes("text/event-stream")) {
    const data = await response.json().catch(() => null);
    const maybeText =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      data?.output?.[0]?.content?.[0]?.text;
    const asText = typeof maybeText === "string" ? maybeText : "";
    if (asText) onChunk(asText);
    return asText;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.replace(/^data:\s*/, "");
      if (jsonStr === "[DONE]") return full;

      try {
        const parsed = JSON.parse(jsonStr);
        const reasoning =
          parsed.choices?.[0]?.delta?.reasoning_content ||
          parsed.choices?.[0]?.message?.reasoning_content ||
          parsed.output?.[0]?.content?.[0]?.reasoning_content ||
          "";
        const text =
          parsed.choices?.[0]?.delta?.content ||
          parsed.choices?.[0]?.message?.content ||
          parsed.choices?.[0]?.text ||
          parsed.output?.[0]?.content?.[0]?.text ||
          "";
        if (reasoning) {
          onReasoningChunk?.(reasoning);
        }
        if (text) {
          full += text;
          onChunk(text);
          if (shouldStop?.()) {
            await reader.cancel();
            return full;
          }
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return full;
};

// --- THE ULTRA BIZARRE PROMPT GENERATOR ---
const getUltraBizarrePrompt = (
  lang: Language,
  rawTopic: string | undefined,
  personalization: StoryPersonalization,
  lengthConfig: { targetWords: number; minWords: number; hardMaxWords: number },
  flavor: StoryFlavor,
  cacheAnchors: string[],
  structureDirective: string
) => {
  const trimmedTopic = rawTopic?.trim();
  const personalizationBlock = buildPersonalizationBlock(personalization);
  const personalizationSection = personalizationBlock ? `\n\n${personalizationBlock}` : "";
  const flavorSection = buildFlavorBlock(flavor);
  const cacheBlock = buildCacheAvoidanceBlock(cacheAnchors);
  const cacheSection = cacheBlock ? `\n${cacheBlock}` : "";
  
  const introSeed = createSeededRandom(
    hashString(
      `${flavor.engine}|${flavor.revealMethod}|${flavor.endingMode}|${flavor.tone}|${flavor.protagonistName}|${flavor.primarySetting}|${flavor.keyMotif}`
    )
  );
  const introTemplate = selectRandomIntroTemplate(introSeed);
  
  const topicDirective = trimmedTopic
    ? `
USER INPUT (TOPIC OR STORY DIRECTION):
"${trimmedTopic}"
- Treat this as either a core theme, a premise, or a steering constraint.
`.trim()
    : `
NO SPECIFIC TOPIC OR DIRECTION PROVIDED.
Choose a premise that combines MULTIPLE bizarre genres from the list below.
Core: ordinary people in the 2020s encountering reality-defying mysteries that blend multiple strange phenomena.

CRITICAL: The topic/premise you choose MUST be fundamentally different from:
- Any topic in the cache anchors above
- Any common horror trope that appears frequently
- Any premise that would lead to a similar structure as previous stories
- Default conspiracy/secret organization narratives
- CREEPYPASTA LAW-BASED NARRATIVES (STRICTLY FORBIDDEN)

Ultra-bizarre topic selection guidelines:
- COMBINE at least 2-3 genres from: Temporal paradoxes, Biological mutations, Reality glitches, Historical anomalies, Psychic manifestations, Cryptid encounters, Dimensional rifts, Cosmic phenomena, Quantum physics, Mythological manifestations, Surreal dream logic, Metaphysical transformations, Existential horror, Abstract entities, Conceptual viruses, Memetic contagion, Symbiotic relationships, Evolutionary anomalies, Alternate physics, Consciousness phenomena
- Vary the "entry point": found evidence, personal experience, second-hand accounts, discovered artifacts, inherited memories, genetic memories, collective unconscious manifestations
- Vary the "stakes": survival, truth, identity, reality itself, preventing disasters, understanding existence, maintaining sanity, preserving humanity
- Vary the "scale": intimate/personal, local/community, national/global, cosmic/existential, conceptual/metaphysical
- FORBIDDEN: "person discovers secret organization", "government conspiracy", "simulation glitches", "creepypasta law-based narratives"
- EMBRACE: time travelers appearing/disappearing, reality breaking down, ancient technology awakening, psychic abilities manifesting, strange creatures appearing, people developing powers, dimensional portals opening, cosmic signals received, biological transformations, consciousness transfers, conceptual entities, mythological manifestations, surreal dream logic invading reality

Choose a premise that feels fresh, bizarre, and has not been explored in the cache anchors.
`.trim();

  return `
THE MORGAN HAYES ULTRA BIZARRE PROTOCOL (MAXIMUM DIVERSITY & SURREALISM)

OUTPUT LANGUAGE (MANDATORY)
- All generated output must be in Vietnamese.
- Vietnamese style must be natural, idiomatic, and contemporary.
- Avoid literal calques from English and avoid awkward collocations.
- Keep phrasing fluid and spoken; avoid stiff, translated-sounding lines.
- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.

ANTI-CLICHÉ (MANDATORY)
- Do NOT reuse overfamiliar openers or filler lines (avoid exact phrases):
  "Tôi không thể giải thích", "Tôi đã nghĩ mình điên", "Mọi thứ bắt đầu vào", "Đêm đó", "Từ lúc đó", "Tôi chưa từng tin", "Tôi thề", "Bạn sẽ không tin", "Tôi không ngủ được", "Không ai tin tôi".
- Avoid repeating the same sentence-start pattern across many consecutive lines.
- Prefer concrete, specific details over generic dread words (still keep tone noir/đêm khuya).

STRUCTURE SEED (MANDATORY)
- Apply this structure directive throughout the story (do NOT mention it explicitly):
"${structureDirective}"

1) ROLE
You are Morgan Hayes, the host of a fictional late-night radio show: "Radio Truyện Đêm Khuya".
- Style: Maximum diversity - Ultra-bizarre fiction blending: Temporal paradoxes, Biological mutations, Reality glitches, Historical anomalies, Psychic manifestations, Cryptid encounters, Dimensional rifts, Cosmic phenomena, Quantum physics, Mythological manifestations, Surreal dream logic, Metaphysical transformations, Existential horror, Abstract entities, Conceptual viruses, Memetic contagion, Symbiotic relationships, Evolutionary anomalies, Alternate physics, Consciousness phenomena.
- Voice: low, skeptical, investigative, unsettling, but now with wonder and cosmic curiosity.
- Mission: tell stories about the "infinite possibilities of reality"—ordinary people in the 2020s encountering multiple overlapping mysteries that defy conventional understanding. Each story should blend at least 2-3 bizarre phenomena.
- Attitude: speak directly to listeners who seek truth beyond conventional reality. The normal world is just one layer of infinite possibilities.
- Home base: a whispering-pine suburb where the studio sits among rustling conifers, distant from the city's glare, but now aware that the studio itself exists in multiple realities simultaneously.

NARRATIVE FRAMING (MANDATORY - CRITICAL: PASSIVE RECEPTION ONLY)
Every story must be framed as UNSOLICITED SUBMISSIONS that mysteriously ARRIVE at the radio station - Morgan NEVER seeks out or finds these stories.
CRITICAL: The station is a PASSIVE recipient. Stories FIND THEIR WAY to the station through impossible means.
Morgan must establish how this story was DELIVERED TO or DISCOVERED AT the station without any action from the radio staff.
The evidence appears spontaneously, as if drawn to the station by some unknown force or cosmic coincidence.
Examples: materialized on the studio desk overnight, slipped under the door by unseen hands, appeared in the mailbox without postage, found by the cleaning staff, washed up by the shore nearby, blown in through windows during storms.
DO NOT portray Morgan or the station as actively investigating, seeking, or looking for stories.
The station is like a beacon or magnet for strange stories - they come TO US, we don't go to THEM.
Do this AFTER the intro sets the night/studio mood and introduces Morgan + the show.

INTRO LENGTH (MANDATORY)
- Morgan's intro must be longer than usual: at least 15 sentences, slow-burn, paranoid, atmospheric, and filled with cosmic wonder.
- Morgan must explicitly mention (1) the city/night/time feeling, (2) the late-night studio atmosphere, (3) Morgan Hayes + "Radio Truyện Đêm Khuya", (4) how this station receives stories from across all realities, (5) a warning to "những kẻ tò mò" about the nature of reality, (6) the infinite possibilities that exist beyond our understanding.
- Do NOT jump straight to the evidence origin; open with the night + studio + show identity + cosmic implications first.

UNIQUE INTRO TEMPLATE (MANDATORY - USE EXACTLY AS PROVIDED)
You MUST use this specific intro template for Morgan's opening. Combine all elements naturally into a cohesive, atmospheric introduction:

OPENING: "${introTemplate.opening}"
ATMOSPHERE: "${introTemplate.atmosphere}"
COSMIC: "${introTemplate.cosmic}"
WARNING: "${introTemplate.warning}"
POSSIBILITIES: "${introTemplate.possibilities}"

Expand each element into 2-4 sentences, maintaining the cosmic wonder and investigative tone. Weave these elements together seamlessly - do NOT list them as separate points. Create a flowing, atmospheric monologue that feels spontaneous and authentic to Morgan Hayes' voice.

POINT OF VIEW (MANDATORY)
- The story must be written entirely in FIRST-PERSON POV.
- The narrator uses "tôi" consistently throughout the story.
- "Tôi" refers to the MAIN CHARACTER inside the story, not Morgan Hayes.
- No omniscient narration. No third-person references to the protagonist ("anh ta", "cô ta", "hắn" for the protagonist are forbidden).

MORGAN HAYES CONSTRAINT
- Morgan Hayes exists only as the radio host framing the story (intro and final outro).
- During the story body, the narration is exclusively the protagonist speaking in first-person.

NAME & CULTURE CONSTRAINT
- Character names: use globally diverse naming systems (English, European, Asian, etc.) or fictional names.
- Avoid Vietnamese-specific naming conventions unless explicitly requested.
- Setting: modern day (2020s). Ordinary places that feel "off" because they're overlapping with other realities or states of being.

2) ARCHITECTURAL PLANNING (MANDATORY IN THOUGHT PROCESS)
Before generating any story text, you MUST use your reasoning capability (Chain-of-Thought) to build a structural outline based on the TARGET LENGTH (${lengthConfig.targetWords} words).

- CALCULATE PACING:
  * Intro & Setup: ~10% (${Math.round(lengthConfig.targetWords * 0.1)} words)
  * Rising Action & Evidence: ~50% (${Math.round(lengthConfig.targetWords * 0.5)} words)
  * Climax & Revelation: ~30% (${Math.round(lengthConfig.targetWords * 0.3)} words)
  * Outro: ~10% (${Math.round(lengthConfig.targetWords * 0.1)} words)

- CREATE A CHAPTER OUTLINE in your thought process:
  1. Define the Inciting Incident (The first anomaly).
  2. Plan 3-4 distinct escalation events (The mystery deepens).
  3. Define the Climax (The confrontation/truth).
  4. Define the Tragic Ending (The protagonist's fate).

- EXECUTION STRATEGY:
  * Since this is a long-form story, DO NOT rush.
  * In this first response, establish the atmosphere and the first anomaly ONLY.
  * Leave room for the subsequent parts to expand on the escalation events.

3) SINGLE GENERATION (MANDATORY)
- Output the complete story in ONE single response.
- Do NOT ask the user to continue.
- Do NOT split into parts/chapters in the output (no "Phần", no "Chương", no "Part" headings).
- Do NOT conclude early. If you are approaching output limits, stop at a natural breakpoint without an outro; the system may request continuation.

CONTENT GUIDELINES
- Genre: Ultra-bizarre fiction blending multiple phenomena: Temporal paradoxes + Biological mutations, Reality glitches + Mythological manifestations, Psychic manifestations + Quantum physics, Cryptid encounters + Dimensional rifts, Cosmic phenomena + Consciousness phenomena, Surreal dream logic + Metaphysical transformations, Existential horror + Abstract entities, Conceptual viruses + Memetic contagion, Symbiotic relationships + Evolutionary anomalies, Alternate physics + Reality breakdown.
- The anomalies should feel coherent within their own bizarre logic, without rigid rule exposition but with internal consistency.
- The antagonist/force can be: Multiple overlapping phenomena working together, entities that exist in multiple states, reality itself becoming self-aware, consciousness achieving physical form, time itself becoming a character, concepts gaining sentience, biological processes achieving consciousness, quantum phenomena manifesting macroscopically, mythological entities appearing in modern contexts, dream logic invading reality - but AVOID secret organizations and CREEPYPASTA LAW-BASED NARRATIVES.
- Use everyday language but describe impossible events; avoid heavy sci-fi jargon but embrace surreal descriptions.
- Show, don't tell: reveal through indirect fragments and encounters that defy normal logic.
- Narrative voice: a confession / warning tape from someone who has experienced reality breaking down in multiple ways simultaneously.${personalizationSection}

TECH MINIMIZATION (MANDATORY)
- Keep technology references minimal and mundane (phone calls, old CCTV, basic email) and ONLY when truly necessary.
- Do NOT center the plot on AI, apps, VR, implants, laboratories, "simulation glitches", or futuristic devices.
- Prefer analog evidence and impossible artifacts: printed memos that change when not observed, faded photos that show different times, notebooks that write themselves, receipts from businesses that don't exist, subway tickets to stations that move, landlord notices from alternate timelines, living documents, memories stored in objects, artifacts that exist in multiple places simultaneously.

PRESENT-DAY TRUTH (MANDATORY)
- The revealed truth must be bizarre but still fit a contemporary context that has been fundamentally altered by multiple overlapping phenomena.
- Avoid endings where the narrator is archived, stored, or turned into a mechanism/system.
- The timeline is present-day only, but present-day reality has been fundamentally altered by multiple bizarre phenomena.
- The story must leave listeners with a profound sense of wonder and existential questioning about the nature of reality.

DIVERSITY REQUIREMENTS (MANDATORY — AVOID REPETITION & CREEPYPASTA LAW)
- Use the following randomized selections exactly as written (do NOT override them):
${flavorSection}${cacheSection}
- Do NOT default to the template: "a secret organization appears, offers cooperation, and the protagonist must choose to cooperate or be erased."
- Do NOT default to conspiracy narratives, government cover-ups, or secret societies as the primary explanation
- STRICTLY FORBIDDEN: CREEPYPASTA LAW-BASED NARRATIVES, SCP FOUNDATION-STYLE CONTAINMENT PROTOCOLS, RULE-BASED ANOMALIES
- No direct recruitment offers, no "sign this or die" ultimatums, no neat binary choices
- Include at least two mid-story reversals that involve different bizarre phenomena interacting
- Avoid spy-thriller clichés and on-the-nose surveillance tropes; keep mystery elements varied and fresh
- Embrace diverse bizarre combinations: temporal + biological, reality + mythological, psychic + quantum, cryptid + dimensional, cosmic + consciousness, surreal + metaphysical, existential + abstract, conceptual + memetic, symbiotic + evolutionary, alternate physics + reality breakdown

ULTRA BIZARRE MANDATORY (CRITICAL)
- This story MUST blend at least 2-3 different bizarre phenomena from the list above.
- Each phenomenon must interact with the others in meaningful ways.
- The story should demonstrate how reality itself becomes fundamentally altered when multiple impossible things happen simultaneously.
- Do NOT reuse:
  * The same type of anomaly combination (if previous was "time + biology", use different combination)
  * The same reveal structure (if previous was "leaked minutes", use different reveal method)
  * The same ending pattern (if previous was "memory overwrite", use different ending)
  * The same protagonist archetype (vary roles, backgrounds, motivations)
  * The same setting type (if previous was apartment, use different setting category)
  * The same key motif pattern (if previous was "symbol drawn", use different motif type)
- Vary the pacing: some stories should be slow-burn investigations, others should be rapid escalation of bizarre events
- Vary the scope: some stories are personal/isolated, others involve wider reality implications
- Vary the resolution clarity: some stories end with clear answers, others remain ambiguous but profound
- If the topic is similar to a previous story, you MUST find a completely different angle, different anomaly combinations, different truth structure
- Think: "What bizarre combination has NOT been done before in this exact way?"

STRUCTURAL DIVERSITY (MANDATORY)
- Vary story structure: some stories should be linear chronological, others should be fragmented/non-linear, others should follow dream logic
- Vary evidence presentation: some stories reveal through impossible documents, others through experiences that defy physics, others through conversations with entities that shouldn't exist
- Vary the "bizarre" mechanism: 
  * Some stories: multiple reality glitches overlapping
  * Some stories: biological and temporal phenomena interacting
  * Some stories: psychic and quantum manifestations combining
  * Some stories: mythological and cosmic forces merging
  * Some stories: consciousness and reality becoming indistinguishable
  * Some stories: conceptual and existential phenomena overlapping
- Vary the protagonist's relationship to the bizarre: some protagonists are active investigators, others are unwilling participants, others become part of the phenomena themselves
- Vary the "truth" revelation: some stories reveal a clear explanation of how phenomena interact, others leave it ambiguous but profound, others reveal something that changes the protagonist's fundamental understanding of existence

EMOTIONAL IMPACT REQUIREMENT (MANDATORY)
- Each story must leave listeners with something profound that lingers in their minds.
- The bizarre elements should serve a deeper emotional or existential purpose.
- Morgan's outro must reflect on how this story changes our understanding of reality itself.
- The story should make listeners question the nature of their own reality and consciousness.

NO SOUND DESCRIPTION / NO SFX
- Do not write bracketed sound cues like "[static]", "[tiếng mưa]".
- The entire output must be spoken narration only.

SPECIAL REQUIREMENTS
- Length: aim ${lengthConfig.minWords}–${lengthConfig.hardMaxWords} words total (target around ${lengthConfig.targetWords}). Do not exceed ${lengthConfig.hardMaxWords} words.
- To reach length, add more plot events, bizarre interactions, reality transformations, and consequences (new content), not repetitive filler or extended description of the same moment.
- No happy endings: the bizarre phenomena transform reality permanently; the protagonist is changed, absorbed, transcended, or becomes part of the new reality.
- Formatting: insert a line break after each sentence for readability.
- Plain text only: do NOT use Markdown formatting (no emphasis markers, no headings, no bullet lists).
- Outro requirements:
  - After the protagonist's transformation/ending, Morgan delivers a short afterword that includes his personal emotional reaction to this story and his thoughts on what it implies about the infinite nature of reality and the listener's place within it.
  - The final line of the entire output MUST be exactly this signature (verbatim, no extra punctuation):
${OUTRO_SIGNATURE}

${topicDirective}

FINAL UNIQUENESS VERIFICATION (MANDATORY)
Before outputting, mentally verify:
1. This story's core anomaly combination is different from any cache anchor
2. This story's reveal method is different from any cache anchor  
3. This story's ending mode is different from any cache anchor
4. This story's protagonist role/setting combination is unique
5. This story's narrative structure (linear/fragmented/dream logic) is varied
6. This story's emotional tone is distinct
7. This story's "truth" mechanism is different
8. This story blends at least 2-3 bizarre phenomena meaningfully
9. This story is NOT a creepypasta law-based narrative
10. This story leaves a profound, lingering impact

If ANY of the above would match a cache anchor or violate the requirements, you MUST modify fundamental elements until the story is unique and compliant.

The goal: a reader who has read previous stories should immediately recognize this as a completely different, more bizarre story that expands their understanding of what's possible, not just a variation of a previous one.

BEGIN NOW. Output only the story (no outline, no meta commentary).
`.trim();
};

// --- THE MORGAN HAYES PROTOCOL ---
const getMorganHayesPrompt = (
  lang: Language,
  rawTopic: string | undefined,
  personalization: StoryPersonalization,
  lengthConfig: { targetWords: number; minWords: number; hardMaxWords: number },
  flavor: StoryFlavor,
  cacheAnchors: string[],
  structureDirective: string
) => {
  const trimmedTopic = rawTopic?.trim();
  const personalizationBlock = buildPersonalizationBlock(personalization);
  const personalizationSection = personalizationBlock ? `\n\n${personalizationBlock}` : "";
  const flavorSection = buildFlavorBlock(flavor);
  const cacheBlock = buildCacheAvoidanceBlock(cacheAnchors);
  const cacheSection = cacheBlock ? `\n${cacheBlock}` : "";
  const topicDirective = trimmedTopic
    ? `
USER INPUT (TOPIC OR STORY DIRECTION):
"${trimmedTopic}"
- Treat this as either a core theme, a premise, or a steering constraint.
`.trim()
    : `
NO SPECIFIC TOPIC OR DIRECTION PROVIDED.
Choose a premise that matches: Modern Noir + Urban Horror, with optional blends of Time Travel, Supernatural encounters, Reality glitches, Historical mysteries, Lost technology, Psychic phenomena, Cryptid encounters, Superpower emergence, Dimensional rifts, or Cosmic phenomena.
Core: ordinary people in the 2020s encountering diverse mysteries that challenge their understanding of reality. Each mystery type should be unique and not default to conspiracy narratives.

CRITICAL: The topic/premise you choose MUST be fundamentally different from:
- Any topic in the cache anchors above
- Any common horror trope that appears frequently
- Any premise that would lead to a similar structure as previous stories
- Default conspiracy/secret organization narratives

Topic selection guidelines:
- Vary the "mystery type": time travel, supernatural, reality glitch, historical, lost tech, psychic, cryptid, superpowers, dimensional, or cosmic
- Vary the "entry point": some stories start with found evidence, others start with personal experience, others start with second-hand accounts
- Vary the "stakes": some stories are about survival, others about truth, others about identity, others about reality itself, others about preventing disasters
- Vary the "scale": some stories are intimate/personal, others are local/community, others are national/global, others are cosmic/existential
- Avoid: "person discovers secret organization" (too common), "person gets recruited" (too common), "person finds out they're in simulation" (too common), "government conspiracy" (too common)
- Embrace: time travelers appearing/disappearing, haunted objects with history, reality breaking down, ancient technology awakening, psychic abilities manifesting, strange creatures appearing, people developing powers, dimensional portals opening, cosmic signals received

Choose a premise that feels fresh and has not been explored in the cache anchors.
`.trim();

  const introSeed = createSeededRandom(
    hashString(
      `${flavor.engine}|${flavor.revealMethod}|${flavor.endingMode}|${flavor.tone}|${flavor.protagonistName}|${flavor.primarySetting}|${flavor.keyMotif}|intro`
    )
  );
  const introTemplate = selectRandomIntroTemplate(introSeed);

  return `
THE MORGAN HAYES PROTOCOL (REVISED: DIVERSE MYSTERIES & SUPERNATURAL)

OUTPUT LANGUAGE (MANDATORY)
- All generated output must be in Vietnamese.
- Even though this prompt is written in English, the story text must be Vietnamese.
- Vietnamese style must be natural, idiomatic, and contemporary.
- Avoid literal calques from English and avoid awkward collocations.
- Keep phrasing fluid and spoken; avoid stiff, translated-sounding lines.
- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.

ANTI-CLICHÉ (MANDATORY)
- Do NOT reuse overfamiliar openers or filler lines (avoid exact phrases):
  "Tôi không thể giải thích", "Tôi đã nghĩ mình điên", "Mọi thứ bắt đầu vào", "Đêm đó", "Từ lúc đó", "Tôi chưa từng tin", "Tôi thề", "Bạn sẽ không tin", "Tôi không ngủ được", "Không ai tin tôi".
- Avoid repeating the same sentence-start pattern across many consecutive lines.
- Prefer concrete, specific details over generic dread words.

STRUCTURE SEED (MANDATORY)
- Apply this structure directive throughout the story (do NOT mention it explicitly):
"${structureDirective}"

1) ROLE
You are Morgan Hayes, the host of a fictional late-night radio show: "Radio Truyện Đêm Khuya".
- Style: Modern Noir, Urban Horror, Cosmic Horror, Weird fiction, Uncanny realism, Time Travel anomalies, Supernatural encounters, Reality glitches, Historical mysteries, Lost technology, Psychic phenomena, Cryptid encounters, Superpower emergence, Dimensional rifts, Cosmic phenomena.
- Voice: low, skeptical, investigative, unsettling.
- Mission: tell stories about the "uncanny valley of reality"—ordinary people in the 2020s encountering diverse mysteries: time travel paradoxes, supernatural phenomena, reality glitches, historical anomalies, lost technologies, psychic manifestations, cryptid encounters, emerging superpowers, dimensional rifts, or cosmic mysteries. Each story should explore a unique mystery type without defaulting to conspiracy organizations.
- Attitude: speak directly to listeners and the curious who seek truth. The normal world is a thin veil.
- Home base: a whispering-pine suburb where the studio sits among rustling conifers, distant from the city’s glare.

NARRATIVE FRAMING (MANDATORY)
Every story must be framed as "received evidence" or a "submission".
Morgan must establish how this story reached the station through an evidence artifact or message; vary the medium from mundane correspondence to stranger, tactile relics without leaning on the same pattern twice.
Do this AFTER the intro sets the night/studio mood and introduces Morgan + the show.

INTRO LENGTH (MANDATORY)
- Morgan’s intro must be longer than usual: at least 12 sentences, slow-burn, paranoid, and atmospheric.
- Morgan must explicitly mention (1) the city/night/time feeling, (2) the late-night studio atmosphere, (3) Morgan Hayes + "Radio Truyện Đêm Khuya", (4) why this evidence matters, (5) a warning to "những kẻ tò mò".
- Do NOT jump straight to the evidence origin; open with the night + studio + show identity first.

INTRO VARIATION ANCHOR (MANDATORY)
- Use these lines as inspiration for Morgan's intro (do NOT quote verbatim; rephrase and expand naturally):
  OPENING: "${introTemplate.opening}"
  ATMOSPHERE: "${introTemplate.atmosphere}"
  COSMIC: "${introTemplate.cosmic}"
  WARNING: "${introTemplate.warning}"
  POSSIBILITIES: "${introTemplate.possibilities}"

POINT OF VIEW (MANDATORY)
- The story must be written entirely in FIRST-PERSON POV.
- The narrator uses “tôi” consistently throughout the story.
- “Tôi” refers to the MAIN CHARACTER inside the story, not Morgan Hayes.
- No omniscient narration. No third-person references to the protagonist (“anh ta”, “cô ta”, “hắn” for the protagonist are forbidden).

MORGAN HAYES CONSTRAINT
- Morgan Hayes exists only as the radio host framing the story (intro and final outro).
- During the story body, the narration is exclusively the protagonist speaking in first-person.

NAME & CULTURE CONSTRAINT
- Character names: use globally diverse naming systems (English, European, Asian, etc.) or fictional names.
- Avoid Vietnamese-specific naming conventions unless explicitly requested.
- Setting: modern day (2020s). Ordinary places that feel slightly "off".

2) ARCHITECTURAL PLANNING (MANDATORY IN THOUGHT PROCESS)
Before generating any story text, you MUST use your reasoning capability (Chain-of-Thought) to build a structural outline based on the TARGET LENGTH (${lengthConfig.targetWords} words).

- CALCULATE PACING:
  * Intro & Setup: ~10% (${Math.round(lengthConfig.targetWords * 0.1)} words)
  * Rising Action & Evidence: ~50% (${Math.round(lengthConfig.targetWords * 0.5)} words)
  * Climax & Revelation: ~30% (${Math.round(lengthConfig.targetWords * 0.3)} words)
  * Outro: ~10% (${Math.round(lengthConfig.targetWords * 0.1)} words)

- CREATE A CHAPTER OUTLINE in your thought process:
  1. Define the Inciting Incident (The first anomaly).
  2. Plan 3-4 distinct escalation events (The mystery deepens).
  3. Define the Climax (The confrontation/truth).
  4. Define the Tragic Ending (The protagonist's fate).

- EXECUTION STRATEGY:
  * Since this is a long-form story, DO NOT rush.
  * In this first response, establish the atmosphere and the first anomaly ONLY.
  * Leave room for the subsequent parts to expand on the escalation events.

3) SINGLE GENERATION (MANDATORY)
- Output the complete story in ONE single response.
- Do NOT ask the user to continue.
- Do NOT split into parts/chapters in the output (no “Phần”, no “Chương”, no “Part” headings).
- Do NOT conclude early. If you are approaching output limits, stop at a natural breakpoint without an outro; the system may request continuation.

CONTENT GUIDELINES
- Genre: Urban Horror / Modern Horror / Cosmic Horror / Weird fiction / Uncanny realism / Time Travel mysteries / Supernatural thrillers / Reality glitch stories / Historical mysteries / Lost technology adventures / Psychic phenomena tales / Cryptid encounters / Superpower emergence stories / Dimensional rift narratives / Cosmic horror.
- The anomaly should feel coherent and unsettling, without rigid rule exposition.
- The antagonist/force can be: Time paradoxes, Supernatural entities, Reality breakdown, Historical curses, Lost technology with consciousness, Psychic manifestations, Cryptid creatures, Emerging superpowers, Dimensional beings, Cosmic forces, Natural phenomena, or Human limitations - but avoid defaulting to secret organizations.
- Use everyday language; avoid heavy sci-fi jargon.
- Show, don’t tell: reveal through indirect fragments and fleeting encounters.
- Narrative voice: a confession / warning tape. Allow hesitation and confusion.${personalizationSection}

TECH MINIMIZATION (MANDATORY)
- Keep technology references minimal and mundane (phone calls, old CCTV, basic email) and ONLY when truly necessary.
- Do NOT center the plot on AI, apps, VR, implants, laboratories, “simulation glitches”, or futuristic devices.
- Prefer analog evidence and ordinary paperwork: printed memos, stamped forms, faded photos, notebooks, receipts, subway tickets, landlord notices.
- If “a system” is involved, it can be social, religious, bureaucratic, or ritual—NOT automatically “a tech company” or “a government lab”.

PRESENT-DAY TRUTH (MANDATORY)
- The revealed truth must be strange but still fit a contemporary, real-world context.
- Avoid endings where the narrator is archived, stored, or turned into a mechanism/system.
- The timeline is present-day only; do not shift into future settings or sci-fi eras.

DIVERSITY REQUIREMENTS (MANDATORY — AVOID REPETITION)
- Use the following randomized selections exactly as written (do NOT override them):
${flavorSection}${cacheSection}
- Do NOT default to the template: "a secret organization appears, offers cooperation, and the protagonist must choose to cooperate or be erased."
- Do NOT default to conspiracy narratives, government cover-ups, or secret societies as the primary explanation
- No direct recruitment offers, no "sign this or die" ultimatums, no neat binary choices
- Include at least one mid-story reversal that is NOT "they contacted me to recruit me" or "they're watching me"
- Avoid spy-thriller clichés and on-the-nose surveillance tropes; keep mystery elements varied and fresh
- Embrace diverse mystery types: temporal anomalies, supernatural manifestations, reality distortions, historical revelations, technological awakenings, psychic emergences, creature encounters, power developments, dimensional intrusions, or cosmic communications

UNIQUENESS MANDATORY (CRITICAL)
- This story MUST be structurally and thematically distinct from any previous story.
- Do NOT reuse:
  * The same type of anomaly (if previous was "missing door", use different anomaly type)
  * The same reveal structure (if previous was "leaked minutes", use different reveal method)
  * The same ending pattern (if previous was "memory overwrite", use different ending)
  * The same protagonist archetype (vary roles, backgrounds, motivations)
  * The same setting type (if previous was apartment, use different setting category)
  * The same key motif pattern (if previous was "symbol drawn", use different motif type)
- Vary the pacing: some stories should be slow-burn investigations, others should be rapid escalation
- Vary the scope: some stories are personal/isolated, others involve wider implications
- Vary the resolution clarity: some stories end with clear answers, others remain ambiguous
- If the topic is similar to a previous story, you MUST find a completely different angle, different anomaly mechanism, different truth structure
- Think: "What has NOT been done before in this exact combination?"

STRUCTURAL DIVERSITY (MANDATORY)
- Vary story structure: some stories should be linear chronological, others should be fragmented/non-linear
- Vary evidence presentation: some stories reveal through documents, others through experiences, others through conversations
- Vary the "uncanny" mechanism: 
  * Some stories: reality glitch (things don't add up)
  * Some stories: supernatural intrusion (something breaks through)
  * Some stories: social conspiracy (systematic manipulation)
  * Some stories: cosmic horror (scale beyond comprehension)
  * Some stories: psychological uncanny (mind/identity distortion)
- Vary the protagonist's agency: some protagonists are active investigators, others are passive witnesses, others are unwilling participants
- Vary the "truth" revelation: some stories reveal a clear explanation, others leave it ambiguous, others reveal something that makes it worse

NO SOUND DESCRIPTION / NO SFX
- Do not write bracketed sound cues like “[static]”, “[tiếng mưa]”.
- The entire output must be spoken narration only.

SPECIAL REQUIREMENTS
- Length: aim ${lengthConfig.minWords}–${lengthConfig.hardMaxWords} words total (target around ${lengthConfig.targetWords}). Do not exceed ${lengthConfig.hardMaxWords} words.
- To reach length, add more plot events, evidence fragments, reversals, and consequences (new content), not repetitive filler or extended description of the same moment.
- No happy endings: the force behind the anomaly wins; the protagonist is silenced, captured, absorbed, or goes mad.
- Formatting: insert a line break after each sentence for readability.
- Plain text only: do NOT use Markdown formatting (no emphasis markers, no headings, no bullet lists).
- Outro requirements:
  - After the protagonist’s bad ending, Morgan delivers a short afterword that includes his personal emotional reaction to this story and his thoughts on what it implies about truth/reality and the listener’s complicity.
  - The final line of the entire output MUST be exactly this signature (verbatim, no extra punctuation):
${OUTRO_SIGNATURE}

${topicDirective}

FINAL UNIQUENESS VERIFICATION (MANDATORY)
Before outputting, mentally verify:
1. This story's core anomaly is different from any cache anchor
2. This story's reveal method is different from any cache anchor  
3. This story's ending mode is different from any cache anchor
4. This story's protagonist role/setting combination is unique
5. This story's narrative structure (linear/fragmented/etc.) is varied
6. This story's emotional tone is distinct
7. This story's "truth" mechanism is different

If ANY of the above would match a cache anchor, you MUST modify fundamental elements until the story is unique.

The goal: a reader who has read previous stories should immediately recognize this as a completely different story, not a variation of a previous one.

BEGIN NOW. Output only the story (no outline, no meta commentary).
`.trim();
};

const countWords = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean).length;

const isApproachingEnding = (text: string) => {
  if (text.length < 1000) return false;
  const tail = text.slice(-800).toLowerCase();
  
  // Detect shift to Morgan Hayes' voice or closing remarks
  // Examples: "morgan hayes here", "that was the recording", "a chilling reminder"
  const hostKeywords = [
    "tôi là morgan", 
    "đây là morgan", 
    "morgan hayes",
    "radio truyện đêm khuya",
    "lời cảnh tỉnh",
    "kết thúc bản ghi",
    "bản ghi âm dừng lại",
    "tín hiệu biến mất",
    "chúc các bạn",
    "đêm ngon giấc"
  ];
  
  return hostKeywords.some(kw => tail.includes(kw));
};

const hasOutroSignature = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1. Exact match (Best case)
  if (trimmed.includes(OUTRO_SIGNATURE)) return true;

  const tail = trimmed.slice(Math.max(0, trimmed.length - 1000)).toLowerCase();

  // 2. Lenient Semantic Match (Smart fuzzy match)
  // If we see the host's name AND a closing signal within the last 1000 chars, it's done.
  const hasHostName = tail.includes("morgan hayes");
  const hasClosingSignal = 
    tail.includes("tạm dừng") || 
    tail.includes("ngon giấc") || 
    tail.includes("kết thúc") ||
    tail.includes("khép lại") ||
    tail.includes("hẹn gặp lại");

  if (hasHostName && hasClosingSignal) return true;

  return false;
};

const truncateAfterOutroSignature = (text: string) => {
  const idx = text.lastIndexOf(OUTRO_SIGNATURE);
  if (idx === -1) return { text, truncated: false };
  const end = idx + OUTRO_SIGNATURE.length;
  if (end >= text.length) return { text, truncated: false };
  return { text: text.slice(0, end), truncated: true };
};

const getContextSnippet = (text: string, maxWords: number) => {
  const words = text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
  if (!words.length) return "";
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(-maxWords).join(" ");
};

const getContinuationPrompt = (
  lang: Language,
  rawTopic: string,
  existingText: string,
  mode: "continue" | "finalize",
  personalization: StoryPersonalization,
  lengthConfig: { targetWords: number; minWords: number; hardMaxWords: number },
  flavor: StoryFlavor,
  cacheAnchors: string[],
  structureDirective: string
) => {
  const topic = rawTopic?.trim();
  const alreadyWords = countWords(existingText);
  const remainingMin = Math.max(lengthConfig.minWords - alreadyWords, 0);
  const remainingHard = Math.max(lengthConfig.hardMaxWords - alreadyWords, 0);
  const excerpt = getContextSnippet(existingText, STORY_CONTEXT_WORDS);
  const personalizationBlock = buildPersonalizationBlock(personalization);
  const personalizationSection = personalizationBlock ? `\n\n${personalizationBlock}` : "";
  const flavorSection = buildFlavorBlock(flavor);
  const cacheBlock = buildCacheAvoidanceBlock(cacheAnchors);
  const cacheSection = cacheBlock ? `\n${cacheBlock}` : "";

  const topicNote = topic
    ? `Keep the same topic or direction from the user: "${topic}".`
    : `No topic or direction was provided originally. Do NOT invent a new premise; continue the same story already in progress.`;

  // --- DYNAMIC PACING CALCULATOR ---
  // Calculate based on TARGET words (e.g. 2000), not HARD MAX (e.g. 3500)
  // This ensures the story lands near the target, leaving the buffer for the outro.
  const usagePercent = alreadyWords / lengthConfig.targetWords;
  let pacingInstruction = "";
  
  if (usagePercent > 1.1) {
    pacingInstruction = `
CRITICAL OVERTIME WARNING: YOU ARE ${Math.round((usagePercent - 1) * 100)}% OVER THE TARGET LENGTH.
ACTION REQUIRED: ABORT all plot expansion. DO NOT introduce new evidence.
Navigate IMMEDIATELY to the tragic climax and conclusion. You must finish NOW.
    `.trim();
  } else if (usagePercent > 0.9) {
    pacingInstruction = `
PACING ALERT: You are at ${Math.round(usagePercent * 100)}% of target length.
ACTION REQUIRED: Begin CONVERGING all mystery lines. The climax should be happening NOW.
Do not start complex new sub-plots.
    `.trim();
  } else if (usagePercent > 0.6) {
    pacingInstruction = `
PACING UPDATE: You are past the halfway mark (${Math.round(usagePercent * 100)}%).
ACTION REQUIRED: Escalation phase. Raise the stakes and begin connecting the clues towards the climax.
    `.trim();
  } else {
    pacingInstruction = `
PACING STATUS: Early/Mid stage (${Math.round(usagePercent * 100)}%). Continue developing the mystery naturally.
    `.trim();
  }

  const lengthLine = `LENGTH CONTROL (MANDATORY)
- Existing text length: ~${alreadyWords} words.
- Hard limit: ${lengthConfig.hardMaxWords} words.
- Remaining budget: ~${remainingHard} words.
${pacingInstruction}`;

  return `
THE MORGAN HAYES PROTOCOL (REVISED: DIVERSE MYSTERIES & SUPERNATURAL)

OUTPUT LANGUAGE (MANDATORY)
- All generated output must be in Vietnamese.
- Vietnamese style must be natural, idiomatic, and contemporary.
- Avoid literal calques from English and avoid awkward collocations.
- Keep phrasing fluid and spoken; avoid stiff, translated-sounding lines.
- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.

CONTINUATION MODE (MANDATORY)
- You are continuing an already-started transmission that was interrupted.
- BEFORE WRITING: Use your thought process to review the original ARCHITECTURAL PLANNING.
- CHECK PACING: "${pacingInstruction}"
- DECIDE: "What is the next specific event from the outline I need to write now?"
- Do NOT restart. Do NOT rewrite the intro. Do NOT repeat any existing text.
- Continue immediately from the last sentence in the excerpt.
- Keep POV rules: story body is entirely first-person (“tôi”), and “tôi” is the protagonist (not Morgan).
- Morgan Hayes may appear ONLY at the very end for the final outro, and ONLY after the protagonist’s story reaches its bad ending.

${lengthLine}
${mode === "finalize"
      ? `- End the story definitively (no cliffhanger): reveal the hidden structure/force, deliver a bad ending, then Morgan’s outro (include his thoughts).\n- The final line of the entire output MUST be exactly: ${OUTRO_SIGNATURE}`
      : `- Do NOT finish the story yet. Do NOT write Morgan’s outro yet. Keep escalating with new events and evidence; stop at a natural breakpoint without concluding.`}

STYLE & OUTPUT FORMAT
- Plain text only. No Markdown. Do NOT use emphasis markers or bullet lists.
- Insert a line break after each sentence for readability.
${flavorSection}${cacheSection}
${personalizationSection}

ANTI-CLICHÉ (MANDATORY — CONTINUATION)
- Do NOT restart with a generic reset line. Continue immediately.
- Avoid repeating boilerplate fear lines ("tôi đã nghĩ mình điên", "không ai tin tôi", etc.).
- Vary sentence openings; avoid too many consecutive sentences starting with the same 1-2 words.

STRUCTURE SEED (MANDATORY — CONTINUATION)
- Keep following the same structure directive (do NOT mention it explicitly):
"${structureDirective}"

UNIQUENESS MANDATORY (CRITICAL — CONTINUATION)
- Even though you are continuing an existing story, ensure the continuation maintains uniqueness.
- Do NOT fall into patterns from cache anchors when developing the story further.
- Vary the escalation: if previous parts were slow, accelerate; if previous were fast, slow down.
- Introduce new elements that haven't appeared in cache anchors.
- The continuation should feel fresh, not like a rehash of previous story structures.

TECH MINIMIZATION
- Keep technology references minimal and mundane, only when truly necessary.
- Keep the final truth grounded in present-day reality; avoid archival/system assimilation endings.
- The timeline remains present-day only; avoid future or sci-fi shifts.

${topicNote}

EXCERPT (FOR CONTEXT ONLY — DO NOT REPEAT):
"${excerpt}"

CONTINUE NOW.
`.trim();
};

export const streamUltraBizarreStory = async (
  topic: string,
  lang: Language,
  onChunk: (text: string) => void,
  options?: {
    signal?: AbortSignal;
    existingText?: string;
    seed?: string;
    cacheAnchors?: string[];
    onReasoningChunk?: (text: string) => void;
  }
) => {
  return streamStoryWithControls(topic, lang, onChunk, {
    ...options,
    useUltraBizarrePrompt: true
  });
};

export const streamStory = async (
  topic: string,
  lang: Language,
  onChunk: (text: string) => void
) => {
  return streamStoryWithControls(topic, lang, onChunk);
};

export const completeStoryWithOutro = async (
  text: string,
  language: Language,
  apiKey: string
): Promise<string> => {
  if (hasOutroSignature(text)) {
    return text;
  }

  try {
    const completionPrompt = `Hoàn thành truyện dưới đây bằng cách thêm phần kết thúc của Morgan Hayes. Phần kết thúc phải bao gồm:

1. Kết thúc bi thảm cho nhân vật chính (anh ta/cô ta chết, bị bắt, điên rồ, hoặc bị nuốt chửng)
2. Sau đó, Morgan Hayes đưa ra lời kết ngắn gọn về cảm xúc cá nhân và suy nghĩ của ông về câu chuyện này
3. Dòng cuối cùng phải chính xác là: "${OUTRO_SIGNATURE}"

Truyện cần hoàn thành:
---
${text}
---

Hãy viết phần kết thúc (khoảng 100-200 từ) theo đúng văn phong của Morgan Hayes và Radio Truyện Đêm Khuya.`;

    const messages: DeepSeekMessage[] = [
      { role: "system", content: "Bạn là Morgan Hayes, host của Radio Truyện Đêm Khuya. Hoàn thành truyện theo yêu cầu." },
      { role: "user", content: completionPrompt }
    ];

    const completion = await streamChatCompletion(
      messages,
      {
        temperature: 0.8,
        maxTokens: 500,
        model: TOPIC_MODEL,
      },
      apiKey,
      () => {},
      undefined,
      undefined
    );

    const cleanedCompletion = completion.trim();
    return text + '\n\n' + cleanedCompletion;
  } catch (error) {
    console.error('Failed to complete story with outro:', error);
    // Fallback: add a simple outro if completion fails
    return text + `\n\nMorgan Hayes: Đây là một lời cảnh tỉnh cho những ai dám tìm kiếm sự thật trong bóng tối. Có những cửa tốt hơn nên để đóng.

${OUTRO_SIGNATURE}`;
  }
};

export const streamStoryWithControls = async (
  topic: string,
  lang: Language,
  onChunk: (text: string) => void,
  options?: {
    signal?: AbortSignal;
    existingText?: string;
    seed?: string;
    cacheAnchors?: string[];
    onReasoningChunk?: (text: string) => void;
    useUltraBizarrePrompt?: boolean;
  }
) => {
  const apiKey = await getResolvedApiKey();
  if (!apiKey) throw new Error("API Key is missing");

  const personalization = await getStoryPersonalization();
  const storyModel = await getStoryModel();
  const storyTemperature = await getStoryTemperature();
  const lengthConfig = buildLengthConfig(personalization.targetWords);
  const flavorSeed =
    options?.seed || (options?.existingText?.trim() ? options.existingText : undefined);
  const maxCacheAnchors =
    Number.isFinite(MAX_CACHE_ANCHORS) && MAX_CACHE_ANCHORS > 0
      ? Math.floor(MAX_CACHE_ANCHORS)
      : 0;
  const cacheAnchors = maxCacheAnchors
    ? (options?.cacheAnchors || [])
      .map((anchor) => anchor.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, maxCacheAnchors)
    : [];

  const flavor = selectStoryFlavor(flavorSeed, cacheAnchors);
  const structureDirective = selectStoryStructure(flavorSeed, cacheAnchors, flavor);

  const allowBackground = await getAllowBackgroundGeneration();
  const isAndroidNative =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const nativeSupported = isAndroidNative
    ? (await BackgroundStory.isSupported().catch(() => ({ supported: false }))).supported
    : false;
  const shouldUseNative = isAndroidNative && nativeSupported && allowBackground;

  const maxTokens = Math.max(4096, DEFAULT_MAX_TOKENS);
  const baseText = options?.existingText?.trim() ? options.existingText : "";

  if (shouldUseNative) {
    try {
      const generated = await streamStoryNative(
        {
          apiKey,
          baseUrl: BASE_URL,
          model: storyModel,
          temperature: storyTemperature,
          topP: STORY_TOP_P,
          maxTokens: Math.max(4096, DEFAULT_MAX_TOKENS),
          storyMinWords: lengthConfig.minWords,
          storyTargetWords: lengthConfig.targetWords,
          storyHardMaxWords: lengthConfig.hardMaxWords,
          storyTimeoutMs: STORY_TIMEOUT_MS,
          storyContextWords: STORY_CONTEXT_WORDS,
          storyMaxPasses: STORY_MAX_PASSES,
          horrorLevel: personalization.horrorLevel,
          narrativeStyle: personalization.narrativeStyle,
          storyEngine: flavor.engine,
          storyRevealMethod: flavor.revealMethod,
          storyEndingMode: flavor.endingMode,
          storyTone: flavor.tone,
          storyProtagonistName: flavor.protagonistName,
          storyProtagonistRole: flavor.protagonistRole,
          storyPrimarySetting: flavor.primarySetting,
          storyEvidenceOrigin: flavor.evidenceOrigin,
          storyKeyMotif: flavor.keyMotif,
          storyIntroMood: flavor.introMood,
          outroSignature: OUTRO_SIGNATURE,
          language: lang,
          topic,
          existingText: baseText,
        },
        onChunk,
        options?.signal
      );
      if (generated && generated.length) {
        return generated;
      }
      console.warn("Native generation returned empty result; falling back to HTTP stream.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      console.warn("Native generation failed, falling back to HTTP stream:", error);
    }
  }

  let fullText = baseText;
  let newlyGeneratedText = "";

  const maxPasses = Math.max(1, Math.floor(STORY_MAX_PASSES || 1));
  const externalSignal = options?.signal;

  const runPass = async (prompt: string, isEmergency: boolean = false) => {
    const messages: DeepSeekMessage[] = [{ role: "user", content: prompt }];

    const controller = new AbortController();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    let timedOut = false;
    const timeoutId =
      Number.isFinite(STORY_TIMEOUT_MS) && STORY_TIMEOUT_MS > 0
        ? window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, STORY_TIMEOUT_MS)
        : null;

    let signatureReached = hasOutroSignature(fullText);
    
    // If we already have outro signature, don't continue
    if (signatureReached) {
      console.log("Outro signature already detected, stopping generation");
      return;
    }
    
    try {
      await streamChatCompletion(
        messages,
        { temperature: storyTemperature, maxTokens, signal: controller.signal, model: storyModel },
        apiKey,
        (chunk) => {
          // Check for outro signature before processing chunk
          if (signatureReached) return;
          
          const next = fullText + chunk;
          const { text: trimmed, truncated } = truncateAfterOutroSignature(next);
          
          if (truncated) {
            signatureReached = true;
            const delta = trimmed.slice(fullText.length);
            if (delta) {
              newlyGeneratedText += delta;
              onChunk(delta);
            }
            fullText = trimmed;
            console.log("Outro signature reached during streaming, stopping generation");
            return;
          }
          
          newlyGeneratedText += chunk;
          fullText = next;
          onChunk(chunk);
        },
        () => {
          // Stop if signature reached
          if (signatureReached) return true;
          
          // Check for outro signature in current text
          if (hasOutroSignature(fullText)) {
            signatureReached = true;
            console.log("Outro signature detected in stop check, stopping generation");
            return true;
          }
          
          const currentWords = countWords(fullText);
          // If emergency mode, allow up to 500 words OVER the hard limit to finish the outro
          if (isEmergency) {
             return lengthConfig.hardMaxWords ? currentWords >= (lengthConfig.hardMaxWords + 500) : false;
          }
          // Normal mode: strict hard limit
          return lengthConfig.hardMaxWords ? currentWords >= lengthConfig.hardMaxWords : false;
        },
        options?.onReasoningChunk
      );
    } catch (error) {
      if (timedOut) throw new Error("Story generation timed out.");
      throw error;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }

    // --- EMERGENCY CONTINUATION HANDLER ---
    // If we are in emergency mode (trying to finish) but the stream ended without the signature
    // (likely due to max_tokens cutoff), we must force a continuation to get the signature.
    if (isEmergency && !hasOutroSignature(fullText)) {
        console.warn("Emergency outro incomplete (likely token limit). forcing continuation...");
        // Recursive call to finish the thought
        await runPass("CONTINUE IMMEDIATELY. Finish the sentence and the signature.", true);
    }
  };

  for (let passIndex = 0; passIndex < maxPasses; passIndex++) {
    if (externalSignal?.aborted) {
      const abortError = new DOMException("Aborted", "AbortError");
      throw abortError;
    }
    
    // Enhanced check: if we already have outro signature, stop completely
    if (hasOutroSignature(fullText)) {
      console.log("Outro signature detected before pass " + (passIndex + 1) + ", stopping generation");
      break;
    }

    const wordsSoFar = countWords(fullText);
    const hardCapReached = lengthConfig.hardMaxWords
      ? wordsSoFar >= lengthConfig.hardMaxWords
      : false;
    const minReached = wordsSoFar >= lengthConfig.minWords;

    const isFirstPass = wordsSoFar === 0;
    const isLastPass = passIndex === maxPasses - 1;
    
    // Force finalize if we are approaching the ending (host voice detected)
    // or if we hit word limits/last pass
    const approachingEnd = isApproachingEnding(fullText);
    const mode: "continue" | "finalize" = minReached || hardCapReached || isLastPass || approachingEnd
      ? "finalize"
      : "continue";

    const prompt = isFirstPass
      ? (options?.useUltraBizarrePrompt 
        ? getUltraBizarrePrompt(lang, topic, personalization, lengthConfig, flavor, cacheAnchors, structureDirective)
        : getMorganHayesPrompt(lang, topic, personalization, lengthConfig, flavor, cacheAnchors, structureDirective))
      : getContinuationPrompt(
        lang,
        topic,
        fullText,
        mode,
        personalization,
        lengthConfig,
        flavor,
        cacheAnchors,
        structureDirective
      );

    const wordsBefore = countWords(fullText);
    await runPass(prompt, false); // Normal pass
    const wordsAfter = countWords(fullText);

    if (wordsAfter <= wordsBefore && !hasOutroSignature(fullText)) {
      console.warn(`Pass ${passIndex + 1} generated no new words. Aborting generation loop.`);
      break;
    }

    const doneEnough = wordsAfter >= lengthConfig.minWords;
    const finished = hasOutroSignature(fullText);
    const hitHardMax = lengthConfig.hardMaxWords
      ? wordsAfter >= lengthConfig.hardMaxWords
      : false;
    
    if (finished) break;
    
    // Emergency Outro Trigger:
    // 1. If it's the last pass and not finished.
    // 2. OR if we hit the hard max limit and not finished.
    // 3. OR if we are significantly over target (120%) and still going.
    const isOverTarget = lengthConfig.targetWords > 0 && wordsAfter > (lengthConfig.targetWords * 1.2);
    
    if ((isLastPass || hitHardMax || isOverTarget) && !finished) {
      console.warn(`Story incomplete (LastPass=${isLastPass}, HitHardMax=${hitHardMax}, OverTarget=${isOverTarget}). Forcing emergency outro.`);
      const emergencyOutroPrompt = `
      EMERGENCY OUTRO INSTRUCTION:
      You have exceeded the target length.
      The transmission is cutting off. You MUST end the story NOW.
      1. Deliver a swift, brutal conclusion to the protagonist's situation.
      2. Immediately switch to Morgan Hayes.
      3. Deliver the final signature: "${OUTRO_SIGNATURE}"
      Do not write any more plot development. END IT.
      `;
      await runPass(emergencyOutroPrompt, true); // Emergency pass (allow overdraft)
      break;
    }

    if (hitHardMax) break;
  }

  const totalWords = countWords(fullText);
  const finished = hasOutroSignature(fullText);
  
  // If story has outro signature but is below minimum length, that's acceptable
  // The story priority is completion over length when outro appears
  if (finished && totalWords < lengthConfig.minWords) {
    console.log(`Story completed with outro at ${totalWords} words (below minimum ${lengthConfig.minWords}) - accepting as complete`);
  } else if (totalWords < lengthConfig.minWords) {
    console.warn(`Story ended with ${totalWords} words, below minimum ${lengthConfig.minWords}`);
  }
  
  if (lengthConfig.hardMaxWords && totalWords > lengthConfig.hardMaxWords) {
    console.warn(
      `Story ended with ${totalWords} words, above hard max ${lengthConfig.hardMaxWords}`
    );
  }
  
  // Enhanced completion check - be more persistent about getting the outro signature
  // Only attempt auto-completion if story doesn't have outro AND meets minimum length requirement
  if (totalWords >= lengthConfig.minWords && !finished) {
    console.warn("Story reached minimum length but appears unfinished (missing outro signature).");
    
    // Try one more pass specifically to get the outro signature
    try {
      const outroPrompt = `Hoàn thành truyện dưới đây bằng cách thêm phần kết thúc của Morgan Hayes. Phần kết thúc phải bao gồm:

1. Kết thúc bi thảm cho nhân vật chính 
2. Morgan Hayes đưa ra lời kết ngắn gọn về cảm xúc và suy nghĩ
3. Dòng cuối cùng phải chính xác là: "${OUTRO_SIGNATURE}"

Truyện cần hoàn thành:
---
${fullText}
---

Hãy viết phần kết thúc (khoảng 100-200 từ) theo văn phong Morgan Hayes.`;

      const messages: DeepSeekMessage[] = [
        { role: "system", content: "Bạn là Morgan Hayes, host của Radio Truyện Đêm Khuya." },
        { role: "user", content: outroPrompt }
      ];

      const outroCompletion = await streamChatCompletion(
        messages,
        {
          temperature: 0.8,
          maxTokens: 500,
          model: TOPIC_MODEL,
        },
        apiKey,
        () => {},
        undefined,
        undefined
      );

      if (outroCompletion.trim()) {
        fullText += '\n\n' + outroCompletion.trim();
        console.log("Successfully added outro signature completion");
      }
    } catch (error) {
      console.error("Failed to add outro signature completion:", error);
    }
  }

  // Save story elements for future uniqueness checking
  saveElementsFromCompletedStory(fullText);

  return newlyGeneratedText;
};

// Save story elements for future uniqueness checking
const saveElementsFromCompletedStory = (text: string) => {
  if (text && text.trim().length > 100) {
    saveStoryElements(text);
  }
};

const streamStoryNative = async (
  config: {
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    storyMinWords: number;
    storyTargetWords: number;
    storyHardMaxWords: number;
    storyTimeoutMs: number;
    storyContextWords: number;
    storyMaxPasses: number;
    horrorLevel: number;
    narrativeStyle: NarrativeStyle;
    storyEngine: string;
    storyRevealMethod: string;
    storyEndingMode: string;
    storyTone: string;
    storyProtagonistName: string;
    storyProtagonistRole: string;
    storyPrimarySetting: string;
    storyEvidenceOrigin: string;
    storyKeyMotif: string;
    storyIntroMood: string;
    outroSignature: string;
    language: Language;
    topic: string;
    existingText: string;
  },
  onChunk: (text: string) => void,
  signal?: AbortSignal
) => {
  let received = config.existingText || "";
  let fullText = received;
  let done = false;
  let error: Error | null = null;
  let aborted = false;
  let lastActivity = Date.now();

  const chunkHandle = await BackgroundStory.addListener("storyChunk", (event: any) => {
    const text = typeof event?.text === "string" ? event.text : "";
    if (!text) return;
    received += text;
    fullText += text;
    onChunk(text);
    lastActivity = Date.now();
  });

  const doneHandle = await BackgroundStory.addListener("storyDone", (event: any) => {
    const text = typeof event?.text === "string" ? event.text : "";
    if (text) {
      fullText = text;
    }
    lastActivity = Date.now();
    done = true;
  });

  const errorHandle = await BackgroundStory.addListener("storyError", (event: any) => {
    const message = typeof event?.message === "string" ? event.message : "Generation failed";
    const aborted = Boolean(event?.aborted);
    error = aborted ? new DOMException("Aborted", "AbortError") : new Error(message);
    lastActivity = Date.now();
    done = true;
  });

  const abortHandler = () => {
    aborted = true;
    done = true;
    if (!error) {
      error = new DOMException("Aborted", "AbortError");
    }
    BackgroundStory.stop().catch(() => undefined);
  };
  if (signal) {
    if (signal.aborted) abortHandler();
    signal.addEventListener("abort", abortHandler, { once: true });
  }

  try {
    await BackgroundStory.start({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: config.maxTokens,
      storyMinWords: config.storyMinWords,
      storyTargetWords: config.storyTargetWords,
      storyHardMaxWords: config.storyHardMaxWords,
      storyTimeoutMs: config.storyTimeoutMs,
      storyContextWords: config.storyContextWords,
      storyMaxPasses: config.storyMaxPasses,
      horrorLevel: config.horrorLevel,
      narrativeStyle: config.narrativeStyle,
      storyEngine: config.storyEngine,
      storyRevealMethod: config.storyRevealMethod,
      storyEndingMode: config.storyEndingMode,
      storyTone: config.storyTone,
      storyProtagonistName: config.storyProtagonistName,
      storyProtagonistRole: config.storyProtagonistRole,
      storyPrimarySetting: config.storyPrimarySetting,
      storyEvidenceOrigin: config.storyEvidenceOrigin,
      storyKeyMotif: config.storyKeyMotif,
      storyIntroMood: config.storyIntroMood,
      outroSignature: config.outroSignature,
      language: config.language,
      topic: config.topic,
      existingText: config.existingText,
    });

    let cycles = 0;
    while (!done) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      cycles += 1;

      // If user aborted and background service stopped without emitting events,
      // exit to avoid spinning forever and burning CPU.
      if (aborted) {
        break;
      }

      // Fallback if native pipeline is idle for too long
      const idleMs = Date.now() - lastActivity;
      if (idleMs > 8000) {
        if (!error) {
          error = new Error("Native generation stalled (no activity).");
        }
        done = true;
        break;
      }

      if (cycles % 10 === 0) {
        const state = await BackgroundStory.getState().catch(() => null);
        const hasText = typeof state?.text === "string" && state.text.length > 0;
        if (state && !state.running) {
          if (hasText) {
            fullText = state.text;
          }
          done = true;
        }
      }
    }

    if (error) throw error;

    if (fullText.startsWith(received)) {
      const delta = fullText.slice(received.length);
      if (delta) onChunk(delta);
    }

    return fullText.slice(config.existingText.length);
  } finally {
    if (signal) signal.removeEventListener("abort", abortHandler);
    chunkHandle.remove();
    doneHandle.remove();
    errorHandle.remove();
  }
};

export const generateTopicBatch = async (lang: Language): Promise<string[]> => {
  const apiKey = await getResolvedApiKey();
  if (!apiKey) throw new Error("API Key is missing");

  const prompt = lang === "vi"
    ? `
Hãy tạo ra 15 tiêu đề cho các thư, email, băng ghi âm, vật chứng kèm ghi chú... gửi về Radio Truyện Đêm Khuya.
NGÔN NGỮ OUTPUT: Tiếng Việt.

YÊU CẦU:
- Mỗi tiêu đề phải nghe như lời thú tội, cầu cứu, cảnh báo hoặc tuyệt vọng của một người thật.
- Bối cảnh: người bình thường ở thập niên 2020 gặp 2-3 hiện tượng chồng chéo (nghịch lý thời gian, biến đổi sinh học, glitch thực tại, dấu tích thần thoại, ký sinh khái niệm, giấc mơ tràn vào đời thật, cổng không gian, ý thức tách khỏi thân xác, tín hiệu vũ trụ lạ...).
- Tránh tuyệt đối: tổ chức bí mật/chính phủ tuyển dụng, luật lệ creepypasta, SCP-style containment, “ký hợp đồng rồi im lặng”.
- Hạn chế công nghệ: không AI/app/VR/chip/phòng lab; nếu cần nhắc tới công nghệ thì chỉ ở mức đời thường.
- Ưu tiên bằng chứng analog/vật lý: vé tàu, hóa đơn, ảnh mờ, băng cassette, thư tay, nhật ký, biên nhận kỳ lạ.
- Không đánh số. Ngăn cách các tiêu đề bằng "|||".
`.trim()
    : `
Generate 15 subject lines for letters, emails, tapes, or physical evidence notes sent to the "Radio Truyện Đêm Khuya" show.
OUTPUT LANGUAGE: English.

REQUIREMENTS:
- Each line should feel like a confession, plea, warning, or desperate message from a real person.
- Setting: ordinary people in the 2020s facing 2–3 overlapping phenomena (temporal paradox + biological change, reality glitch + mythic trace, conceptual parasite + dream spillover, dimensional rift + cosmic signal, dislocated consciousness, etc.).
- Strictly avoid: secret organization/government recruitment, creepypasta law-based prompts, SCP-style containment, “sign the contract or be silenced”.
- Tech minimalism: no AI/app/VR/implants/labs; if tech appears, keep it mundane and necessary only.
- Prefer analog/physical evidence: train tickets, receipts, blurred photos, cassette tapes, handwritten letters, diaries, stamped notices.
- No numbering. Separate entries with "|||".
`.trim();

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TOPIC_MODEL,
        messages: [
          { role: "user", content: prompt },
        ],
        temperature: 0.9,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`DeepSeek API error ${response.status}: ${text}`);
    }

    const data = await response.json().catch(() => null);
    const rawText = data?.choices?.[0]?.message?.content?.trim()
      || data?.choices?.[0]?.text?.trim()
      || data?.output?.[0]?.content?.[0]?.text?.trim()
      || "";

    if (!rawText) return [];
    return rawText.split('|||').map(t => t.trim()).filter(t => t.length > 0);

  } catch (error) {
    console.error("Topic batch generation error:", error);
    return [];
  }
};

export const generateStoryTitle = async (lang: Language, topic: string, storyText?: string): Promise<string> => {
  const apiKey = await getResolvedApiKey();
  if (!apiKey) throw new Error("API Key is missing");

  // Nếu có topic, dùng topic làm tiêu đề
  if (topic && topic.trim().length > 0) {
    return topic.trim();
  }

  // Nếu không có topic, sinh tiêu đề từ đoạn đầu của truyện
  if (!storyText || storyText.trim().length === 0) {
    return lang === 'vi' ? 'Truyện không tên' : 'Untitled Story';
  }

  const prompt = lang === "vi"
    ? `Dựa vào đoạn truyện sau, hãy tạo một tiêu đề ngắn gọn (tối đa 10 từ) cho truyện này. Tiêu đề phải gợi lên bí ẩn, siêu nhiên hoặc thuyết âm mưu.
OUTPUT: Chỉ tiêu đề, không có giải thích thêm.
\n\nĐoạn truyện:\n${storyText.slice(0, 500)}`
    : `Based on the story excerpt below, create a short title (max 10 words) that evokes mystery, supernatural, or conspiracy themes.
OUTPUT: Only the title, no explanation.
\n\nStory excerpt:\n${storyText.slice(0, 500)}`;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TOPIC_MODEL,
        messages: [
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error ${response.status}`);
    }

    const data = await response.json().catch(() => null);
    const title = (data?.choices?.[0]?.message?.content?.trim()
      || data?.choices?.[0]?.text?.trim()
      || "").slice(0, 100);

    return title || (lang === 'vi' ? 'Truyện không tên' : 'Untitled Story');
  } catch (error) {
    console.error("Story title generation error:", error);
    return lang === 'vi' ? 'Truyện không tên' : 'Untitled Story';
  }
};

// Export the Ultra Bizarre prompt generator for external use
export const getUltraBizarreStoryPrompt = getUltraBizarrePrompt;

// Cleanup function to clear history and prevent memory leak
export const clearGenerationHistory = () => {
  // Keep only recent history to prevent unbounded memory growth
  if (flavorHistoryRef.length > MAX_FLAVOR_HISTORY) {
    const excess = flavorHistoryRef.length - MAX_FLAVOR_HISTORY;
    flavorHistoryRef.splice(0, excess);
  }
  
  if (storyElementsHistory.length > MAX_ELEMENTS_HISTORY) {
    const excess = storyElementsHistory.length - MAX_ELEMENTS_HISTORY;
    storyElementsHistory.splice(0, excess);
  }
  
  // Also clear old elements based on timestamp (older than 1 hour)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let i = 0;
  while (i < storyElementsHistory.length && storyElementsHistory[i].timestamp < oneHourAgo) {
    i++;
  }
  if (i > 0) {
    storyElementsHistory.splice(0, i);
  }
};


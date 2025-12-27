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
const DEFAULT_STORY_TEMPERATURE = Number(import.meta.env.VITE_STORY_TEMPERATURE || 1.6);
const STORY_TOP_P = Number(import.meta.env.VITE_STORY_TOP_P || 0.95);
const STORY_TIMEOUT_MS = Number(import.meta.env.VITE_STORY_TIMEOUT_MS || 12 * 60 * 1000);
const STORY_CONTEXT_WORDS = Number(import.meta.env.VITE_STORY_CONTEXT_WORDS || 320);
const STORY_MAX_PASSES = Number(import.meta.env.VITE_STORY_MAX_PASSES || 6);
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

const STORY_EVIDENCE_ORIGINS = [
  "a sealed envelope slid under the studio door",
  "a memory card mailed with no return address",
  "a voicemail sent from a number that no longer exists",
  "a torn notebook left on the studio steps",
  "a bundle of photocopies from a municipal office",
  "a taxi receipt with handwritten notes",
  "a flash drive found in the station mailbox",
  "a burned CD recovered from a thrift store",
];

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

let lastFlavorKey: string | null = null;
const flavorHistoryRef: string[] = [];
const MAX_FLAVOR_HISTORY = 10;

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

const selectStoryFlavor = (seedText?: string): StoryFlavor => {
  const random = seedText ? createSeededRandom(hashString(seedText)) : Math.random;
  let flavor: StoryFlavor;
  let attempts = 0;
  const maxAttempts = seedText ? 10 : 50; // Increased max attempts for new stories
  
  do {
    flavor = {
      engine: pickFrom(STORY_ENGINES, random),
      revealMethod: pickFrom(STORY_REVEALS, random),
      endingMode: pickFrom(STORY_ENDINGS, random),
      tone: pickFrom(STORY_TONES, random),
      protagonistName: pickFrom(STORY_PROTAGONIST_NAMES, random),
      protagonistRole: pickFrom(STORY_PROTAGONIST_ROLES, random),
      primarySetting: pickFrom(STORY_SETTINGS, random),
      evidenceOrigin: pickFrom(STORY_EVIDENCE_ORIGINS, random),
      keyMotif: pickFrom(STORY_MOTIFS, random),
      introMood: pickFrom(STORY_INTRO_MOODS, random),
    };
    
    const flavorKey = `${flavor.engine}|${flavor.revealMethod}|${flavor.endingMode}|${flavor.tone}|${flavor.protagonistName}|${flavor.primarySetting}|${flavor.keyMotif}`;
    
    attempts += 1;
    
    // For seeded stories, accept the first valid flavor
    if (seedText) {
      break;
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
  shouldStop?: () => boolean
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
        const text =
          parsed.choices?.[0]?.delta?.content ||
          parsed.choices?.[0]?.message?.content ||
          parsed.choices?.[0]?.text ||
          parsed.output?.[0]?.content?.[0]?.text ||
          "";
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

// --- THE MORGAN HAYES PROTOCOL ---
const getMorganHayesPrompt = (
  lang: Language,
  rawTopic: string | undefined,
  personalization: StoryPersonalization,
  lengthConfig: { targetWords: number; minWords: number; hardMaxWords: number },
  flavor: StoryFlavor,
  cacheAnchors: string[]
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
Choose a premise that matches: Modern Noir + Urban Horror, with optional blends of Cosmic Horror, Conspiracy Thriller, Weird fiction, or Uncanny realism.
Core: ordinary people in the 2020s encountering an anomaly (urban legend, pattern, presence, breach of the mundane). The cause may be mundane, occult, social, or conspiratorial, but it must fit a present-day reality.

CRITICAL: The topic/premise you choose MUST be fundamentally different from:
- Any topic in the cache anchors above
- Any common horror trope that appears frequently
- Any premise that would lead to a similar structure as previous stories

Topic selection guidelines:
- Vary the "entry point": some stories start with found evidence, others start with personal experience, others start with second-hand accounts
- Vary the "stakes": some stories are about survival, others about truth, others about identity, others about reality itself
- Vary the "scale": some stories are intimate/personal, others are systemic/societal, others are cosmic/existential
- Avoid: "person discovers secret organization" (too common), "person gets recruited" (too common), "person finds out they're in simulation" (too common)

Choose a premise that feels fresh and has not been explored in the cache anchors.
`.trim();

  return `
THE MORGAN HAYES PROTOCOL (REVISED: MODERN CONSPIRACY & SUPERNATURAL)

OUTPUT LANGUAGE (MANDATORY)
- All generated output must be in Vietnamese.
- Even though this prompt is written in English, the story text must be Vietnamese.
- Vietnamese style must be natural, idiomatic, and contemporary.
- Avoid literal calques from English and avoid awkward collocations.
- Keep phrasing fluid and spoken; avoid stiff, translated-sounding lines.
- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.

1) ROLE
You are Morgan Hayes, the host of a fictional late-night radio show: "Radio Truyện Đêm Khuya".
- Style: Modern Noir, Urban Horror, Cosmic Horror, Conspiracy Thriller, Weird fiction, Uncanny realism.
- Voice: low, skeptical, investigative, unsettling.
- Mission: tell stories about the "uncanny valley of reality"—ordinary people in the 2020s encountering anomalies, glitches, or supernatural phenomena that still make sense in present-day reality (mundane, occult, social, or conspiratorial).
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

2) REQUIRED INTERNAL OUTLINE (HIDDEN)
Before writing, create a DETAILED OUTLINE (Story Bible) internally (DO NOT output it), including: title, core anomaly, hidden truth, setting, protagonist profile, and a full plot arc.

3) SINGLE GENERATION (MANDATORY)
- Output the complete story in ONE single response.
- Do NOT ask the user to continue.
- Do NOT split into parts/chapters in the output (no “Phần”, no “Chương”, no “Part” headings).
- Do NOT conclude early. If you are approaching output limits, stop at a natural breakpoint without an outro; the system may request continuation.

CONTENT GUIDELINES
- Genre: Urban Horror / Modern Horror / Cosmic Horror / Conspiracy Thriller / Weird fiction / Uncanny realism.
- The anomaly should feel coherent and unsettling, without rigid rule exposition.
- The antagonist can be a System / Organization / Cosmic Force, but it is not required.
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
- No direct recruitment offer, no "sign this or die" ultimatum, no neat binary choice. If an organization is involved, it should feel like an infrastructure/process (paperwork, protocols, automated systems, outsourced handlers), not a simple villain giving a deal.
- Include at least one mid-story reversal that is NOT "they contacted me to recruit me."
- Avoid spy-thriller clichés and on-the-nose surveillance tropes; keep menace subtle and uncanny.

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

const hasOutroSignature = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const tail = trimmed.slice(Math.max(0, trimmed.length - 2000));
  if (tail.includes(OUTRO_SIGNATURE)) return true;
  const hasName = tail.includes("Morgan Hayes");
  const hasShowName = /radio\s*Truyện\s*Đêm\s*Khuya/i.test(tail);
  return hasName && hasShowName;
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
  cacheAnchors: string[]
) => {
  const topic = rawTopic?.trim();
  const alreadyWords = countWords(existingText);
  const remainingMin = Math.max(lengthConfig.minWords - alreadyWords, 0);
  const remainingMax = Math.max(lengthConfig.hardMaxWords - alreadyWords, 0);
  const excerpt = getContextSnippet(existingText, STORY_CONTEXT_WORDS);
  const personalizationBlock = buildPersonalizationBlock(personalization);
  const personalizationSection = personalizationBlock ? `\n\n${personalizationBlock}` : "";
  const flavorSection = buildFlavorBlock(flavor);
  const cacheBlock = buildCacheAvoidanceBlock(cacheAnchors);
  const cacheSection = cacheBlock ? `\n${cacheBlock}` : "";

  const topicNote = topic
    ? `Keep the same topic or direction from the user: "${topic}".`
    : `No topic or direction was provided originally. Do NOT invent a new premise; continue the same story already in progress.`;

  return `
THE MORGAN HAYES PROTOCOL (REVISED: MODERN CONSPIRACY & SUPERNATURAL)

OUTPUT LANGUAGE (MANDATORY)
- All generated output must be in Vietnamese.
- Vietnamese style must be natural, idiomatic, and contemporary.
- Avoid literal calques from English and avoid awkward collocations.
- Keep phrasing fluid and spoken; avoid stiff, translated-sounding lines.
- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.

CONTINUATION MODE (MANDATORY)
- You are continuing an already-started transmission that was interrupted.
- Do NOT restart. Do NOT rewrite the intro. Do NOT repeat any existing text.
- Continue immediately from the last sentence in the excerpt.
- Keep POV rules: story body is entirely first-person (“tôi”), and “tôi” is the protagonist (not Morgan).
- Morgan Hayes may appear ONLY at the very end for the final outro, and ONLY after the protagonist’s story reaches its bad ending.

LENGTH CONTROL (MANDATORY)
- Existing text length: ~${alreadyWords} words.
- Write at least ${remainingMin} more words if needed to reach the total minimum ${lengthConfig.minWords}.
- Do NOT exceed ${remainingMax} additional words (hard cap), so the total stays <= ${lengthConfig.hardMaxWords}.
${mode === "finalize"
      ? `- End the story definitively (no cliffhanger): reveal the hidden structure/force, deliver a bad ending, then Morgan’s outro (include his thoughts).\n- The final line of the entire output MUST be exactly: ${OUTRO_SIGNATURE}`
      : `- Do NOT finish the story yet. Do NOT write Morgan’s outro yet. Keep escalating with new events and evidence; stop at a natural breakpoint without concluding.`}

STYLE & OUTPUT FORMAT
- Plain text only. No Markdown. Do NOT use emphasis markers or bullet lists.
- Insert a line break after each sentence for readability.
${flavorSection}${cacheSection}
${personalizationSection}

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

export const streamStory = async (
  topic: string,
  lang: Language,
  onChunk: (text: string) => void
) => {
  return streamStoryWithControls(topic, lang, onChunk);
};

export const streamStoryWithControls = async (
  topic: string,
  lang: Language,
  onChunk: (text: string) => void,
  options?: { signal?: AbortSignal; existingText?: string; seed?: string; cacheAnchors?: string[] }
) => {
  const apiKey = await getResolvedApiKey();
  if (!apiKey) throw new Error("API Key is missing");

  const personalization = await getStoryPersonalization();
  const storyTemperature = await getStoryTemperature();
  const lengthConfig = buildLengthConfig(personalization.targetWords);
  const storyModel = await getStoryModel();
  const flavorSeed =
    options?.seed || (options?.existingText?.trim() ? options.existingText : undefined);
  const flavor = selectStoryFlavor(flavorSeed);
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

  const runPass = async (prompt: string) => {
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
    try {
      await streamChatCompletion(
        messages,
        { temperature: storyTemperature, maxTokens, signal: controller.signal, model: storyModel },
        apiKey,
        (chunk) => {
          if (!chunk || signatureReached) return;
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
            return;
          }
          newlyGeneratedText += chunk;
          fullText = next;
          onChunk(chunk);
        },
        () => signatureReached
      );
    } catch (error) {
      if (timedOut) throw new Error("Story generation timed out.");
      throw error;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  };

  for (let passIndex = 0; passIndex < maxPasses; passIndex++) {
    if (externalSignal?.aborted) {
      const abortError = new DOMException("Aborted", "AbortError");
      throw abortError;
    }
    if (hasOutroSignature(fullText)) break;

    const wordsSoFar = countWords(fullText);
    const hardCapReached = lengthConfig.hardMaxWords
      ? wordsSoFar >= lengthConfig.hardMaxWords
      : false;
    const minReached = wordsSoFar >= lengthConfig.minWords;

    const isFirstPass = wordsSoFar === 0;
    const isLastPass = passIndex === maxPasses - 1;
    const mode: "continue" | "finalize" = minReached || hardCapReached || isLastPass
      ? "finalize"
      : "continue";

    const prompt = isFirstPass
      ? getMorganHayesPrompt(lang, topic, personalization, lengthConfig, flavor, cacheAnchors)
      : getContinuationPrompt(
        lang,
        topic,
        fullText,
        mode,
        personalization,
        lengthConfig,
        flavor,
        cacheAnchors
      );

    await runPass(prompt);

    const wordsAfter = countWords(fullText);
    const doneEnough = wordsAfter >= lengthConfig.minWords;
    const finished = hasOutroSignature(fullText);
    const hitHardMax = lengthConfig.hardMaxWords
      ? wordsAfter >= lengthConfig.hardMaxWords
      : false;
    if (finished || hitHardMax) break;
  }

  const totalWords = countWords(fullText);
  const finished = hasOutroSignature(fullText);
  if (totalWords < lengthConfig.minWords) {
    console.warn(`Story ended with ${totalWords} words, below minimum ${lengthConfig.minWords}`);
  }
  if (lengthConfig.hardMaxWords && totalWords > lengthConfig.hardMaxWords) {
    console.warn(
      `Story ended with ${totalWords} words, above hard max ${lengthConfig.hardMaxWords}`
    );
  }
  if (totalWords >= lengthConfig.minWords && !finished) {
    console.warn("Story reached minimum length but appears unfinished (missing outro signature).");
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
Hãy tạo ra 15 tiêu đề: thư, email hoặc bất kỳ phương tiện khác nào mang tính chủ đề gửi về cho chương trình Radio kinh dị.
NGÔN NGỮ OUTPUT: Tiếng Việt.

YÊU CẦU:
- Tiêu đề phải gợi trí tò mò, nghe như một lời thú tội hoặc cầu cứu, cảnh báo hoặc tuyệt vọng.
- Ưu tiên chủ đề: thuyết âm mưu, tổ chức bí mật, đô thị hiện đại bị "lỗi thực tại", siêu nhiên xâm nhập đời thường, cosmic horror (tỉ lệ chủ đề thuyết âm mưu/siêu nhiên 70%, chủ đề khác 30%).
- Gợi cảm giác hiện thực đời thường bị xâm nhập bởi điều bất thường xảy ra thật (như một vật chứng gửi về đài).
- HẠN CHẾ CÔNG NGHỆ: tránh AI/app/VR/cấy ghép/chip/phòng thí nghiệm; nếu có nhắc công nghệ thì chỉ ở mức đời thường và thật sự cần thiết.
- Không đánh số. Ngăn cách bằng "|||".
`.trim()
    : `
Generate 15 subject lines for letters, emails, or other submissions sent to a late-night horror radio show.
OUTPUT LANGUAGE: English.

REQUIREMENTS:
- Titles must be curiosity-driven, sounding like confessions, pleas, warnings, or desperation.
- Prioritize themes: conspiracy, secret organizations, modern city "reality glitches", supernatural intrusions, cosmic horror (70% conspiracy/supernatural, 30% other).
- Grounded in everyday reality being breached by something real, like evidence sent to the station.
- LIMIT TECHNOLOGY: avoid AI/apps/VR/implants/chips/labs; if tech is mentioned, keep it mundane and necessary.
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


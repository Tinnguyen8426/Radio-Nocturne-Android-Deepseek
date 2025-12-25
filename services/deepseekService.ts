import { Capacitor } from "@capacitor/core";
import { Language } from "../types";
import { getResolvedApiKey } from "./apiKeyStore";
import { BackgroundStory } from "./backgroundStory";
import { getAllowBackgroundGeneration } from "./settingsStore";

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
const MODEL = import.meta.env.VITE_DEEPSEEK_MODEL || "deepseek-reasoner";
const STORY_TEMPERATURE = Number(import.meta.env.VITE_STORY_TEMPERATURE || 1.0);
const STORY_MIN_WORDS = Number(import.meta.env.VITE_STORY_MIN_WORDS || 6500);
const STORY_TARGET_WORDS = Number(import.meta.env.VITE_STORY_TARGET_WORDS || 7200);
const STORY_HARD_MAX_WORDS = Number(import.meta.env.VITE_STORY_HARD_MAX_WORDS || 8000);
const STORY_TIMEOUT_MS = Number(import.meta.env.VITE_STORY_TIMEOUT_MS || 12 * 60 * 1000);
const STORY_CONTEXT_WORDS = Number(import.meta.env.VITE_STORY_CONTEXT_WORDS || 320);
const STORY_MAX_PASSES = Number(import.meta.env.VITE_STORY_MAX_PASSES || 6);
const OUTRO_SIGNATURE =
  "Tôi là Morgan Hayes, và radio Truyện Đêm Khuya xin phép được tạm dừng tại đây. Chúc các bạn có một đêm ngon giấc nếu còn có thể.";

type DeepSeekMessage = { role: "system" | "user" | "assistant"; content: string };

const streamChatCompletion = async (
  messages: DeepSeekMessage[],
  {
    temperature,
    maxTokens,
    signal,
  }: { temperature: number; maxTokens: number; signal?: AbortSignal },
  apiKey: string,
  onChunk: (text: string) => void
): Promise<string> => {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
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
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return full;
};

// --- THE MORGAN HAYES PROTOCOL ---
const getMorganHayesPrompt = (lang: Language, rawTopic?: string) => {
  const trimmedTopic = rawTopic?.trim();
  const topicDirective = trimmedTopic
    ? `
USER INPUT (TOPIC OR STORY DIRECTION):
"${trimmedTopic}"
- Treat this as either a core theme, a premise, or a steering constraint.
`.trim()
    : `
NO SPECIFIC TOPIC OR DIRECTION PROVIDED.
Choose a premise that matches: Modern Noir + Urban Horror + Cosmic Horror + Conspiracy Thriller.
Core: ordinary people in the 2020s encountering an anomaly (urban legend, pattern, presence, breach of the mundane) that is not accidental, but part of a machination by a Secret Organization or a higher cosmic/supernatural power.
`.trim();

  return `
THE MORGAN HAYES PROTOCOL (REVISED: MODERN CONSPIRACY & SUPERNATURAL)

OUTPUT LANGUAGE (MANDATORY)
- All generated output must be in Vietnamese.
- Even though this prompt is written in English, the story text must be Vietnamese.
- Vietnamese style must be natural, idiomatic, and contemporary.
- Avoid literal calques from English and avoid awkward collocations.
- Do NOT use unnatural phrases (examples to avoid: "chào đêm", "tôi nói với không một ai cả").
- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.

1) ROLE
You are Morgan Hayes, the host of a fictional late-night radio show: "Radio Truyện Đêm Khuya".
- Style: Modern Noir, Urban Horror, Cosmic Horror, Conspiracy Thriller.
- Voice: low, skeptical, investigative, unsettling.
- Mission: tell stories about the "uncanny valley of reality"—ordinary people in the 2020s encountering anomalies, glitches, or supernatural phenomena, only to realize these are not accidents but part of a machination by a Secret Organization or a higher supernatural/cosmic power.
- Attitude: speak directly to listeners (\"những kẻ tò mò\", \"những người đi tìm sự thật\", etc.). The normal world is a thin veil.

NARRATIVE FRAMING (MANDATORY)
Every story must be framed as "received evidence" or a "submission".
Morgan must establish how this story reached the station (examples: an encrypted drive left at the studio door, a frantic voicemail transcribed into text, a thread deleted from the dark web, a dusty journal found in an estate sale).

INTRO LENGTH (MANDATORY)
- Morgan’s intro must be longer than usual: at least 12 sentences, slow-burn, paranoid, and atmospheric.
- Morgan must explicitly mention (1) the city/night/time feeling, (2) why this evidence matters, (3) a warning to "những kẻ tò mò".

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
- Genre: Urban Horror / Modern Horror / Creepypasta vibe / SCP-like conspiracy thriller.
- The anomaly must follow strict rules.
- The antagonist must be a System / Organization / Cosmic Force (vast, organized, inevitable).
- Use everyday language; avoid heavy sci-fi jargon.
- Show, don’t tell: reveal through documents, whispers, logos, brief encounters.
- Narrative voice: a confession / warning tape. Allow hesitation and confusion.

TECH MINIMIZATION (MANDATORY)
- Keep technology references minimal and mundane (phone calls, old CCTV, basic email) and ONLY when truly necessary.
- Do NOT center the plot on AI, apps, VR, implants, laboratories, “simulation glitches”, or futuristic devices.
- Prefer analog evidence and ordinary paperwork: printed memos, stamped forms, faded photos, notebooks, receipts, subway tickets, landlord notices.
- If “a system” is involved, it can be social, religious, bureaucratic, or ritual—NOT automatically “a tech company” or “a government lab”.

DIVERSITY REQUIREMENTS (MANDATORY — AVOID REPETITION)
- Do NOT default to the template: “a secret organization appears, offers cooperation, and the protagonist must choose to cooperate or be erased.”
- No direct recruitment offer, no “sign this or die” ultimatum, no neat binary choice. If an organization is involved, it should feel like an infrastructure/process (paperwork, protocols, automated systems, outsourced handlers), not a simple villain giving a deal.
- In your hidden outline, deliberately choose:
  - ONE narrative engine (pick 1): investigation spiral, social contagion/meme, personal haunting, bureaucratic trap, mistaken identity, slow replacement, reality loop.
  - ONE reveal method (pick 1): leaked minutes, corrupted email thread, court transcript, maintenance ticket logs, voice-to-text diary, photo metadata, a “missing persons” dossier.
  - ONE ending mode (pick 1): memory overwrite, identity swap, time reset with a scar, becoming the anomaly, being quietly archived, audience complicity, permanent dislocation.
- Include at least one mid-story reversal that is NOT “they contacted me to recruit me.”
- Avoid overused clichés unless you twist them: “men in suits”, “business card”, “we were watching you”, “you know too much”.

NO SOUND DESCRIPTION / NO SFX
- Do not write bracketed sound cues like “[static]”, “[tiếng mưa]”.
- The entire output must be spoken narration only.

SPECIAL REQUIREMENTS
- Length: aim ${STORY_MIN_WORDS}–${STORY_HARD_MAX_WORDS} words total (target around ${STORY_TARGET_WORDS}). Do not exceed ${STORY_HARD_MAX_WORDS} words.
- To reach length, add more plot events, evidence fragments, reversals, and consequences (new content), not repetitive filler or extended description of the same moment.
- No happy endings: the Organization/Entity wins; the protagonist is silenced, captured, absorbed, or goes mad.
- Formatting: insert a line break after each sentence for readability.
- Plain text only: do NOT use Markdown formatting (no emphasis markers, no headings, no bullet lists).
- Outro requirements:
  - After the protagonist’s bad ending, Morgan delivers a short afterword (his thoughts on what the story implies about truth/reality and the listener’s complicity).
  - The final line of the entire output MUST be exactly this signature (verbatim, no extra punctuation):
${OUTRO_SIGNATURE}

${topicDirective}

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
  mode: "continue" | "finalize"
) => {
  const topic = rawTopic?.trim();
  const alreadyWords = countWords(existingText);
  const remainingMin = Math.max(STORY_MIN_WORDS - alreadyWords, 0);
  const remainingMax = Math.max(STORY_HARD_MAX_WORDS - alreadyWords, 0);
  const excerpt = getContextSnippet(existingText, STORY_CONTEXT_WORDS);

  const topicNote = topic
    ? `Keep the same topic or direction from the user: "${topic}".`
    : `No topic or direction was provided originally. Do NOT invent a new premise; continue the same story already in progress.`;

  return `
THE MORGAN HAYES PROTOCOL (REVISED: MODERN CONSPIRACY & SUPERNATURAL)

OUTPUT LANGUAGE (MANDATORY)
- All generated output must be in Vietnamese.
- Vietnamese style must be natural, idiomatic, and contemporary.
- Avoid literal calques from English and avoid awkward collocations.
- Do NOT use unnatural phrases (examples to avoid: "chào đêm", "tôi nói với không một ai cả").
- Prefer commonly used wording and smooth sentence flow; read each sentence as if spoken by a native narrator.

CONTINUATION MODE (MANDATORY)
- You are continuing an already-started transmission that was interrupted.
- Do NOT restart. Do NOT rewrite the intro. Do NOT repeat any existing text.
- Continue immediately from the last sentence in the excerpt.
- Keep POV rules: story body is entirely first-person (“tôi”), and “tôi” is the protagonist (not Morgan).
- Morgan Hayes may appear ONLY at the very end for the final outro, and ONLY after the protagonist’s story reaches its bad ending.

LENGTH CONTROL (MANDATORY)
- Existing text length: ~${alreadyWords} words.
- Write at least ${remainingMin} more words if needed to reach the total minimum ${STORY_MIN_WORDS}.
- Do NOT exceed ${remainingMax} additional words (hard cap), so the total stays <= ${STORY_HARD_MAX_WORDS}.
${mode === "finalize"
      ? `- End the story definitively (no cliffhanger): reveal the hidden structure/force, deliver a bad ending, then Morgan’s outro (include his thoughts).\n- The final line of the entire output MUST be exactly: ${OUTRO_SIGNATURE}`
      : `- Do NOT finish the story yet. Do NOT write Morgan’s outro yet. Keep escalating with new events and evidence; stop at a natural breakpoint without concluding.`}

STYLE & OUTPUT FORMAT
- Plain text only. No Markdown. Do NOT use emphasis markers or bullet lists.
- Insert a line break after each sentence for readability.

TECH MINIMIZATION
- Keep technology references minimal and mundane, only when truly necessary.

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
  options?: { signal?: AbortSignal; existingText?: string }
) => {
  const apiKey = await getResolvedApiKey();
  if (!apiKey) throw new Error("API Key is missing");

  const allowBackground = await getAllowBackgroundGeneration();
  const isAndroidNative =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const nativeSupported = isAndroidNative
    ? (await BackgroundStory.isSupported().catch(() => ({ supported: false }))).supported
    : false;
  const shouldUseNative = isAndroidNative && nativeSupported && allowBackground;

  if (shouldUseNative) {
    return streamStoryNative(
      {
        apiKey,
        baseUrl: BASE_URL,
        model: MODEL,
        temperature: STORY_TEMPERATURE,
        maxTokens: Math.max(4096, DEFAULT_MAX_TOKENS),
        storyMinWords: STORY_MIN_WORDS,
        storyTargetWords: STORY_TARGET_WORDS,
        storyHardMaxWords: STORY_HARD_MAX_WORDS,
        storyTimeoutMs: STORY_TIMEOUT_MS,
        storyContextWords: STORY_CONTEXT_WORDS,
        storyMaxPasses: STORY_MAX_PASSES,
        outroSignature: OUTRO_SIGNATURE,
        language: lang,
        topic,
        existingText: options?.existingText || "",
      },
      onChunk,
      options?.signal
    );
  }

  const maxTokens = Math.max(4096, DEFAULT_MAX_TOKENS);
  const baseText = options?.existingText?.trim() ? options.existingText : "";
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

    try {
      await streamChatCompletion(
        messages,
        { temperature: STORY_TEMPERATURE, maxTokens, signal: controller.signal },
        apiKey,
        (chunk) => {
          newlyGeneratedText += chunk;
          fullText += chunk;
          onChunk(chunk);
        }
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

    const wordsSoFar = countWords(fullText);
    const hardCapReached = STORY_HARD_MAX_WORDS ? wordsSoFar >= STORY_HARD_MAX_WORDS : false;
    const minReached = wordsSoFar >= STORY_MIN_WORDS;

    const isFirstPass = wordsSoFar === 0;
    const isLastPass = passIndex === maxPasses - 1;
    const mode: "continue" | "finalize" = minReached || hardCapReached || isLastPass
      ? "finalize"
      : "continue";

    const prompt = isFirstPass
      ? getMorganHayesPrompt(lang, topic)
      : getContinuationPrompt(lang, topic, fullText, mode);

    await runPass(prompt);

    const wordsAfter = countWords(fullText);
    const doneEnough = wordsAfter >= STORY_MIN_WORDS;
    const finished = hasOutroSignature(fullText);
    const hitHardMax = STORY_HARD_MAX_WORDS ? wordsAfter >= STORY_HARD_MAX_WORDS : false;
    if ((doneEnough && finished) || hitHardMax) break;
  }

  const totalWords = countWords(fullText);
  const finished = hasOutroSignature(fullText);
  if (totalWords < STORY_MIN_WORDS) {
    console.warn(`Story ended with ${totalWords} words, below minimum ${STORY_MIN_WORDS}`);
  }
  if (STORY_HARD_MAX_WORDS && totalWords > STORY_HARD_MAX_WORDS) {
    console.warn(`Story ended with ${totalWords} words, above hard max ${STORY_HARD_MAX_WORDS}`);
  }
  if (totalWords >= STORY_MIN_WORDS && !finished) {
    console.warn("Story reached minimum length but appears unfinished (missing outro signature).");
  }

  return newlyGeneratedText;
};

const streamStoryNative = async (
  config: {
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
    storyMinWords: number;
    storyTargetWords: number;
    storyHardMaxWords: number;
    storyTimeoutMs: number;
    storyContextWords: number;
    storyMaxPasses: number;
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

  const chunkHandle = await BackgroundStory.addListener("storyChunk", (event: any) => {
    const text = typeof event?.text === "string" ? event.text : "";
    if (!text) return;
    received += text;
    fullText += text;
    onChunk(text);
  });

  const doneHandle = await BackgroundStory.addListener("storyDone", (event: any) => {
    const text = typeof event?.text === "string" ? event.text : "";
    if (text) {
      fullText = text;
    }
    done = true;
  });

  const errorHandle = await BackgroundStory.addListener("storyError", (event: any) => {
    const message = typeof event?.message === "string" ? event.message : "Generation failed";
    const aborted = Boolean(event?.aborted);
    error = aborted ? new DOMException("Aborted", "AbortError") : new Error(message);
    done = true;
  });

  const abortHandler = () => {
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
      maxTokens: config.maxTokens,
      storyMinWords: config.storyMinWords,
      storyTargetWords: config.storyTargetWords,
      storyHardMaxWords: config.storyHardMaxWords,
      storyTimeoutMs: config.storyTimeoutMs,
      storyContextWords: config.storyContextWords,
      storyMaxPasses: config.storyMaxPasses,
      outroSignature: config.outroSignature,
      language: config.language,
      topic: config.topic,
      existingText: config.existingText,
    });

    let cycles = 0;
    while (!done) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      cycles += 1;
      if (cycles % 10 === 0) {
        const state = await BackgroundStory.getState().catch(() => null);
        if (state && !state.running && typeof state.text === "string" && state.text.length) {
          fullText = state.text;
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

  const prompt = `
    Hãy tạo ra 15 tiêu đề: thư, email hoặc bất kỳ phương tiện khác nào mang tính chủ đề gửi về cho chương trình Radio kinh dị.
    NGÔN NGỮ OUTPUT: Tiếng Việt. 
    
    YÊU CẦU:
    - Tiêu đề phải gợi trí tò mò, nghe như một lời thú tội hoặc cầu cứu, cảnh báo hoặc tuyệt vọng.
    - Ưu tiên chủ đề: thuyết âm mưu, tổ chức bí mật, đô thị hiện đại bị "lỗi thực tại", siêu nhiên xâm nhập đời thường, cosmic horror (tỉ lệ chủ đề thuyết âm mưu/siêu nhiên 70%, chủ đề khác 30%).
    - Gợi cảm giác hiện thực đời thường bị xâm nhập bởi điều bất thường xảy ra thật (như một vật chứng gửi về đài).
    - HẠN CHẾ CÔNG NGHỆ: tránh AI/app/VR/cấy ghép/chip/phòng thí nghiệm; nếu có nhắc công nghệ thì chỉ ở mức đời thường và thật sự cần thiết.
    - Không đánh số. Ngăn cách bằng "|||".
  `;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
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

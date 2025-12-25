/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEEPSEEK_API_KEY?: string;
  readonly VITE_DEEPSEEK_BASE_URL?: string;
  readonly VITE_DEEPSEEK_MAX_TOKENS?: string;
  readonly VITE_DEEPSEEK_MODEL?: string;
  readonly VITE_STORY_TEMPERATURE?: string;
  readonly VITE_STORY_MIN_WORDS?: string;
  readonly VITE_STORY_TARGET_WORDS?: string;
  readonly VITE_STORY_HARD_MAX_WORDS?: string;
  readonly VITE_STORY_TIMEOUT_MS?: string;
  readonly VITE_STORY_CONTEXT_WORDS?: string;
  readonly VITE_STORY_MAX_PASSES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const KEY_BACKGROUND = 'allowBackgroundGeneration';
const KEY_PERSONALIZATION = 'storyPersonalization';
const KEY_STORY_MODEL = 'storyModel';
const KEY_REUSE_CACHE = 'reuseStoryCache';

export type NarrativeStyle = 'default' | 'confession' | 'dossier' | 'diary' | 'investigation';
export type StoryModel = 'deepseek-chat' | 'deepseek-reasoner';

export interface StoryPersonalization {
  horrorLevel: number;
  narrativeStyle: NarrativeStyle;
  targetWords: number;
}

const STORY_TARGET_WORDS = Number(import.meta.env.VITE_STORY_TARGET_WORDS || 7200);
const ENV_STORY_MODEL = import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-reasoner';
export const TARGET_MIN_WORDS = 2000;
export const TARGET_MAX_WORDS = 10000;
export const TARGET_MIN_OFFSET = 700;
export const TARGET_MAX_OFFSET = 800;

const NARRATIVE_STYLES: NarrativeStyle[] = [
  'default',
  'confession',
  'dossier',
  'diary',
  'investigation',
];
const STORY_MODELS: StoryModel[] = ['deepseek-reasoner', 'deepseek-chat'];

export const DEFAULT_STORY_PERSONALIZATION: StoryPersonalization = {
  horrorLevel: 50,
  narrativeStyle: 'default',
  targetWords: STORY_TARGET_WORDS,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeStoryModel = (input?: string | null): StoryModel => {
  if (STORY_MODELS.includes(input as StoryModel)) {
    return input as StoryModel;
  }
  if (STORY_MODELS.includes(ENV_STORY_MODEL as StoryModel)) {
    return ENV_STORY_MODEL as StoryModel;
  }
  return 'deepseek-reasoner';
};

const normalizePersonalization = (
  input: Partial<StoryPersonalization> | null | undefined
): StoryPersonalization => {
  const horrorRaw = typeof input?.horrorLevel === 'number'
    ? input.horrorLevel
    : DEFAULT_STORY_PERSONALIZATION.horrorLevel;
  const narrativeRaw = NARRATIVE_STYLES.includes(input?.narrativeStyle as NarrativeStyle)
    ? (input?.narrativeStyle as NarrativeStyle)
    : DEFAULT_STORY_PERSONALIZATION.narrativeStyle;
  const targetRaw = typeof input?.targetWords === 'number'
    ? input.targetWords
    : DEFAULT_STORY_PERSONALIZATION.targetWords;

  return {
    horrorLevel: clamp(Math.round(horrorRaw), 0, 100),
    narrativeStyle: narrativeRaw,
    targetWords: clamp(Math.round(targetRaw), TARGET_MIN_WORDS, TARGET_MAX_WORDS),
  };
};

export const getAllowBackgroundGeneration = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    const raw = localStorage.getItem(KEY_BACKGROUND);
    return raw ? raw === 'true' : true;
  }
  const { value } = await Preferences.get({ key: KEY_BACKGROUND });
  if (value === null || value === undefined || value === '') return true;
  return value === 'true';
};

export const setAllowBackgroundGeneration = async (value: boolean) => {
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(KEY_BACKGROUND, String(value));
    return;
  }
  await Preferences.set({ key: KEY_BACKGROUND, value: String(value) });
};

export const getStoryPersonalization = async (): Promise<StoryPersonalization> => {
  if (!Capacitor.isNativePlatform()) {
    const raw = localStorage.getItem(KEY_PERSONALIZATION);
    if (!raw) return DEFAULT_STORY_PERSONALIZATION;
    try {
      const parsed = JSON.parse(raw) as Partial<StoryPersonalization>;
      return normalizePersonalization(parsed);
    } catch {
      return DEFAULT_STORY_PERSONALIZATION;
    }
  }

  const { value } = await Preferences.get({ key: KEY_PERSONALIZATION });
  if (!value) return DEFAULT_STORY_PERSONALIZATION;
  try {
    const parsed = JSON.parse(value) as Partial<StoryPersonalization>;
    return normalizePersonalization(parsed);
  } catch {
    return DEFAULT_STORY_PERSONALIZATION;
  }
};

export const getReuseStoryCache = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    const raw = localStorage.getItem(KEY_REUSE_CACHE);
    return raw ? raw === 'true' : false;
  }
  const { value } = await Preferences.get({ key: KEY_REUSE_CACHE });
  if (value === null || value === undefined || value === '') return false;
  return value === 'true';
};

export const setReuseStoryCache = async (value: boolean) => {
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(KEY_REUSE_CACHE, String(value));
    return;
  }
  await Preferences.set({ key: KEY_REUSE_CACHE, value: String(value) });
};

export const setStoryPersonalization = async (value: StoryPersonalization) => {
  const normalized = normalizePersonalization(value);
  const payload = JSON.stringify(normalized);
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(KEY_PERSONALIZATION, payload);
    return;
  }
  await Preferences.set({ key: KEY_PERSONALIZATION, value: payload });
};

export const getStoryModel = async (): Promise<StoryModel> => {
  if (!Capacitor.isNativePlatform()) {
    const raw = localStorage.getItem(KEY_STORY_MODEL);
    return normalizeStoryModel(raw);
  }
  const { value } = await Preferences.get({ key: KEY_STORY_MODEL });
  return normalizeStoryModel(value);
};

export const setStoryModel = async (value: StoryModel) => {
  const normalized = normalizeStoryModel(value);
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(KEY_STORY_MODEL, normalized);
    return;
  }
  await Preferences.set({ key: KEY_STORY_MODEL, value: normalized });
};

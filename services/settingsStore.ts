import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

const SETTINGS_DB = 'radio_nocturne_settings';
const SETTINGS_DB_VERSION = 1;
const SETTINGS_TABLE = 'settings';
const WEB_KEY = 'radio_nocturne_settings_v1';

const KEY_BACKGROUND = 'allowBackgroundGeneration';
const KEY_PERSONALIZATION = 'storyPersonalization';
const KEY_STORY_MODEL = 'storyModel';
const KEY_REUSE_CACHE = 'reuseStoryCache';
const KEY_STORY_TEMPERATURE = 'storyTemperature';
const KEY_TTS_RATE = 'ttsRate';
const KEY_TTS_PITCH = 'ttsPitch';

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

const DEFAULT_STORY_TEMPERATURE = 1.6;
const MIN_TEMPERATURE = 0.1;
const MAX_TEMPERATURE = 2.0;

const MIN_TTS_RATE = 0.5;
const MAX_TTS_RATE = 2.0;
const MIN_TTS_PITCH = 0.5;
const MAX_TTS_PITCH = 2.0;

let sqlite: SQLiteConnection | null = null;
let db: SQLiteDBConnection | null = null;
const isNative = Capacitor.isNativePlatform();

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

const ensureDb = async () => {
  if (!isNative) return null;
  if (!sqlite) {
    sqlite = new SQLiteConnection(CapacitorSQLite);
  }
  if (!db) {
    db = await sqlite.createConnection(SETTINGS_DB, false, 'no-encryption', SETTINGS_DB_VERSION, false);
    await db.open();
    await db.execute(
      `CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );`
    );
  }
  return db;
};

const readWebSettings = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(WEB_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeWebSettings = (settings: Record<string, string>) => {
  localStorage.setItem(WEB_KEY, JSON.stringify(settings));
};

const getSetting = async (key: string): Promise<string | undefined> => {
  if (!isNative) {
    const settings = readWebSettings();
    return settings[key];
  }
  const database = await ensureDb();
  if (!database) return undefined;
  const result = await database.query(`SELECT value FROM ${SETTINGS_TABLE} WHERE key = ?`, [key]);
  return result.values?.[0]?.value;
};

const setSetting = async (key: string, value: string) => {
  if (!isNative) {
    const settings = readWebSettings();
    settings[key] = value;
    writeWebSettings(settings);
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.run(
    `INSERT OR REPLACE INTO ${SETTINGS_TABLE} (key, value) VALUES (?, ?)`,
    [key, value]
  );
};

const removeSetting = async (key: string) => {
  if (!isNative) {
    const settings = readWebSettings();
    delete settings[key];
    writeWebSettings(settings);
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.run(`DELETE FROM ${SETTINGS_TABLE} WHERE key = ?`, [key]);
};

export const initSettingsStore = async () => {
  if (!isNative) return;
  await ensureDb();
};

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
  const raw = await getSetting(KEY_BACKGROUND);
  if (raw === null || raw === undefined || raw === '') return true;
  return raw === 'true';
};

export const setAllowBackgroundGeneration = async (value: boolean) => {
  await setSetting(KEY_BACKGROUND, String(value));
};

export const getStoryPersonalization = async (): Promise<StoryPersonalization> => {
  const raw = await getSetting(KEY_PERSONALIZATION);
  if (!raw) return DEFAULT_STORY_PERSONALIZATION;
  try {
    const parsed = JSON.parse(raw) as Partial<StoryPersonalization>;
    return normalizePersonalization(parsed);
  } catch {
    return DEFAULT_STORY_PERSONALIZATION;
  }
};

export const getReuseStoryCache = async (): Promise<boolean> => {
  const raw = await getSetting(KEY_REUSE_CACHE);
  if (raw === null || raw === undefined || raw === '') return false;
  return raw === 'true';
};

export const setReuseStoryCache = async (value: boolean) => {
  await setSetting(KEY_REUSE_CACHE, String(value));
};

export const setStoryPersonalization = async (value: StoryPersonalization) => {
  const normalized = normalizePersonalization(value);
  const payload = JSON.stringify(normalized);
  await setSetting(KEY_PERSONALIZATION, payload);
};

export const getStoryModel = async (): Promise<StoryModel> => {
  const raw = await getSetting(KEY_STORY_MODEL);
  return normalizeStoryModel(raw);
};

export const setStoryModel = async (value: StoryModel) => {
  const normalized = normalizeStoryModel(value);
  await setSetting(KEY_STORY_MODEL, normalized);
};

export const getStoryTemperature = async (): Promise<number> => {
  const defaultValue = Number(import.meta.env.VITE_STORY_TEMPERATURE || DEFAULT_STORY_TEMPERATURE);
  const raw = await getSetting(KEY_STORY_TEMPERATURE);
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clamp(parsed, MIN_TEMPERATURE, MAX_TEMPERATURE) : defaultValue;
};

export const setStoryTemperature = async (value: number) => {
  const normalized = clamp(value, MIN_TEMPERATURE, MAX_TEMPERATURE);
  await setSetting(KEY_STORY_TEMPERATURE, String(normalized));
};

export const getTtsRate = async (): Promise<number> => {
  const raw = await getSetting(KEY_TTS_RATE);
  if (!raw) return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clamp(parsed, MIN_TTS_RATE, MAX_TTS_RATE) : 1;
};

export const setTtsRate = async (value: number) => {
  const normalized = clamp(value, MIN_TTS_RATE, MAX_TTS_RATE);
  await setSetting(KEY_TTS_RATE, String(normalized));
};

export const getTtsPitch = async (): Promise<number> => {
  const raw = await getSetting(KEY_TTS_PITCH);
  if (!raw) return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clamp(parsed, MIN_TTS_PITCH, MAX_TTS_PITCH) : 1;
};

export const setTtsPitch = async (value: number) => {
  const normalized = clamp(value, MIN_TTS_PITCH, MAX_TTS_PITCH);
  await setSetting(KEY_TTS_PITCH, String(normalized));
};

export const clearSettings = async () => {
  await Promise.all([
    removeSetting(KEY_BACKGROUND),
    removeSetting(KEY_PERSONALIZATION),
    removeSetting(KEY_STORY_MODEL),
    removeSetting(KEY_REUSE_CACHE),
    removeSetting(KEY_STORY_TEMPERATURE),
    removeSetting(KEY_TTS_RATE),
    removeSetting(KEY_TTS_PITCH),
  ]);
};

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = 'deepseekApiKey';
const FALLBACK_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || '';

let cachedKey: string | null = null;

const getStoredKey = async () => {
  if (!Capacitor.isNativePlatform()) {
    return localStorage.getItem(STORAGE_KEY) || '';
  }
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  return value || '';
};

const setStoredKey = async (value: string) => {
  if (!Capacitor.isNativePlatform()) {
    if (value) {
      localStorage.setItem(STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    return;
  }
  if (value) {
    await Preferences.set({ key: STORAGE_KEY, value });
  } else {
    await Preferences.remove({ key: STORAGE_KEY });
  }
};

export const getResolvedApiKey = async () => {
  if (cachedKey !== null) return cachedKey;
  const stored = await getStoredKey();
  cachedKey = stored || FALLBACK_KEY;
  return cachedKey;
};

export const getStoredApiKey = async () => {
  if (cachedKey !== null && cachedKey !== FALLBACK_KEY) {
    return cachedKey;
  }
  const stored = await getStoredKey();
  if (stored) cachedKey = stored;
  return stored;
};

export const setApiKey = async (value: string) => {
  const trimmed = value.trim();
  await setStoredKey(trimmed);
  cachedKey = trimmed || FALLBACK_KEY;
};

export const clearApiKey = async () => {
  await setStoredKey('');
  cachedKey = FALLBACK_KEY;
};

export const hasFallbackApiKey = () => Boolean(FALLBACK_KEY);

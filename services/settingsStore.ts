import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const KEY_BACKGROUND = 'allowBackgroundGeneration';

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

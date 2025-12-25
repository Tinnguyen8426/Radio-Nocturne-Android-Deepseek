import type { PluginListenerHandle } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

export interface BackgroundTtsPlugin {
  speak(options: {
    text: string;
    rate: number;
    pitch: number;
    language: string;
    utteranceId: string;
    title?: string;
  }): Promise<void>;
  stop(): Promise<void>;
  shutdown(): Promise<void>;
  isSupported(): Promise<{ supported: boolean }>;
  openTtsSettings(): Promise<void>;
  installTtsData(): Promise<void>;
  addListener(
    eventName: 'ttsProgress' | 'ttsDone' | 'ttsStart' | 'ttsError',
    listenerFunc: (event: any) => void
  ): Promise<PluginListenerHandle>;
}

export const BackgroundTts = registerPlugin<BackgroundTtsPlugin>('BackgroundTts');

import type { PluginListenerHandle } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

export interface BackgroundStoryPlugin {
  start(options: {
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
    horrorLevel: number;
    narrativeStyle: string;
    outroSignature: string;
    language: string;
    topic: string;
    existingText: string;
  }): Promise<void>;
  stop(): Promise<void>;
  isSupported(): Promise<{ supported: boolean }>;
  getState(): Promise<{ running: boolean; text: string }>;
  addListener(
    eventName: 'storyChunk' | 'storyDone' | 'storyError',
    listenerFunc: (event: any) => void
  ): Promise<PluginListenerHandle>;
}

export const BackgroundStory = registerPlugin<BackgroundStoryPlugin>('BackgroundStory');

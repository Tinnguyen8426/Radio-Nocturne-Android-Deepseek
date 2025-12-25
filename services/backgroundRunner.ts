import type { PluginListenerHandle } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

export interface BackgroundRunnerPlugin {
  start(options?: { title?: string }): Promise<void>;
  stop(): Promise<void>;
  isSupported(): Promise<{ supported: boolean }>;
  addListener(
    eventName: 'runnerError',
    listenerFunc: (event: any) => void
  ): Promise<PluginListenerHandle>;
}

export const BackgroundRunner = registerPlugin<BackgroundRunnerPlugin>('BackgroundRunner');

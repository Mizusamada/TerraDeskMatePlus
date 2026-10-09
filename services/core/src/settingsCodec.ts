import { AppConfig, defaultConfig, mergeConfig } from '../../../packages/contracts/src/index.js';

export interface StoredSettings {
  config: AppConfig;
  updatedAt: string;
}

export function encodeSettings(config: AppConfig): string {
  return JSON.stringify({ config: mergeConfig(config), updatedAt: new Date().toISOString() }, null, 2);
}

export function decodeSettings(raw: string): AppConfig {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    return mergeConfig(parsed.config ?? defaultConfig);
  } catch {
    return mergeConfig(defaultConfig);
  }
}

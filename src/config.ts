import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = path.join(ROOT, 'pip.config.json');

export type PipConfig = {
  PIP_VOICE: string;
  VOICE_SPEED: number;
  TIMEZONE: string;
  SLOTS: string[];
  TIKTOK_PRIVACY: string;
  TIKTOK_POST_MODE: 'direct' | 'inbox';
  CLAUDE_MODEL: string;
  WHISPER_MODEL: 'tiny.en' | 'base.en' | 'small.en';
  MONTHLY_MINUTES_WARNING: number;
};

export const config: PipConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
export const MODELS_DIR = path.resolve(ROOT, process.env.PIP_MODELS_DIR ?? '.models');
export const OUT_DIR = path.resolve(ROOT, process.env.PIP_OUT_DIR ?? 'out');

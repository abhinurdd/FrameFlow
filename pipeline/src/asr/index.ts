import type { AsrProvider } from '../types.ts';
import { deepgram } from './deepgram.ts';
import { elevenlabs } from './elevenlabs.ts';
import { sarvam } from './sarvam.ts';

// Still to add for the bakeoff: Whisper large-v3 (hosted) and Google Chirp.
export const PROVIDERS: Record<string, AsrProvider> = { elevenlabs, deepgram, sarvam };

export function getProvider(name: string): AsrProvider {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown ASR provider "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  if (!process.env[p.envKey]) throw new Error(`${p.envKey} is not set (put it in pipeline/.env.local)`);
  return p;
}

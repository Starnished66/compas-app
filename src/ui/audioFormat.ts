import { RemoteTrack } from '../data/types';

export interface AudioFormat {
  codec: string | null;
  bitDepth: string | null;
  sampleRate: string | null;
  lossy: boolean;
  hiRes: boolean;
  parts: string[];
  line: string;
  quality: string;
}

const LOSSY_CODECS = new Set(['MP3', 'AAC', 'OGG', 'VORBIS', 'OPUS', 'WMA', 'M4A', 'MP2']);
const CD_BIT_DEPTH = 16;
const CD_SAMPLE_RATE_HZ = 44100;
const MAX_STANDARD_SAMPLE_RATE_HZ = 48000;

export function formatSampleRate(hz: number): string {
  if (hz >= 1_000_000) return `${trimDecimals(hz / 1_000_000)} MHz`;
  return `${trimDecimals(hz / 1000)} kHz`;
}

function trimDecimals(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function positive(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null;
}

function qualityDescription(hiRes: boolean, lossy: boolean, bits: number | null, rate: number | null): string {
  if (hiRes) return 'Hi-res · above CD quality (16-bit · 44.1 kHz)';
  if (lossy) return 'Compressed · smaller files, some detail removed';
  if (bits === CD_BIT_DEPTH && rate === CD_SAMPLE_RATE_HZ) return 'CD quality · lossless';
  return 'Lossless';
}

export function describeAudioFormat(track: RemoteTrack | null | undefined): AudioFormat | null {
  if (!track) return null;
  const codec = track.codec?.trim() ? track.codec.trim().toUpperCase() : null;
  const bits = positive(track.sourceBitDepth);
  const rate = positive(track.sourceSampleRateHz);
  if (!codec && !bits && !rate) return null;
  const lossy = codec != null && LOSSY_CODECS.has(codec);
  const hiRes = !lossy && (codec === 'DSD' || (bits ?? 0) > CD_BIT_DEPTH || (rate ?? 0) > MAX_STANDARD_SAMPLE_RATE_HZ);
  const bitDepth = bits ? `${bits}-bit` : null;
  const sampleRate = rate ? formatSampleRate(rate) : null;
  const parts = [codec, bitDepth, sampleRate].filter((part): part is string => Boolean(part));
  return {
    codec,
    bitDepth,
    sampleRate,
    lossy,
    hiRes,
    parts,
    line: parts.join(' · '),
    quality: qualityDescription(hiRes, lossy, bits, rate),
  };
}

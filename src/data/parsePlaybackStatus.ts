import { parseDacMode } from './dacMode';
import { jsonBoolean, nullableJsonBoolean, parseRating } from './remoteApiProtocol';
import type { PlaybackStatus } from './types';

export function parsePlaybackStatus(json: any): PlaybackStatus {
  const dacMode = parseDacMode(json.dac_mode, json.bluetooth_dac_mode);
  return {
    dacMode,
    playing: jsonBoolean(json.playing),
    paused: jsonBoolean(json.paused),
    title: String(json.title || ''),
    artist: String(json.artist || ''),
    album: String(json.album || ''),
    positionSeconds: Number(json.position_seconds || 0),
    durationSeconds: Number(json.duration_seconds || 0),
    volume: Number(json.volume || 0),
    playMode: Number(json.play_mode || 0),
    codec: json.codec ? String(json.codec) : '',
    sourceBitDepth: Number(json.source_bit_depth || 0),
    sourceSampleRateHz: Number(json.source_sample_rate || 0),
    bluetoothAudioOutput: nullableJsonBoolean(json.bluetooth_audio_output, 'bluetooth_audio_output'),
    favorite: json.favorite == null ? null : jsonBoolean(json.favorite),
    rating: parseRating(json.rating),
    accentColor: typeof json.accent_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(json.accent_color)
      ? json.accent_color.toUpperCase()
      : null,
    deviceModel: typeof json.device_model === 'string' && json.device_model.trim() ? json.device_model.trim() : null,
    playerVersion: typeof json.player_version === 'string' && json.player_version.trim() ? json.player_version.trim() : null,
    settingsRevision: Number.isSafeInteger(json.settingsRevision) ? json.settingsRevision : null,
    settingsEpoch: Number.isSafeInteger(json.settingsEpoch) ? json.settingsEpoch : null,
    collectionJob: json.collection_job && Number.isSafeInteger(json.collection_job.id) &&
      ['idle', 'pending', 'done', 'error'].includes(json.collection_job.state)
      ? { id: json.collection_job.id, state: json.collection_job.state, error: typeof json.collection_job.error === 'string' ? json.collection_job.error : null }
      : null,
  };
}

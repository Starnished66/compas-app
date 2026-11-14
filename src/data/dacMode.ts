export type DacMode = 'none' | 'bluetooth' | 'usb';

export function parseDacMode(value: unknown, legacyBluetoothValue: unknown): DacMode {
  if (value === 'bluetooth' || value === 'usb') return value;
  return legacyBluetoothValue === true ? 'bluetooth' : 'none';
}

export type DacTranslate = (source: string) => string;

export interface DacText {
  title: string;
  subtitle: string;
}

/** Translated DAC title and status line, or null when no DAC mode is active. */
export function dacModeText(mode: DacMode | undefined, playing: boolean, t: DacTranslate): DacText | null {
  if (mode === 'usb') {
    return { title: t('USB DAC'), subtitle: playing ? t('Receiving USB audio') : t('Waiting for USB audio') };
  }
  if (mode === 'bluetooth') {
    return { title: t('Bluetooth DAC'), subtitle: playing ? t('Receiving Bluetooth audio') : t('Waiting for Bluetooth audio') };
  }
  return null;
}

/** The track as it should be shown: the DAC title and status line replace its metadata while a DAC mode is active. */
export function dacDisplayTrack<T extends { title: string; artist: string; album: string }>(
  track: T,
  mode: DacMode | undefined,
  playing: boolean,
  t: DacTranslate,
): T {
  const text = dacModeText(mode, playing, t);
  return text ? { ...track, title: text.title, artist: text.subtitle, album: '' } : track;
}

export function isDacActive(mode: DacMode | undefined): boolean {
  return mode !== undefined && mode !== 'none';
}

export function dacControlsDisabled(mode: DacMode | undefined): boolean {
  return isDacActive(mode);
}

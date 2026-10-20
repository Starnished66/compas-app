import { RemoteAction } from '../../data/types';

export function playCollection(
  onAction: (action: RemoteAction) => void,
  songIds: string[],
  shuffle: boolean,
  shuffleActive: boolean,
  supportsNativeCollectionPlayback = false,
) {
  if (supportsNativeCollectionPlayback) {
    onAction({ type: 'PlayCollection', shuffle });
    return;
  }
  if (!songIds.length) return;
  if (shuffle !== shuffleActive) onAction({ type: 'ToggleShuffle' });
  const id = shuffle ? songIds[Math.floor(Math.random() * songIds.length)] : songIds[0];
  onAction({ type: 'SelectLibraryEntry', id });
}

import { RemoteAction } from '../../../data/types';
import { playCollection } from '../collectionPlayback';

describe('playCollection', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses native collection playback even when song pages are not loaded', () => {
    const onAction = jest.fn<void, [RemoteAction]>();
    playCollection(onAction, [], true, false, true);
    expect(onAction).toHaveBeenCalledWith({ type: 'PlayCollection', shuffle: true });
  });

  it('keeps legacy loaded-track playback when native collection playback is unavailable', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const onAction = jest.fn<void, [RemoteAction]>();
    playCollection(onAction, ['track-1', 'track-2'], true, false);
    expect(onAction).toHaveBeenNthCalledWith(1, { type: 'ToggleShuffle' });
    expect(onAction).toHaveBeenNthCalledWith(2, { type: 'SelectLibraryEntry', id: 'track-2' });
  });

  it('does not start legacy playback with no loaded tracks', () => {
    const onAction = jest.fn<void, [RemoteAction]>();
    playCollection(onAction, [], false, false);
    expect(onAction).not.toHaveBeenCalled();
  });
});

import { joinSdPath, planTransfer, sdParent } from '../transferPlan';

describe('planTransfer', () => {
  it('recreates picked folders under the destination, parents first, once each', () => {
    const plan = planTransfer([
      { path: '/s/Album/01.flac', name: '01.flac', relativeDir: 'Album', size: 10 },
      { path: '/s/Album/CD2/01.flac', name: '01.flac', relativeDir: 'Album/CD2', size: 20 },
      { path: '/s/Album/cover.jpg', name: 'cover.jpg', relativeDir: 'Album', size: 5 },
      { path: '/s/single.mp3', name: 'single.mp3', relativeDir: '', size: 7 },
    ], 'Music');
    expect(plan.directories).toEqual([['Music', 'Album'], ['Music/Album', 'CD2']]);
    expect(plan.uploads.map((upload) => upload.destination)).toEqual(['Music/Album', 'Music/Album/CD2', 'Music/Album', 'Music']);
    expect(plan.totalBytes).toBe(42);
  });

  it('writes into the SD card root without a leading slash', () => {
    const plan = planTransfer([{ path: '/s/A/x.flac', name: 'x.flac', relativeDir: 'A', size: 1 }], '');
    expect(plan.directories).toEqual([['', 'A']]);
    expect(plan.uploads[0].destination).toBe('A');
  });
});

describe('SD paths', () => {
  it('joins and walks up relative card paths', () => {
    expect(joinSdPath('', 'Music')).toBe('Music');
    expect(joinSdPath('Music', 'A')).toBe('Music/A');
    expect(sdParent('Music/A')).toBe('Music');
    expect(sdParent('Music')).toBe('');
    expect(sdParent('')).toBeNull();
  });
});

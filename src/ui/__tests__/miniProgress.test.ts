import { PlaybackMode } from '../../data/types';
import { COMET_SEGMENT_COUNT, cometSegmentDash } from '../cometSegments';
import { resolveMiniProgressStyle } from '../miniProgress';
import { pointOnPerimeter, roundedRectPerimeter } from '../roundedRectPerimeter';

describe('resolveMiniProgressStyle', () => {
  it('uses the bar by default and the ring while repeating one song', () => {
    expect(resolveMiniProgressStyle('auto', PlaybackMode.Sequential)).toBe('bar');
    expect(resolveMiniProgressStyle('auto', PlaybackMode.RepeatAll)).toBe('bar');
    expect(resolveMiniProgressStyle('auto', PlaybackMode.RepeatOne)).toBe('ring');
  });

  it('keeps an explicit choice regardless of playback mode', () => {
    expect(resolveMiniProgressStyle('card', PlaybackMode.RepeatOne)).toBe('card');
    expect(resolveMiniProgressStyle('bar', PlaybackMode.RepeatOne)).toBe('bar');
  });
});

describe('roundedRectPerimeter', () => {
  it('measures a circle and starts at its top centre', () => {
    const perimeter = roundedRectPerimeter({ width: 46, height: 46, radius: 23, strokeWidth: 2 });
    expect(perimeter.length).toBeCloseTo(2 * Math.PI * 22, 5);
    expect(pointOnPerimeter(perimeter, 0)).toEqual({ x: 23, y: 1 });
    const half = pointOnPerimeter(perimeter, 0.5);
    expect(half.x).toBeCloseTo(23, 5);
    expect(half.y).toBeCloseTo(45, 5);
  });

  it('wraps fractions past a full lap', () => {
    const perimeter = roundedRectPerimeter({ width: 200, height: 60, radius: 18, strokeWidth: 2 });
    const quarter = pointOnPerimeter(perimeter, 0.25);
    const nextLap = pointOnPerimeter(perimeter, 1.25);
    expect(nextLap.x).toBeCloseTo(quarter.x, 5);
    expect(nextLap.y).toBeCloseTo(quarter.y, 5);
  });
});

describe('cometSegmentDash', () => {
  it('draws the lead segment from the lap start to the head', () => {
    const dash = cometSegmentDash(0, 2, 0.25, false, 100);
    expect(dash.visible).toBe(true);
    expect(dash.strokeDasharray).toEqual([25, 75]);
    expect(dash.strokeDashoffset).toBeCloseTo(0);
  });

  it('shortens later segments towards the head', () => {
    const dash = cometSegmentDash(COMET_SEGMENT_COUNT / 2, 0, 0.5, false, 100);
    expect(dash.strokeDasharray).toEqual([25, 75]);
    expect(dash.strokeDashoffset).toBeCloseTo(-25);
  });

  it('hides segments with nothing to draw', () => {
    expect(cometSegmentDash(3, 1, 0, false, 100).visible).toBe(false);
  });

  it('trails a full lap behind the head once a song loops', () => {
    const dash = cometSegmentDash(0, 1, 0.3, true, 100);
    expect(dash.strokeDasharray[0]).toBeCloseTo(100);
    expect(dash.strokeDashoffset).toBeCloseTo(-30);
  });
});

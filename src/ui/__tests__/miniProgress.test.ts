import { PlaybackMode } from '../../data/types';
import { resolveMiniProgressStyle } from '../miniProgress';
import { roundedRectPerimeter } from '../roundedRectPerimeter';

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
    expect(perimeter.pointAt(0)).toEqual({ x: 23, y: 1 });
    const half = perimeter.pointAt(0.5);
    expect(half.x).toBeCloseTo(23, 5);
    expect(half.y).toBeCloseTo(45, 5);
  });

  it('wraps fractions past a full lap', () => {
    const perimeter = roundedRectPerimeter({ width: 200, height: 60, radius: 18, strokeWidth: 2 });
    const quarter = perimeter.pointAt(0.25);
    const nextLap = perimeter.pointAt(1.25);
    expect(nextLap.x).toBeCloseTo(quarter.x, 5);
    expect(nextLap.y).toBeCloseTo(quarter.y, 5);
  });
});

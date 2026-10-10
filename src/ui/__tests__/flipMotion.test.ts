import { FlipMotion, offsetAt, sortRole, verticalDirection } from '../library/flipMotion';

const linear = (progress: number) => progress;
const VIEWPORT = 800;
const row = (y: number) => ({ x: 0, y, width: 360, height: 64 });

describe('offsetAt', () => {
  const motion: FlipMotion = { from: { x: 0, y: -200, opacity: 0 }, startedAt: 1000, delay: 100, duration: 400 };

  it('holds the start offset during the delay and reaches rest at the end', () => {
    expect(offsetAt(motion, 1050, linear)).toEqual({ x: 0, y: -200, opacity: 0 });
    expect(offsetAt(motion, 1500, linear)).toEqual({ x: 0, y: 0, opacity: 1 });
    expect(offsetAt(motion, 9999, linear)).toEqual({ x: 0, y: 0, opacity: 1 });
  });

  it('interpolates mid-flight so an interrupted sort can continue from where rows are drawn', () => {
    expect(offsetAt(motion, 1300, linear)).toEqual({ x: 0, y: -100, opacity: 0.5 });
  });

  it('dips opacity through the travel value and back to fully opaque', () => {
    const dipped: FlipMotion = { ...motion, from: { x: 0, y: 300, opacity: 1 }, dipOpacity: 0.2 };
    expect(offsetAt(dipped, 1300, linear).opacity).toBeCloseTo(0.2);
    expect(offsetAt(dipped, 1200, linear).opacity).toBeCloseTo(0.6);
    expect(offsetAt(dipped, 1500, linear).opacity).toBe(1);
  });
});

describe('sortRole', () => {
  it('moves rows that are on screen before and after', () => {
    expect(sortRole(row(100), row(500), VIEWPORT)).toBe('move');
  });

  it('enters rows that arrive from off screen or were not mounted', () => {
    expect(sortRole(row(2400), row(100), VIEWPORT)).toBe('enter');
    expect(sortRole(undefined, row(100), VIEWPORT)).toBe('enter');
  });

  it('leaves rows alone whose new position is off screen, however they were placed before', () => {
    expect(sortRole(row(100), row(2400), VIEWPORT)).toBe('rest');
    expect(sortRole(undefined, row(-300), VIEWPORT)).toBe('rest');
  });

  it('counts a partly visible row as on screen', () => {
    expect(sortRole(row(-40), row(780), VIEWPORT)).toBe('move');
  });
});

describe('verticalDirection', () => {
  it('points from one rect toward the other and defaults to downward', () => {
    expect(verticalDirection(row(500), row(100))).toBe(-1);
    expect(verticalDirection(row(100), row(500))).toBe(1);
    expect(verticalDirection(row(100), undefined)).toBe(1);
  });
});

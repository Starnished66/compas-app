import { rowShift, shiftUpdates } from '../dragShifts';

const HEIGHT = 56;

function updatesFor(from: number, previous: number, next: number, applied: Record<number, number> = {}) {
  return shiftUpdates(from, previous, next, HEIGHT, (index) => applied[index] ?? 0);
}

describe('rowShift', () => {
  it('moves rows between the origin and the target toward the gap', () => {
    expect(rowShift(3, 2, 4, HEIGHT)).toBe(-HEIGHT);
    expect(rowShift(1, 3, 0, HEIGHT)).toBe(HEIGHT);
    expect(rowShift(2, 2, 4, HEIGHT)).toBe(0);
    expect(rowShift(5, 2, 4, HEIGHT)).toBe(0);
  });
});

describe('shiftUpdates', () => {
  it('animates only the row crossed when dragging one step down', () => {
    expect(updatesFor(2, 2, 3)).toEqual([{ index: 3, shift: -HEIGHT }]);
    expect(updatesFor(2, 3, 4, { 3: -HEIGHT })).toEqual([{ index: 4, shift: -HEIGHT }]);
  });

  it('returns a crossed row to rest when dragging back', () => {
    expect(updatesFor(2, 4, 3, { 3: -HEIGHT, 4: -HEIGHT })).toEqual([{ index: 4, shift: 0 }]);
  });

  it('handles a jump across the origin in one update', () => {
    const applied = { 3: -HEIGHT, 4: -HEIGHT };
    expect(updatesFor(2, 4, 0, applied)).toEqual([
      { index: 0, shift: HEIGHT },
      { index: 1, shift: HEIGHT },
      { index: 3, shift: 0 },
      { index: 4, shift: 0 },
    ]);
  });

  it('never touches rows outside the crossed range or the dragged row', () => {
    const indices = updatesFor(10, 10, 12).map((update) => update.index);
    expect(indices).toEqual([11, 12]);
  });
});

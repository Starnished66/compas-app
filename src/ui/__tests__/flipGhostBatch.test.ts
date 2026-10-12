import { FlipGhostBatch } from '../library/flipGhostBatch';

const ghost = (id: number) => ({ id });

describe('FlipGhostBatch', () => {
  it('keeps every ghost until the last running one finishes', () => {
    const batch = new FlipGhostBatch<{ id: number }>();
    batch.add([ghost(1), ghost(2)]);
    expect(batch.finish(1)).toBe(false);
    expect(batch.current.map((item) => item.id)).toEqual([1, 2]);
    expect(batch.finish(2)).toBe(true);
    expect(batch.current).toEqual([]);
  });

  it('extends a running batch with ghosts added later', () => {
    const batch = new FlipGhostBatch<{ id: number }>();
    batch.add([ghost(1)]);
    const extended = batch.add([ghost(2)]);
    expect(extended.map((item) => item.id)).toEqual([1, 2]);
    expect(batch.finish(1)).toBe(false);
    expect(batch.finish(2)).toBe(true);
  });

  it('ignores repeated and unknown finishes', () => {
    const batch = new FlipGhostBatch<{ id: number }>();
    batch.add([ghost(1), ghost(2)]);
    expect(batch.finish(1)).toBe(false);
    expect(batch.finish(1)).toBe(false);
    expect(batch.finish(7)).toBe(false);
    expect(batch.current).toHaveLength(2);
  });

  it('keeps the list identity when nothing is added', () => {
    const batch = new FlipGhostBatch<{ id: number }>();
    const before = batch.add([ghost(1)]);
    expect(batch.add([])).toBe(before);
  });
});

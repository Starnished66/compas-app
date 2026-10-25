import { insertedOffset, QueueEnds } from '../queueInsertion';

const ends = (total: number, head: number[], tail: number[] = head): QueueEnds => ({ total, head, tail });

describe('insertedOffset', () => {
  it('finds a song inserted near the top even when it is already queued further down', () => {
    expect(insertedOffset(ends(4, [1, 2, 3, 9]), ends(5, [1, 9, 2, 3, 9]), 9)).toBe(1);
  });

  it('finds a song appended at the end', () => {
    expect(insertedOffset(ends(30, [1, 2], [7, 8]), ends(31, [1, 2], [8, 9]), 9)).toBe(30);
  });

  it('gives up when the queue changed in some other way', () => {
    expect(insertedOffset(ends(4, [1, 2, 3, 4]), ends(5, [5, 1, 2, 3, 4]), 9)).toBeNull();
    expect(insertedOffset(ends(4, [1, 2]), ends(6, [9, 1, 2]), 9)).toBeNull();
  });
});

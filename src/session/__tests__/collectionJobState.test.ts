import { collectionJobSettled } from '../collectionJobState';

describe('collection job reconciliation', () => {
  it('keeps a matching pending job busy but settles completed and failed jobs', () => {
    expect(collectionJobSettled(4, 0, { id: 4, state: 'pending', error: null }, 100)).toBe(false);
    expect(collectionJobSettled(4, 0, { id: 4, state: 'done', error: null }, 100)).toBe(true);
    expect(collectionJobSettled(4, 0, { id: 4, state: 'error', error: 'Changed' }, 100)).toBe(true);
  });
  it('settles an overwritten terminal result or a player restart instead of waiting forever', () => {
    expect(collectionJobSettled(4, 0, { id: 5, state: 'pending', error: null }, 100)).toBe(true);
    expect(collectionJobSettled(4, 0, { id: 0, state: 'idle', error: null }, 100)).toBe(true);
  });
  it('bounds reconciliation if a player never reports completion', () => {
    expect(collectionJobSettled(4, 0, null, 120001)).toBe(true);
    expect(collectionJobSettled(4, 0, { id: 4, state: 'pending', error: null }, 120001)).toBe(true);
  });
});

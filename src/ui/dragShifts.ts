export interface ShiftUpdate {
  index: number;
  shift: number;
}

export function rowShift(index: number, from: number, target: number, rowHeight: number): number {
  if (index === from) return 0;
  if (from < index && index <= target) return -rowHeight;
  if (target <= index && index < from) return rowHeight;
  return 0;
}

export function shiftUpdates(
  from: number,
  previousTarget: number,
  nextTarget: number,
  rowHeight: number,
  currentShift: (index: number) => number,
): ShiftUpdate[] {
  const updates: ShiftUpdate[] = [];
  const first = Math.min(previousTarget, nextTarget);
  const last = Math.max(previousTarget, nextTarget);
  for (let index = first; index <= last; index += 1) {
    const shift = rowShift(index, from, nextTarget, rowHeight);
    if (shift !== currentShift(index)) updates.push({ index, shift });
  }
  return updates;
}

// Moves one slot of a per-index array the same way the list reorders its items, so state bound to a row (its
// animated value, its cached style) follows that row's item instead of staying with the index it left.
export function moveSlot<T>(slots: T[], from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= slots.length || to >= slots.length) return;
  const [slot] = slots.splice(from, 1);
  slots.splice(to, 0, slot);
}

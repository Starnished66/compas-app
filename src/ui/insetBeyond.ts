export function insetBeyond(inset: number, ownPadding: number): number {
  return Math.max(0, inset - ownPadding);
}

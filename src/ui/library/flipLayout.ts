import { Dimensions, type HostInstance } from 'react-native';
import type { ReactNode } from 'react';
import type { FlipNode, FlipValues } from './flipRegistry';
import { intersectsViewport, shiftRect, snapshotsBeforeFlip, type FlipMode, type FlipOffset, type FlipRect } from './flipMotion';

export interface BoxSnapshot {
  rect: FlipRect;
  opacity: number;
  content?: ReactNode;
}

export function measure(ref: { current: unknown }): FlipRect | null {
  const element = ref.current as Partial<HostInstance> | null;
  if (!element || typeof element.getBoundingClientRect !== 'function') return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export function viewportHeight(): number {
  return Dimensions.get('window').height;
}

export function isVisible(rect: FlipRect): boolean {
  return intersectsViewport(rect, viewportHeight());
}

export function byPosition(a: FlipRect, b: FlipRect): number {
  return a.y - b.y || a.x - b.x;
}

export function snapshotLayout(
  nodes: Iterable<FlipNode>,
  mode: FlipMode,
  now: number,
  freeze: (values: FlipValues, now: number) => FlipOffset,
) {
  const boxes = new Map<string, BoxSnapshot>();
  const arts = new Map<string, FlipRect>();
  for (const node of nodes) {
    if (!snapshotsBeforeFlip(mode, node.part)) continue;
    const layout = measure(node.ref);
    if (!layout) continue;
    const offset = freeze(node.values, now);
    const rect = shiftRect(layout, offset);
    if (node.part === 'box') {
      boxes.set(node.key, { rect, opacity: offset.opacity, content: isVisible(rect) ? node.content : undefined });
    } else if (isVisible(rect)) {
      arts.set(node.key, rect);
    }
  }
  return { boxes, arts };
}

import type { DerivedValue } from 'react-native-reanimated';

export type CollapseProgress = DerivedValue<number>;

export type CollapseStage = 'expanded' | 'mostlyExpanded' | 'mostlyCollapsed' | 'collapsed';

const FADE_SPLIT = 0.5;
const COMPACT_THRESHOLD = 0.5;
const SETTLED_EPSILON = 0.001;

export function clampUnit(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

export function between(progress: number, expanded: number, collapsed: number): number {
  'worklet';
  return expanded + (collapsed - expanded) * progress;
}

export function fadeOnCollapse(progress: number): number {
  'worklet';
  return clampUnit(1 - progress / FADE_SPLIT);
}

export function fadeInOnCollapse(progress: number): number {
  'worklet';
  return clampUnit((progress - FADE_SPLIT) / (1 - FADE_SPLIT));
}

export function collapseProgress(offset: number, distance: number, collapsible: boolean): number {
  'worklet';
  return collapsible ? clampUnit(offset / distance) : 0;
}

export function collapseStage(progress: number): CollapseStage {
  'worklet';
  if (progress <= SETTLED_EPSILON) return 'expanded';
  if (progress >= 1 - SETTLED_EPSILON) return 'collapsed';
  return progress > COMPACT_THRESHOLD ? 'mostlyCollapsed' : 'mostlyExpanded';
}

export function isCompactStage(stage: CollapseStage): boolean {
  return stage === 'mostlyCollapsed' || stage === 'collapsed';
}

export function isNearListEnd(offset: number, viewport: number, content: number, distance: number): boolean {
  'worklet';
  return viewport > 0 && offset + viewport >= content - distance;
}

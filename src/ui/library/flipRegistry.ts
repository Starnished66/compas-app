import { ReactNode, createContext } from 'react';
import { Animated, Dimensions } from 'react-native';
import type { HostInstance } from 'react-native';
import type { IconName } from '../components/iconPaths';
import { Durations, Easings, staggerDelay } from '../motion';
import { FlipGhostBatch } from './flipGhostBatch';
import {
  FlipMode,
  FlipMotion,
  FlipOffset,
  FlipPart,
  FlipRect,
  REST_OFFSET,
  intersectsViewport,
  measuresAfterFlip,
  offsetAt,
  shiftRect,
  snapshotsBeforeFlip,
  sortRole,
  verticalDirection,
} from './flipMotion';

export type { FlipMode, FlipPart, FlipRect } from './flipMotion';

export interface FlipArtwork {
  uri?: string | null;
  radius: 'sm' | 'md' | 'lg' | 'full';
  placeholderIcon: IconName;
}

export interface FlipValues {
  translateX: Animated.Value;
  translateY: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
}

export interface FlipNode {
  key: string;
  part: FlipPart;
  ref: { current: unknown };
  values: FlipValues;
  artwork?: FlipArtwork;
  content?: ReactNode;
}

interface FlipGhostBase {
  id: number;
  delay: number;
  onDone: () => void;
}

export interface FlipArtGhostSpec extends FlipGhostBase {
  kind: 'art';
  artwork: FlipArtwork;
  from: FlipRect;
  to: FlipRect;
}

export interface FlipRowGhostSpec extends FlipGhostBase {
  kind: 'row';
  content: ReactNode;
  rect: FlipRect;
  opacity: number;
  drift: number;
}

export type FlipGhostSpec = FlipArtGhostSpec | FlipRowGhostSpec;

interface BoxSnapshot {
  rect: FlipRect;
  opacity: number;
  content?: ReactNode;
}

interface FlipRun {
  motion?: FlipMotion;
}

interface PendingFlip {
  mode: FlipMode;
  boxes: Map<string, BoxSnapshot>;
  arts: Map<string, FlipRect>;
  landed: Map<string, FlipRect>;
  shown: Set<string>;
  order: Map<string, number>;
  played: Set<string>;
  started: boolean;
  until: number;
}

const FLIP_WINDOW_MS = 400;
const STAGGER_MAX_INDEX = 10;
const VIEW_CONTENT_SHIFT = 6;
const ART_ENTER_SCALE = 0.9;
const ART_ENTER_MS = 320;
const SORT_ENTER_SHIFT = 16;
const SORT_LEAVE_DRIFT = 12;
const SORT_TRAVEL_OPACITY = 0.2;
const SORT_FADE_DISTANCE = 24;

export function createFlipValues(): FlipValues {
  return {
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    scale: new Animated.Value(1),
    opacity: new Animated.Value(1),
  };
}

function measure(ref: { current: unknown }): FlipRect | null {
  const element = ref.current as Partial<HostInstance> | null;
  if (!element || typeof element.getBoundingClientRect !== 'function') return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function viewportHeight(): number {
  return Dimensions.get('window').height;
}

function isVisible(rect: FlipRect): boolean {
  return intersectsViewport(rect, viewportHeight());
}

function byPosition(a: FlipRect, b: FlipRect): number {
  return a.y - b.y || a.x - b.x;
}

function nodeId(key: string, part: FlipPart): string {
  return `${part}:${key}`;
}

function timing(value: Animated.Value, toValue: number, duration: number, delay: number) {
  return Animated.timing(value, { toValue, duration, delay, easing: Easings.standard, useNativeDriver: true });
}

function place(values: FlipValues, offset: FlipOffset, scale = 1) {
  values.translateX.setValue(offset.x);
  values.translateY.setValue(offset.y);
  values.opacity.setValue(offset.opacity);
  values.scale.setValue(scale);
}

function stop(values: FlipValues) {
  values.translateX.stopAnimation();
  values.translateY.stopAnimation();
  values.opacity.stopAnimation();
  values.scale.stopAnimation();
}

export class FlipRegistry {
  private nodes = new Map<string, FlipNode>();
  private runs = new WeakMap<FlipValues, FlipRun>();
  private pending: PendingFlip | null = null;
  private ghosts = new FlipGhostBatch<FlipGhostSpec>();
  private ghostListeners = new Set<(ghosts: FlipGhostSpec[]) => void>();
  private nextGhostId = 1;
  private collectingGhosts = false;
  private collectedGhosts = false;

  register(node: FlipNode): () => void {
    const id = nodeId(node.key, node.part);
    this.nodes.set(id, node);
    if (this.pending?.started) this.playNode(node, this.measureAfterFlip(this.pending.mode, node));
    return () => {
      if (this.nodes.get(id) === node) this.nodes.delete(id);
    };
  }

  begin(mode: FlipMode): void {
    const now = Date.now();
    const boxes = new Map<string, BoxSnapshot>();
    const arts = new Map<string, FlipRect>();
    for (const node of this.nodes.values()) {
      if (!snapshotsBeforeFlip(mode, node.part)) continue;
      const layout = measure(node.ref);
      if (!layout) continue;
      const offset = this.freeze(node.values, now);
      const rect = shiftRect(layout, offset);
      if (node.part === 'box') {
        boxes.set(node.key, { rect, opacity: offset.opacity, content: isVisible(rect) ? node.content : undefined });
      } else if (isVisible(rect)) {
        arts.set(node.key, rect);
      }
    }
    this.pending = {
      mode,
      boxes,
      arts,
      landed: new Map(),
      shown: new Set(),
      order: new Map(),
      played: new Set(),
      started: false,
      until: 0,
    };
  }

  play(): void {
    const pending = this.pending;
    if (!pending) return;
    pending.started = true;
    pending.until = Date.now() + FLIP_WINDOW_MS;
    const measured = [...this.nodes.values()].map((node) => ({
      node,
      rect: this.measureAfterFlip(pending.mode, node),
    }));
    measured.sort((a, b) => (a.rect && b.rect ? byPosition(a.rect, b.rect) : a.rect ? -1 : b.rect ? 1 : 0));
    this.collectingGhosts = true;
    this.collectedGhosts = false;
    try {
      for (const { node, rect } of measured) this.playNode(node, rect);
      if (pending.mode === 'sort') this.leave(pending);
    } finally {
      this.collectingGhosts = false;
    }
    if (this.collectedGhosts) this.publishGhosts();
  }

  subscribeGhosts(listener: (ghosts: FlipGhostSpec[]) => void): () => void {
    this.ghostListeners.add(listener);
    listener(this.ghosts.current);
    return () => {
      this.ghostListeners.delete(listener);
    };
  }

  private measureAfterFlip(mode: FlipMode, node: FlipNode): FlipRect | null {
    return measuresAfterFlip(mode, node.part) ? measure(node.ref) : null;
  }

  private publishGhosts() {
    const ghosts = this.ghosts.current;
    this.ghostListeners.forEach((listener) => listener(ghosts));
  }

  private addGhosts(ghosts: FlipGhostSpec[]) {
    if (!ghosts.length) return;
    this.ghosts.add(ghosts);
    if (this.collectingGhosts) this.collectedGhosts = true;
    else this.publishGhosts();
  }

  private finishGhost(id: number) {
    if (this.ghosts.finish(id)) this.publishGhosts();
  }

  private freeze(values: FlipValues, now: number): FlipOffset {
    const motion = this.runs.get(values)?.motion;
    if (!motion) return REST_OFFSET;
    stop(values);
    return offsetAt(motion, now, Easings.standard);
  }

  private rest(values: FlipValues) {
    if (!this.runs.has(values)) return;
    this.runs.delete(values);
    place(values, REST_OFFSET);
  }

  private track(values: FlipValues, animations: Animated.CompositeAnimation[], motion?: FlipMotion) {
    const run: FlipRun = { motion };
    this.runs.set(values, run);
    Animated.parallel(animations).start(({ finished }) => {
      if (finished && this.runs.get(values) === run) this.runs.delete(values);
    });
  }

  private orderOf(pending: PendingFlip, key: string): number {
    const existing = pending.order.get(key);
    if (existing != null) return existing;
    const next = pending.order.size;
    pending.order.set(key, next);
    return next;
  }

  private playNode(node: FlipNode, rect: FlipRect | null) {
    const pending = this.pending;
    if (!pending) return;
    if (Date.now() > pending.until) {
      this.pending = null;
      return;
    }
    const id = nodeId(node.key, node.part);
    if (pending.played.has(id)) return;
    pending.played.add(id);
    if (!rect) this.rest(node.values);
    else if (pending.mode === 'sort') this.playSort(pending, node, rect);
    else this.playView(pending, node, rect);
  }

  private playSort(pending: PendingFlip, node: FlipNode, rect: FlipRect) {
    if (node.part !== 'box') {
      this.rest(node.values);
      return;
    }
    pending.landed.set(node.key, rect);
    const previous = pending.boxes.get(node.key);
    const role = sortRole(previous?.rect, rect, viewportHeight());
    if (role === 'rest') {
      this.rest(node.values);
      return;
    }
    pending.shown.add(node.key);
    const delay = staggerDelay(this.orderOf(pending, node.key), Durations.sortStagger, STAGGER_MAX_INDEX);
    if (role === 'enter' || !previous) {
      const direction = verticalDirection(rect, previous?.rect);
      this.animateSort(node.values, { x: 0, y: direction * SORT_ENTER_SHIFT, opacity: 0 }, {
        delay: Durations.sortEnterDelay + delay,
        duration: Durations.sortEnter,
        dip: false,
      });
      return;
    }
    const dx = previous.rect.x - rect.x;
    const dy = previous.rect.y - rect.y;
    if (!dx && !dy && previous.opacity === 1) {
      this.rest(node.values);
      return;
    }
    this.animateSort(node.values, { x: dx, y: dy, opacity: previous.opacity }, {
      delay,
      duration: Durations.sortFlip,
      dip: Math.hypot(dx, dy) > SORT_FADE_DISTANCE,
    });
  }

  private animateSort(
    values: FlipValues,
    from: FlipOffset,
    { delay, duration, dip }: { delay: number; duration: number; dip: boolean },
  ) {
    place(values, from);
    const animations: Animated.CompositeAnimation[] = [];
    if (from.x) animations.push(timing(values.translateX, 0, duration, delay));
    if (from.y) animations.push(timing(values.translateY, 0, duration, delay));
    if (dip) {
      const half = duration / 2;
      animations.push(
        Animated.sequence([
          timing(values.opacity, SORT_TRAVEL_OPACITY, half, delay),
          timing(values.opacity, 1, half, 0),
        ]),
      );
    } else if (from.opacity !== 1) {
      animations.push(timing(values.opacity, 1, duration, delay));
    }
    this.track(values, animations, {
      from,
      startedAt: Date.now(),
      delay,
      duration,
      dipOpacity: dip ? SORT_TRAVEL_OPACITY : undefined,
    });
  }

  private leave(pending: PendingFlip) {
    const leaving = [...pending.boxes.entries()]
      .filter(([key, snapshot]) => snapshot.content != null && !pending.shown.has(key))
      .sort(([, a], [, b]) => byPosition(a.rect, b.rect));
    if (!leaving.length) return;
    const ghosts = leaving.map(([key, snapshot], index): FlipRowGhostSpec => {
      const id = this.nextGhostId++;
      return {
        kind: 'row',
        id,
        content: snapshot.content,
        rect: snapshot.rect,
        opacity: snapshot.opacity,
        drift: verticalDirection(snapshot.rect, pending.landed.get(key)) * SORT_LEAVE_DRIFT,
        delay: staggerDelay(index, Durations.sortStagger, STAGGER_MAX_INDEX),
        onDone: () => this.finishGhost(id),
      };
    });
    this.addGhosts(ghosts);
  }

  private playView(pending: PendingFlip, node: FlipNode, rect: FlipRect) {
    const { values } = node;
    if (!isVisible(rect)) {
      this.rest(values);
      return;
    }
    const delay = staggerDelay(this.orderOf(pending, node.key), Durations.viewStagger, STAGGER_MAX_INDEX);
    if (node.part === 'box') {
      const from = { x: 0, y: VIEW_CONTENT_SHIFT, opacity: 0 };
      const fadeDelay = delay + Durations.viewFadeDelay;
      place(values, from);
      this.track(
        values,
        [
          timing(values.opacity, 1, Durations.viewFadeIn, fadeDelay),
          timing(values.translateY, 0, Durations.viewFadeIn, fadeDelay),
        ],
        { from, startedAt: Date.now(), delay: fadeDelay, duration: Durations.viewFadeIn },
      );
      return;
    }
    const old = pending.arts.get(node.key);
    if (old && node.artwork) {
      place(values, { ...REST_OFFSET, opacity: 0 });
      const run: FlipRun = {};
      this.runs.set(values, run);
      const id = this.nextGhostId++;
      const ghost: FlipArtGhostSpec = {
        kind: 'art',
        id,
        artwork: node.artwork,
        from: old,
        to: rect,
        delay,
        onDone: () => {
          if (this.runs.get(values) === run) this.rest(values);
          this.finishGhost(id);
        },
      };
      this.addGhosts([ghost]);
      return;
    }
    place(values, { ...REST_OFFSET, opacity: 0 }, ART_ENTER_SCALE);
    this.track(values, [
      timing(values.opacity, 1, ART_ENTER_MS, delay),
      timing(values.scale, 1, ART_ENTER_MS, delay),
    ]);
  }
}

export const FlipContext = createContext<FlipRegistry | null>(null);

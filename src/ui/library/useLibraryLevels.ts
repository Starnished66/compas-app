import { useCallback, useLayoutEffect, useRef } from 'react';
import { LibraryEntry } from '../../data/types';
import { PageTransitionKind } from '../components/PageTransition';

interface Level {
  entries: LibraryEntry[];
  offset: number;
  left: boolean;
  at: number;
}

const PENDING_PUSH_MS = 3000;

interface LevelEvent {
  serial: number;
  kind: PageTransitionKind;
  restoreOffset: number | null;
}

export interface LibraryLevelsInput {
  entries: LibraryEntry[];
  nested: boolean;
  rootKey: string;
  currentOffset: () => number;
  onEnterLevel: (restoreOffset: number | null) => void;
}

export interface LibraryLevels {
  transitionKey: string;
  kind: PageTransitionKind;
  depth: number;
  rememberPush: () => void;
}

export function useLibraryLevels({
  entries,
  nested,
  rootKey,
  currentOffset,
  onEnterLevel,
}: LibraryLevelsInput): LibraryLevels {
  const levels = useRef<Level[]>([]);
  const event = useRef<LevelEvent>({ serial: 0, kind: 'fade', restoreOffset: null });
  const lastRootKey = useRef(rootKey);
  const latestEntries = useRef(entries);
  latestEntries.current = entries;

  const emit = (kind: PageTransitionKind, restoreOffset: number | null) => {
    event.current = { serial: event.current.serial + 1, kind, restoreOffset };
  };

  const stack = levels.current;
  const top = stack[stack.length - 1];
  if (top && top.left && entries === top.entries) {
    levels.current = nested ? stack.slice(0, -1) : [];
    emit('pop', top.offset);
  } else if (!nested && stack.some((level) => level.left)) {
    levels.current = [];
    emit('pop', null);
  } else if (top && !top.left && nested && entries !== top.entries) {
    top.left = true;
    emit('push', 0);
  } else if (top && !top.left && Date.now() - top.at > PENDING_PUSH_MS) {
    levels.current = stack.slice(0, -1);
  } else if (!nested && lastRootKey.current !== rootKey) {
    emit('fade', 0);
  }
  lastRootKey.current = rootKey;

  const serial = event.current.serial;
  const latestEnter = useRef(onEnterLevel);
  latestEnter.current = onEnterLevel;
  useLayoutEffect(() => {
    if (serial === 0) return;
    latestEnter.current(event.current.restoreOffset);
  }, [serial]);

  const rememberPush = useCallback(() => {
    levels.current = [...levels.current, { entries: latestEntries.current, offset: currentOffset(), left: false, at: Date.now() }];
  }, [currentOffset]);

  return {
    transitionKey: `${rootKey}#${serial}`,
    kind: event.current.kind,
    depth: levels.current.length,
    rememberPush,
  };
}

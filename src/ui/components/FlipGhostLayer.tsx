import React, { useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { HostInstance } from 'react-native';
import { FlipContext, FlipGhostSpec, FlipRect } from '../library/flipRegistry';
import { FlipGhost } from './FlipGhost';
import { FlipRowGhost } from './FlipRowGhost';

const ZERO_ORIGIN: FlipRect = { x: 0, y: 0, width: 0, height: 0 };

function originOf(view: View | null): FlipRect {
  const element = view as unknown as Partial<HostInstance> | null;
  if (!element || typeof element.getBoundingClientRect !== 'function') return ZERO_ORIGIN;
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export function FlipGhostLayer() {
  const registry = useContext(FlipContext);
  const ref = useRef<View>(null);
  const [ghosts, setGhosts] = useState<FlipGhostSpec[]>([]);

  useEffect(() => registry?.subscribeGhosts(setGhosts), [registry]);

  const origin = ghosts.length ? originOf(ref.current) : ZERO_ORIGIN;

  return (
    <View ref={ref} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ghosts.map((ghost) =>
        ghost.kind === 'row' ? (
          <FlipRowGhost key={ghost.id} ghost={ghost} origin={origin} />
        ) : (
          <FlipGhost key={ghost.id} ghost={ghost} origin={origin} />
        ),
      )}
    </View>
  );
}

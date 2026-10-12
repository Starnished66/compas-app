import React, { useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { HostInstance } from 'react-native';
import { FlipContext, FlipGhostSpec, FlipRect } from '../library/flipRegistry';
import { sameRect } from '../library/flipMotion';
import { FlipGhost } from './FlipGhost';
import { FlipRowGhost } from './FlipRowGhost';

interface GhostLayerState {
  ghosts: FlipGhostSpec[];
  origin: FlipRect;
}

const ZERO_ORIGIN: FlipRect = { x: 0, y: 0, width: 0, height: 0 };
const EMPTY_LAYER: GhostLayerState = { ghosts: [], origin: ZERO_ORIGIN };

function originOf(view: View | null): FlipRect {
  const element = view as unknown as Partial<HostInstance> | null;
  if (!element || typeof element.getBoundingClientRect !== 'function') return ZERO_ORIGIN;
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export function FlipGhostLayer() {
  const registry = useContext(FlipContext);
  const ref = useRef<View>(null);
  const [{ ghosts, origin }, setLayer] = useState(EMPTY_LAYER);

  useEffect(
    () =>
      registry?.subscribeGhosts((next) => {
        if (!next.length) {
          setLayer(EMPTY_LAYER);
          return;
        }
        const measured = originOf(ref.current);
        setLayer((current) => ({
          ghosts: next,
          origin: sameRect(current.origin, measured) ? current.origin : measured,
        }));
      }),
    [registry],
  );

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

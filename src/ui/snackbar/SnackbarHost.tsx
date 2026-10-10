import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Durations, Easings } from '../motion';
import { Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { Snackbar } from '../components/Snackbar';
import { SnackbarHostContext } from './snackbarContext';

export interface SnackbarHostProps {
  bottomOffset: number;
  active?: boolean;
  priority?: number;
}

let hostCounter = 0;

export function SnackbarHost({ bottomOffset, active = true, priority = 1 }: SnackbarHostProps) {
  const host = useContext(SnackbarHostContext);
  const reducedMotion = useReducedMotion();
  const [hostId] = useState(() => {
    hostCounter += 1;
    return hostCounter;
  });
  const lift = useRef(new Animated.Value(-bottomOffset)).current;
  const registerHost = host?.registerHost;
  const unregisterHost = host?.unregisterHost;

  useEffect(() => {
    if (!active || !registerHost || !unregisterHost) return;
    registerHost(hostId, priority);
    return () => unregisterHost(hostId);
  }, [active, hostId, priority, registerHost, unregisterHost]);

  useEffect(() => {
    Animated.timing(lift, {
      toValue: -bottomOffset,
      duration: reducedMotion ? 0 : Durations.snackOffset,
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();
  }, [bottomOffset, lift, reducedMotion]);

  if (!host || !active || host.topHostId !== hostId) return null;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.host, { transform: [{ translateY: lift }] }]}>
      <Snackbar message={host.message} onAction={host.runAction} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Space.lg,
    right: Space.lg,
    bottom: 0,
  },
});

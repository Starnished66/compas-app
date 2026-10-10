import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { Durations } from '../motion';
import {
  SnackbarControls,
  SnackbarControlsContext,
  SnackbarEntry,
  SnackbarHostContext,
  SnackbarHostState,
  SnackbarMessage,
} from './snackbarContext';
import { SnackbarHost } from './SnackbarHost';

export interface SnackbarProviderProps {
  bottomOffset: number;
  children: ReactNode;
}

interface RegisteredHost {
  id: number;
  priority: number;
}

function topHostId(hosts: RegisteredHost[]): number | null {
  let top: RegisteredHost | null = null;
  for (const host of hosts) {
    if (!top || host.priority >= top.priority) top = host;
  }
  return top?.id ?? null;
}

export function SnackbarProvider({ bottomOffset, children }: SnackbarProviderProps) {
  const [message, setMessage] = useState<SnackbarEntry | null>(null);
  const [hosts, setHosts] = useState<RegisteredHost[]>([]);
  const nextId = useRef(0);
  const messageRef = useRef<SnackbarEntry | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    messageRef.current = null;
    setMessage(null);
  }, [clearTimer]);

  const show = useCallback(
    (next: SnackbarMessage) => {
      clearTimer();
      nextId.current += 1;
      const entry = { ...next, id: nextId.current };
      messageRef.current = entry;
      setMessage(entry);
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(next.text);
      dismissTimer.current = setTimeout(() => {
        if (messageRef.current?.id === entry.id) hide();
      }, Durations.snackVisible);
    },
    [clearTimer, hide],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const runAction = useCallback(() => {
    const action = messageRef.current?.onAction;
    hide();
    action?.();
  }, [hide]);

  const registerHost = useCallback((id: number, priority: number) => {
    setHosts((previous) => [...previous.filter((registered) => registered.id !== id), { id, priority }]);
  }, []);

  const unregisterHost = useCallback((id: number) => {
    setHosts((previous) => previous.filter((registered) => registered.id !== id));
  }, []);

  const controls = useMemo<SnackbarControls>(() => ({ show, hide }), [show, hide]);
  const hostState = useMemo<SnackbarHostState>(
    () => ({
      message,
      topHostId: topHostId(hosts),
      registerHost,
      unregisterHost,
      runAction,
    }),
    [hosts, message, registerHost, runAction, unregisterHost],
  );

  return (
    <SnackbarControlsContext.Provider value={controls}>
      <SnackbarHostContext.Provider value={hostState}>
        {children}
        <SnackbarHost bottomOffset={bottomOffset} priority={0} />
      </SnackbarHostContext.Provider>
    </SnackbarControlsContext.Provider>
  );
}

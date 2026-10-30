import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { SettingsApi } from '../data/SettingsApi';
import { PlayerSettingsController, PlayerSettingsNotice, PlayerSettingsState } from './PlayerSettingsController';

export interface PlayerSettingsStatus {
  revision?: number | null;
  epoch?: number | null;
}

/**
 * Player settings for the open Player settings screen. Loads on mount, follows the revision and epoch
 * from the status poll, and reports outcomes through `onNotice` (snackbars live in the UI).
 */
export function usePlayerSettings(
  api: SettingsApi | null,
  status: PlayerSettingsStatus,
  onNotice: (notice: PlayerSettingsNotice) => void,
): { state: PlayerSettingsState; controller: PlayerSettingsController | null } {
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;
  const controller = useMemo(
    () => (api ? new PlayerSettingsController(api, (notice) => noticeRef.current(notice)) : null),
    [api],
  );

  useEffect(() => {
    if (!controller) return;
    void controller.load();
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    controller?.syncFromStatus(status.revision, status.epoch);
  }, [controller, status.revision, status.epoch]);

  const state = useSyncExternalStore(
    controller ? controller.subscribe : NO_SUBSCRIBE,
    controller ? controller.getState : getUnavailable,
    controller ? controller.getState : getUnavailable,
  );
  return { state, controller };
}

const UNAVAILABLE: PlayerSettingsState = {
  phase: 'unsupported', schema: null, values: {}, epoch: 0, revision: 0, writable: false,
  busyKeys: [], pendingApply: {}, rescanBusy: false, error: 'unsupported',
};
const NO_SUBSCRIBE = () => () => undefined;
const getUnavailable = () => UNAVAILABLE;

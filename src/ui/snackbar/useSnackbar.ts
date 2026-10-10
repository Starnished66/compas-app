import { useContext } from 'react';
import { SnackbarControls, SnackbarControlsContext } from './snackbarContext';

const detachedControls: SnackbarControls = {
  show: () => undefined,
  hide: () => undefined,
};

export function useSnackbar(): SnackbarControls {
  return useContext(SnackbarControlsContext) ?? detachedControls;
}

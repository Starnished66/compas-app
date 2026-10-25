import { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import { useI18n } from '../i18n';

const exitConfirmWindowMs = 2000;

// Registers a single listener for the app's lifetime and reads the latest handler from a ref, so a
// changing handleBack never re-adds the listener (re-adding would reorder it among other listeners).
export function useHardwareBack(handleBack: () => boolean): void {
  const { t } = useI18n();
  const lastBackPressRef = useRef(0);
  const handleBackRef = useRef(handleBack);
  handleBackRef.current = handleBack;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const onBackPress = () => {
      if (handleBackRef.current()) return true;
      const now = Date.now();
      if (now - lastBackPressRef.current <= exitConfirmWindowMs) {
        BackHandler.exitApp();
        return true;
      }
      lastBackPressRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show(tRef.current('Press back again to exit'), ToastAndroid.SHORT);
      }
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []);
}

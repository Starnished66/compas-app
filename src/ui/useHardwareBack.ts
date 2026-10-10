import { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';

const exitConfirmWindowMs = 2000;

export function useHardwareBack(handleBack: () => boolean): void {
  const lastBackPressRef = useRef(0);

  useEffect(() => {
    const onBackPress = () => {
      if (handleBack()) return true;
      const now = Date.now();
      if (now - lastBackPressRef.current <= exitConfirmWindowMs) {
        BackHandler.exitApp();
        return true;
      }
      lastBackPressRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      }
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [handleBack]);
}

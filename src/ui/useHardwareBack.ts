import { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import { useI18n } from '../i18n';

const exitConfirmWindowMs = 2000;

export function useHardwareBack(handleBack: () => boolean): void {
  const { t } = useI18n();
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
        ToastAndroid.show(t('Press back again to exit'), ToastAndroid.SHORT);
      }
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [handleBack, t]);
}

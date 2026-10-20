import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './App';
import { I18nProvider } from './src/i18n';
import { AccentPreferenceProvider } from './src/ui/preferences/AccentPreferenceProvider';

export default function AppRoot() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nProvider>
        <SafeAreaProvider>
          <AccentPreferenceProvider>
            <App />
          </AccentPreferenceProvider>
        </SafeAreaProvider>
      </I18nProvider>
    </GestureHandlerRootView>
  );
}

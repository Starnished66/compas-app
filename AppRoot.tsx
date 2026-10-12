import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './App';
import { AccentPreferenceProvider } from './src/ui/preferences/AccentPreferenceProvider';

export default function AppRoot() {
  return (
    <SafeAreaProvider>
      <AccentPreferenceProvider>
        <App />
      </AccentPreferenceProvider>
    </SafeAreaProvider>
  );
}

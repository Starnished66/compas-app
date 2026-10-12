import React, { ReactNode, useEffect } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { TabActivityContext } from '../tabActivity';
import { FrozenWhileInactive } from './FrozenWhileInactive';

export interface TabPaneProps {
  active: boolean;
  children: ReactNode;
}

export function TabPane({ active, children }: TabPaneProps) {
  useEffect(() => {
    if (!active) Keyboard.dismiss();
  }, [active]);

  return (
    <View
      style={[StyleSheet.absoluteFill, !active && styles.hidden]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      <TabActivityContext.Provider value={active}>
        <FrozenWhileInactive active={active}>{children}</FrozenWhileInactive>
      </TabActivityContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
});

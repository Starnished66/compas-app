import React, { ReactNode, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleProp, View, ViewStyle } from 'react-native';
import { FlipArtwork, FlipContext, FlipPart, createFlipValues } from '../library/flipRegistry';

export interface FlipViewProps {
  flipKey: string;
  part?: FlipPart;
  artwork?: FlipArtwork;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function FlipView({ flipKey, part = 'box', artwork, style, children }: FlipViewProps) {
  const registry = useContext(FlipContext);
  const ref = useRef<View>(null);
  const [values] = useState(createFlipValues);
  const latest = useRef({ artwork, children });
  latest.current = { artwork, children };

  useLayoutEffect(() => {
    if (!registry) return;
    return registry.register({
      key: flipKey,
      part,
      ref,
      values,
      get artwork() {
        return latest.current.artwork;
      },
      get content() {
        return latest.current.children;
      },
    });
  }, [flipKey, part, registry, values]);

  const animatedStyle = useMemo(
    () => ({
      opacity: values.opacity,
      transform: [{ translateX: values.translateX }, { translateY: values.translateY }, { scale: values.scale }],
    }),
    [values],
  );

  if (!registry) return <View style={style}>{children}</View>;

  // Measured on this untransformed wrapper: the shadow tree does not track native-driven transforms mid-flight.
  return (
    <View ref={ref} collapsable={false} style={style}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </View>
  );
}

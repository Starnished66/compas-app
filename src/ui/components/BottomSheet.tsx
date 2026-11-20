import React, { ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  type PanResponderInstance,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Distances } from '../motion';
import { SnackbarHost } from '../snackbar/SnackbarHost';
import { Radius, Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';
import { SheetHandle } from './SheetHandle';
import { useScreenInsets } from '../useScreenInsets';
import { insetBeyond } from '../insetBeyond';
import { useI18n } from '../../i18n';
import { useBottomSheetMotion } from './useBottomSheetMotion';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  scrollable?: boolean;
  fullHeight?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  contentKey?: string;
  onHidden?: () => void;
  /** Hardware back; return true when handled (e.g. leaving a sub-page) to keep the sheet open. */
  onBackPress?: () => boolean;
}

const TOP_GAP = Space.xl + Space.sm;
const SWAP_START_OPACITY = 0.3;

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  scrollable = true,
  fullHeight = false,
  contentStyle,
  contentKey,
  onHidden,
  onBackPress,
}: BottomSheetProps) {
  const palette = usePalette();
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const insets = useScreenInsets();
  const { height: windowHeight } = useWindowDimensions();
  const motion = useBottomSheetMotion({ visible, onClose, onHidden, onBackPress, contentKey, reducedMotion, windowHeight });
  if (!motion.mounted) return null;

  return renderSheet({ visible, title, children, scrollable, fullHeight, contentStyle }, motion, windowHeight, insets, palette, t);
}

type SheetContent = Pick<BottomSheetProps, 'visible' | 'title' | 'children' | 'contentStyle'> & {
  scrollable: boolean;
  fullHeight: boolean;
};

function renderSheet(
  { visible, title, children, scrollable, fullHeight, contentStyle }: SheetContent,
  motion: ReturnType<typeof useBottomSheetMotion>,
  windowHeight: number,
  insets: ReturnType<typeof useScreenInsets>,
  palette: ReturnType<typeof usePalette>,
  t: ReturnType<typeof useI18n>['t'],
) {
  const {
    progress, sheetHeightRef, swap, scrim, dragY, requestClose, handleBackPress, handleResponder, titleResponder, scrollRef,
  } = motion;

  const maxHeight = windowHeight - insets.top - TOP_GAP;
  const slide = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeightRef.current, 0] });
  const fillsSheet = fullHeight && !scrollable;
  const swapStyle = {
    opacity: swap.interpolate({ inputRange: [0, 1], outputRange: [SWAP_START_OPACITY, 1] }),
    transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [Distances.sheetSwap, 0] }) }],
  };
  const body = (
    <Animated.View style={[styles.content, fillsSheet && styles.fill, contentStyle, swapStyle]}>{children}</Animated.View>
  );

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible onRequestClose={handleBackPress}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrim }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Close')}
            style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]}
            onPress={requestClose}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          onLayout={(event) => {
            sheetHeightRef.current = event.nativeEvent.layout.height;
          }}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.outline,
              maxHeight,
              paddingBottom: insetBeyond(insets.bottom, Space.lg),
              transform: [{ translateY: Animated.add(slide, dragY) }],
            },
            fullHeight && { height: maxHeight },
          ]}
        >
          {renderHeading(title, requestClose, handleResponder, titleResponder, t)}
          {renderBody(body, scrollable, fillsSheet, scrollRef)}
        </Animated.View>
        <SnackbarHost bottomOffset={Space.lg + insetBeyond(insets.bottom, Space.lg)} active={visible} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

function renderHeading(
  title: BottomSheetProps['title'],
  requestClose: () => void,
  handleResponder: PanResponderInstance,
  titleResponder: PanResponderInstance,
  t: ReturnType<typeof useI18n>['t'],
) {
  return (
    <View>
      <SheetHandle
        label={t('Drag down to close')}
        onClose={requestClose}
        dragHandlers={handleResponder.panHandlers}
      />
      {title ? (
        <View {...titleResponder.panHandlers}>
          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            {title}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function renderBody(
  body: ReactNode,
  scrollable: boolean,
  fillsSheet: boolean,
  scrollRef: ReturnType<typeof useBottomSheetMotion>['scrollRef'],
) {
  return scrollable ? (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {body}
    </ScrollView>
  ) : (
    <View style={[styles.scroll, fillsSheet && styles.fill]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  title: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.sm,
  },
  scroll: {
    flexShrink: 1,
  },
  content: {
    paddingBottom: Space.lg,
  },
  fill: {
    flex: 1,
  },
});

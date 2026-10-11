/**
 * Touchable — the ONE press primitive (P1.23 phase E). Every tappable in the app
 * scales to 0.97 on press-in and springs back on release, on the UI thread via
 * Reanimated (never a per-frame setState), and fires an OPTIONAL haptic on
 * commit — one per action, never per tap by default, and never the only feedback
 * (animate-expo §7/§8). Reduced-motion drops the scale but keeps the press
 * working (animate-expo §9). The visual size is the caller's; where a control is
 * drawn smaller than the 56 tap floor it passes `hitSlop`, it does not shrink the
 * target. `.value` is used rather than `.get()/.set()` because this project does
 * not run the React Compiler; the access is only ever in worklets/handlers.
 */
import { type ReactElement, type ReactNode, useMemo } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { MOTION } from "../src/ui/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The commit feedback, if any. Fired once, on the causal tap. */
export type Haptic = "none" | "light" | "medium" | "success" | "error";

function fireHaptic(kind: Haptic): void {
  switch (kind) {
    case "light":
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case "medium":
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case "success":
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case "error":
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
    case "none":
      break;
  }
}

export interface TouchableProps {
  onPress?: (() => void) | undefined;
  haptic?: Haptic;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  hitSlop?: number;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link" | "none";
  /**
   * A3 item 4: whether this control is the CHOSEN one of a set (a chip, a segment, a picker
   * row). Drawn selection alone is invisible to TalkBack — a uiautomator dump of the
   * dashboard read `selected=false` on every chip, the drawn one included. `disabled` needs
   * no prop of its own here: Pressable already announces it (the same dump read
   * `enabled=false` on a disabled save).
   */
  selected?: boolean;
}

export function Touchable({
  onPress,
  haptic = "none",
  disabled = false,
  style,
  children,
  hitSlop,
  accessibilityLabel,
  accessibilityRole = "button",
  selected,
}: TouchableProps): ReactElement {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const easing = useMemo(
    () => Easing.bezier(MOTION.ease.out[0], MOTION.ease.out[1], MOTION.ease.out[2], MOTION.ease.out[3]),
    [],
  );
  const to = (v: number): void => {
    scale.value = reduced
      ? v
      : withTiming(v, { duration: MOTION.press.durationMs, easing, reduceMotion: ReduceMotion.System });
  };
  return (
    <AnimatedPressable
      onPressIn={() => to(MOTION.press.scale)}
      onPressOut={() => to(1)}
      onPress={() => {
        if (!disabled) {
          fireHaptic(haptic);
          onPress?.();
        }
      }}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? { disabled } : { disabled, selected }}
      style={[animatedStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}

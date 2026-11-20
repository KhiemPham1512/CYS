import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { HUB_SECTIONS, type HubKey } from "../navigation/tabs";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";
import { fontFamily, useReduceMotion } from "./motion";

// Bảng chức năng trượt từ dưới lên, nền mờ phía sau; ô bật lần lượt. Số đỏ = việc đang chờ.
export function HubSheet({
  open,
  badges,
  onPick,
  onClose,
}: {
  open: boolean;
  badges: Partial<Record<HubKey, number>>;
  onPick: (key: HubKey) => void;
  onClose: () => void;
}) {
  const { theme, palette } = useTheme();
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduce) progress.setValue(1);
      else
        Animated.spring(progress, {
          toValue: 1,
          friction: 9,
          tension: 70,
          useNativeDriver: true,
        }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: reduce ? 1 : 200,
        useNativeDriver: true,
      }).start(({ finished }) => finished && setMounted(false));
    }
  }, [open, reduce, progress]);

  if (!mounted) return null;
  const slide = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [reduce ? 0 : 360, 0],
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: progress, backgroundColor: "rgba(40,16,30,0.38)" },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Đóng chức năng"
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            backgroundColor: palette.surface,
            borderRadius: theme === "pink" ? 30 : 26,
            opacity: reduce ? progress : 1,
            transform: [{ translateY: slide }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: palette.line }]} />
        <Text style={[styles.title, { color: palette.ink }]}>Chức năng</Text>
        {HUB_SECTIONS.map((section, si) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.group, { color: palette.muted }]}>
              {section.title.toUpperCase()}
            </Text>
            <View style={styles.grid}>
              {section.items.map((item, i) => (
                <Tile
                  key={item.key}
                  index={si * 4 + i}
                  progress={progress}
                  reduce={reduce}
                  label={item.label}
                  iconKey={item.key}
                  soon={item.soon}
                  badge={badges[item.key]}
                  alt={si === 1}
                  onPress={() => onPick(item.key)}
                />
              ))}
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function Tile({
  index,
  progress,
  reduce,
  label,
  iconKey,
  soon,
  badge,
  alt,
  onPress,
}: {
  index: number;
  progress: Animated.Value;
  reduce: boolean;
  label: string;
  iconKey: HubKey;
  soon?: boolean;
  badge?: number;
  alt: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();
  // Mỗi ô bật trễ hơn ô trước một chút (so với tiến độ mở bảng).
  const start = Math.min(0.55, 0.15 + index * 0.06);
  const scale = reduce
    ? 1
    : progress.interpolate({
        inputRange: [start, Math.min(1, start + 0.4)],
        outputRange: [0.85, 1],
        extrapolate: "clamp",
      });
  const boxBg = alt ? palette.bg : palette.accentSoft;
  const tint = alt ? palette.ink : palette.accent;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        {
          opacity: soon ? 0.55 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
      onPress={onPress}
      disabled={soon}
      accessibilityRole="button"
      accessibilityLabel={
        soon
          ? `${label} (sắp có)`
          : badge
            ? `${label}, ${badge} việc chờ`
            : label
      }
      accessibilityState={{ disabled: !!soon }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <View
          style={[
            styles.box,
            {
              backgroundColor: boxBg,
              borderRadius: theme === "pink" ? 22 : 16,
            },
          ]}
        >
          <Icon name={iconKey} theme={theme} color={tint} size={26} />
          {!!badge && (
            <View
              style={[
                styles.badge,
                { backgroundColor: palette.red, borderColor: palette.surface },
              ]}
            >
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
      </Animated.View>
      <Text style={[styles.label, { color: palette.ink }]} numberOfLines={2}>
        {label}
      </Text>
      {soon && (
        <Text style={[styles.soon, { color: palette.muted }]}>Sắp có</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 92,
    padding: 16,
    paddingTop: 10,
    gap: 14,
    elevation: 12,
  },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2 },
  title: { fontSize: 18, fontFamily: fontFamily.bold },
  section: { gap: 10 },
  group: { fontSize: 11, letterSpacing: 1.2, fontFamily: fontFamily.semi },
  grid: { flexDirection: "row", justifyContent: "space-between" },
  tile: { width: "24%", alignItems: "center", gap: 6 },
  box: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 11.5, textAlign: "center", fontFamily: fontFamily.medium },
  soon: { fontSize: 10, fontFamily: fontFamily.regular },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10.5, fontFamily: fontFamily.bold },
});

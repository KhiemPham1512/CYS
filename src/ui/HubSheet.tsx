import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { HUB_SECTIONS, type HubKey } from "../navigation/tabs";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";
import { fontFamily, useReduceMotion } from "./motion";

// Bảng chức năng trượt từ dưới lên, nền mờ phía sau. Số đỏ = việc đang chờ.
// Hồng nơ: bảng nảy mềm, ô nở ra từ nút Hub như cánh hoa, trái tim nhỏ bay lên.
// Xanh trắng: bảng trượt dứt khoát, ô lần lượt trượt vào như xếp lên kệ, một vệt sáng quét xuống.
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
  const { bottom } = useSafeAreaInsets(); // nằm trên TabBar, TabBar đã đẩy lên theo thanh điều hướng
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduce) progress.setValue(1);
      else if (theme === "pink")
        Animated.spring(progress, {
          toValue: 1,
          friction: 14,
          tension: 170,
          useNativeDriver: true,
        }).start();
      else
        Animated.timing(progress, {
          toValue: 1,
          duration: 220,
          easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          useNativeDriver: true,
        }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: reduce ? 1 : 150,
        useNativeDriver: true,
      }).start(({ finished }) => finished && setMounted(false));
    }
  }, [open, reduce, theme, progress]);

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
          { opacity: progress, backgroundColor: "rgba(30,20,30,0.38)" },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Đóng chức năng"
        />
      </Animated.View>
      {theme === "pink" && open && !reduce && <Hearts />}
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            bottom: styles.sheet.bottom + bottom,
            backgroundColor: palette.surface,
            borderRadius: theme === "pink" ? 30 : 26,
            opacity: reduce ? progress : 1,
            transform: [{ translateY: slide }],
          },
        ]}
      >
        {theme === "blue" && !reduce && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sweep,
              {
                opacity: progress.interpolate({
                  inputRange: [0, 0.15, 0.85, 1],
                  outputRange: [0, 1, 0.3, 0],
                }),
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 280],
                    }),
                  },
                ],
              },
            ]}
          />
        )}
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
                  col={i}
                  row={si}
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

// Vài trái tim nhỏ bay lên từ nút Hub (chủ đề Hồng nơ).
function Hearts() {
  const { palette } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const hearts = useRef(
    [0, 1, 2, 3, 4].map((i) => ({
      v: new Animated.Value(0),
      dx: (i - 2) * 24 + (i % 2 ? 10 : -10),
      rot: (i - 2) * 8,
    }))
  ).current;
  useEffect(() => {
    const anims = hearts.map((h, i) =>
      Animated.sequence([
        Animated.delay(i * 40 + 60),
        Animated.timing(h.v, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [hearts]);
  return (
    <View
      style={[styles.hearts, { bottom: styles.hearts.bottom + bottom }]}
      pointerEvents="none"
    >
      {hearts.map((h, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            opacity: h.v.interpolate({
              inputRange: [0, 0.2, 1],
              outputRange: [0, 1, 0],
            }),
            transform: [
              {
                translateX: h.v.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, h.dx],
                }),
              },
              {
                translateY: h.v.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -150],
                }),
              },
              {
                scale: h.v.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1.1],
                }),
              },
              {
                rotate: h.v.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", `${h.rot}deg`],
                }),
              },
            ],
          }}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path
              d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2 0 3.7 1.1 5.4 3 1.7-1.9 3.4-3 5.4-3 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"
              fill={palette.accent}
            />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

function Tile({
  index,
  col,
  row,
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
  col: number;
  row: number;
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
  // Mỗi ô vào trễ hơn ô trước một chút (theo tiến độ mở bảng).
  const start = Math.min(0.55, 0.12 + index * 0.05);
  const t = reduce
    ? 1
    : progress.interpolate({
        inputRange: [start, Math.min(1, start + 0.45)],
        outputRange: [0, 1],
        extrapolate: "clamp",
      });
  const at = (from: number | string, to: number | string) =>
    typeof t === "number"
      ? to
      : t.interpolate({ inputRange: [0, 1], outputRange: [from, to] as never });
  // Hồng: ô bay ra từ nút Hub (ở giữa dưới) về đúng chỗ, xoay nhẹ như cánh hoa nở.
  // Xanh: ô trượt ngang vào như xếp lên kệ.
  const enter =
    theme === "pink"
      ? {
          opacity: at(0, 1),
          transform: [
            { translateX: at(-(col - 1.5) * 80, 0) },
            { translateY: at(row === 0 ? 190 : 110, 0) },
            { scale: at(0.2, 1) },
            { rotate: at("-35deg", "0deg") },
          ],
        }
      : {
          opacity: at(0, 1),
          transform: [{ translateX: at(-18, 0) }],
        };
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
      <Animated.View style={reduce ? undefined : (enter as never)}>
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
    overflow: "hidden",
  },
  sweep: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    backgroundColor: "rgba(29,111,224,0.18)",
  },
  hearts: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 100,
    height: 16,
    alignItems: "center",
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

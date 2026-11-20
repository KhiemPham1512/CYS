import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, useReduceMotion } from "./motion";

// Màn chờ dùng chung cho mọi màn đang tải. Mỗi chủ đề một kiểu:
// Hồng nơ = ba viên trân châu nảy lần lượt; Xanh trắng = khung xương danh sách có vệt sáng quét qua.
export function Loading() {
  const { theme } = useTheme();
  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Đang tải"
    >
      {theme === "pink" ? <Pearls /> : <Skeleton />}
    </View>
  );
}

function Pearls() {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (reduce) {
      dots.forEach((d) => d.setValue(0));
      return;
    }
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(d, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 140 + 240),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduce, dots]);

  const shades = [palette.gradFrom, palette.accent, palette.gradTo];
  return (
    <View style={styles.pearlsWrap}>
      <View style={styles.pearls}>
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[
              styles.pearl,
              {
                backgroundColor: shades[i],
                transform: [
                  {
                    translateY: d.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -16],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.caption, { color: palette.muted }]}>
        Đang chuẩn bị…
      </Text>
    </View>
  );
}

function Skeleton() {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, sweep]);

  return (
    <View style={styles.skeleton}>
      {[0.72, 0.5, 0.64, 0.42].map((w, i) => (
        <View
          key={i}
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.line },
          ]}
        >
          <View
            style={[
              styles.bar,
              { width: `${w * 100}%`, backgroundColor: palette.accentSoft },
            ]}
          />
          <View
            style={[
              styles.bar,
              styles.barThin,
              { width: `${w * 60}%`, backgroundColor: palette.accentSoft },
            ]}
          />
          {!reduce && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.shine,
                {
                  transform: [
                    {
                      translateX: sweep.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-120, 360],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  pearlsWrap: { alignItems: "center", gap: 18 },
  pearls: { flexDirection: "row", gap: 12, height: 40, alignItems: "flex-end" },
  pearl: { width: 16, height: 16, borderRadius: 8 },
  caption: { fontSize: 13, fontFamily: fontFamily.medium },
  skeleton: { width: "100%", maxWidth: 420, gap: 10 },
  card: {
    height: 74,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    overflow: "hidden",
    justifyContent: "center",
  },
  bar: { height: 14, borderRadius: 7 },
  barThin: { height: 10, borderRadius: 5 },
  shine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 90,
    backgroundColor: "rgba(255,255,255,0.65)",
    transform: [{ skewX: "-18deg" }],
  },
});

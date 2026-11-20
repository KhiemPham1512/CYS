import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, useReduceMotion } from "./motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Màn chờ dùng chung cho mọi màn đang tải. Mỗi chủ đề một kiểu:
// Hồng nơ = giọt rơi, gợn nước lan ra; Xanh trắng = lõi năng lượng (viền lục giác sáng chạy, quỹ đạo xoay).
export function Loading() {
  const { theme } = useTheme();
  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Đang tải"
    >
      {theme === "pink" ? <Ripple /> : <Core />}
    </View>
  );
}

const CYCLE = 1.2; // một vòng lặp chạy giá trị 0 → 1.2 (đơn vị riêng, ~3,1 giây)

function Ripple() {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (reduce) {
      t.setValue(0.6);
      return;
    }
    t.setValue(0);
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: CYCLE,
        duration: 3100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, t]);

  const dropY = t.interpolate({
    inputRange: [0, 0.3, 0.33, CYCLE],
    outputRange: [0, 72, 76, 76],
  });
  const dropOpacity = t.interpolate({
    inputRange: [0, 0.08, 0.3, 0.33, CYCLE],
    outputRange: [0, 1, 1, 0, 0],
  });
  const dropScaleY = t.interpolate({
    inputRange: [0, 0.3, 0.33, CYCLE],
    outputRange: [1, 1, 0.4, 0.4],
  });
  const glowScale = t.interpolate({
    inputRange: [0, 0.3, 0.38, 0.9, CYCLE],
    outputRange: [0.4, 0.4, 1, 1.4, 1.4],
  });
  const glowOpacity = t.interpolate({
    inputRange: [0, 0.3, 0.38, 0.9, CYCLE],
    outputRange: [0, 0, 1, 0, 0],
  });

  return (
    <View style={styles.center}>
      <View style={styles.ripple}>
        <Animated.View
          style={[
            styles.glow,
            {
              backgroundColor: palette.accentSoft,
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />
        {[0, 1, 2].map((i) => {
          const d = i * 0.085;
          return (
            <Animated.View
              key={i}
              style={[
                styles.ring,
                {
                  borderColor: palette.accent,
                  opacity: t.interpolate({
                    inputRange: [0, 0.31 + d, 0.36 + d, 0.9 + d, CYCLE],
                    outputRange: [0, 0, 0.9, 0, 0],
                  }),
                  transform: [
                    {
                      scale: t.interpolate({
                        inputRange: [0, 0.31 + d, 0.9 + d, CYCLE],
                        outputRange: [0.08, 0.08, 1.15, 1.15],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}
        <Animated.View
          style={[
            styles.drop,
            {
              backgroundColor: palette.accent,
              opacity: dropOpacity,
              transform: [{ translateY: dropY }, { scaleY: dropScaleY }],
            },
          ]}
        />
      </View>
      <Text style={[styles.caption, { color: palette.muted }]}>
        Chờ một chút nhé…
      </Text>
    </View>
  );
}

const HEX = "M70 34 L101 52 L101 88 L70 106 L39 88 L39 52 Z";
const TRACE_LEN = 330;

function Core() {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const trace = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const spinBack = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const dots = useRef([0, 1, 2, 3].map(() => new Animated.Value(0.25))).current;

  useEffect(() => {
    if (reduce) return;
    const loops = [
      Animated.loop(
        Animated.timing(trace, {
          toValue: 1,
          duration: 1600,
          easing: Easing.linear,
          useNativeDriver: false, // thuộc tính của hình SVG không chạy được trên luồng gốc
        })
      ),
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 3200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.timing(spinBack, {
          toValue: 1,
          duration: 5000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0.45,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ),
      ...dots.map((d, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 200),
            Animated.timing(d, {
              toValue: 1,
              duration: 120,
              useNativeDriver: true,
            }),
            Animated.timing(d, {
              toValue: 0.25,
              duration: 480,
              useNativeDriver: true,
            }),
            Animated.delay((3 - i) * 200 + 400),
          ])
        )
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduce, trace, spin, spinBack, pulse, dots]);

  const rot = (v: Animated.Value, dir: 1 | -1) => ({
    transform: [
      {
        rotate: v.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${360 * dir}deg`],
        }),
      },
    ],
  });
  const dashOffset = trace.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -TRACE_LEN],
  });

  return (
    <View style={styles.center}>
      <View style={styles.core}>
        <Animated.View style={[StyleSheet.absoluteFill, rot(spinBack, -1)]}>
          <Svg width={140} height={140} viewBox="0 0 140 140" fill="none">
            <Circle
              cx={70}
              cy={70}
              r={64}
              stroke={palette.line}
              strokeWidth={1.5}
              strokeDasharray="2 7"
            />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, rot(spin, 1)]}>
          <Svg width={140} height={140} viewBox="0 0 140 140" fill="none">
            <Circle
              cx={70}
              cy={70}
              r={54}
              stroke={palette.accentSoft}
              strokeWidth={1.5}
            />
            <Circle cx={70} cy={16} r={4} fill={palette.accent} />
            <Circle cx={116.8} cy={97} r={3} fill={palette.gradFrom} />
            <Circle cx={23.2} cy={97} r={2.5} fill={palette.accentDeep} />
          </Svg>
        </Animated.View>
        <Svg
          style={StyleSheet.absoluteFill}
          width={140}
          height={140}
          viewBox="0 0 140 140"
          fill="none"
        >
          <Path
            d={HEX}
            stroke={palette.line}
            strokeWidth={4}
            strokeLinejoin="round"
          />
          <AnimatedPath
            d={HEX}
            stroke={palette.accent}
            strokeWidth={4}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={`46 ${TRACE_LEN - 46}`}
            strokeDashoffset={reduce ? 0 : dashOffset}
          />
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse }]}>
          <Svg width={140} height={140} viewBox="0 0 140 140" fill="none">
            <Path
              d="M57 80 L70 62 L83 80"
              stroke={palette.accentDeep}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      </View>
      <View style={styles.dots}>
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: palette.accent, opacity: reduce ? 0.6 : d },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.caption, { color: palette.muted }]}>
        Đang đồng bộ dữ liệu…
      </Text>
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
  center: { alignItems: "center", gap: 14 },
  caption: { fontSize: 13, fontFamily: fontFamily.medium },
  ripple: { width: 140, height: 140 },
  ring: {
    position: "absolute",
    left: 10,
    top: 59,
    width: 120,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  glow: {
    position: "absolute",
    left: 42,
    top: 72,
    width: 56,
    height: 18,
    borderRadius: 9,
  },
  drop: {
    position: "absolute",
    left: 64,
    top: 0,
    width: 12,
    height: 16,
    borderRadius: 8,
  },
  core: { width: 140, height: 140 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 1.5 },
});

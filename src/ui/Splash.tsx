import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { Bow } from "./icons";
import { fontFamily, useReduceMotion } from "./motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const HEX = 330; // chiều dài nét viền lục giác

// Màn chờ khi mở app: viền lục giác tự vẽ, mũi tên bật lên, chữ CYS hiện dần (~0,7 giây).
// shortcut: chạy đủ một lượt dù app đã sẵn sàng; chưa nối với việc tải dữ liệu.
export function Splash({ onDone }: { onDone: () => void }) {
  const { theme, palette } = useTheme();
  const reduce = useReduceMotion();
  const draw = useRef(new Animated.Value(0)).current;
  const chev = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const ease = Easing.bezier(0.6, 0, 0.2, 1);
    const run = reduce
      ? Animated.sequence([
          Animated.timing(word, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.delay(250),
        ])
      : Animated.sequence([
          Animated.timing(draw, {
            toValue: 1,
            duration: 350,
            easing: ease,
            useNativeDriver: false,
          }),
          Animated.parallel([
            Animated.spring(chev, {
              toValue: 1,
              friction: 9,
              tension: 220,
              useNativeDriver: true,
            }),
            Animated.timing(word, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]),
        ]);
    // Chỉ kết thúc khi chạy trọn; bị dừng giữa chừng (đổi Giảm chuyển động) thì chạy lại, không bỏ qua màn chờ.
    run.start(({ finished }) => {
      if (finished)
        Animated.timing(out, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }).start(onDone);
    });
    return () => run.stop();
  }, [reduce, draw, chev, word, out, onDone]);

  const a = palette.gradFrom;
  const b = palette.gradTo;
  const dashOffset = reduce
    ? 0
    : draw.interpolate({ inputRange: [0, 1], outputRange: [HEX, 0] });
  const chevStyle = reduce
    ? { opacity: 1 }
    : {
        opacity: chev,
        transform: [
          {
            translateY: chev.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
      };

  return (
    <Animated.View
      style={[styles.root, { backgroundColor: palette.bg, opacity: out }]}
      accessibilityLabel="CYS đang mở"
    >
      <View>
        <Svg width={104} height={104} viewBox="0 0 128 128" fill="none">
          <Defs>
            <LinearGradient id="splashG" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={a} />
              <Stop offset="1" stopColor={b} />
            </LinearGradient>
          </Defs>
          <AnimatedPath
            d="M64 10 L110 37 L110 91 L64 118 L18 91 L18 37 Z"
            stroke="url(#splashG)"
            strokeWidth={8}
            strokeLinejoin="round"
            strokeDasharray={HEX}
            strokeDashoffset={dashOffset}
          />
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, chevStyle]}>
          <Svg width={104} height={104} viewBox="0 0 128 128" fill="none">
            <Defs>
              <LinearGradient id="splashC" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={a} />
                <Stop offset="1" stopColor={b} />
              </LinearGradient>
            </Defs>
            <Path
              d="M40 80 L64 48 L88 80"
              stroke="url(#splashC)"
              strokeWidth={13}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
        {theme === "pink" && (
          <Animated.View style={[styles.bow, { opacity: word }]}>
            <Bow color={palette.accent} width={36} />
          </Animated.View>
        )}
      </View>
      <Animated.Text
        style={[styles.word, { color: palette.ink, opacity: word }]}
      >
        CYS
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    zIndex: 50,
  },
  word: {
    fontSize: 30,
    letterSpacing: 9,
    fontFamily: fontFamily.bold,
    marginLeft: 9,
  },
  bow: {
    position: "absolute",
    top: -6,
    right: -16,
    transform: [{ rotate: "14deg" }],
  },
});

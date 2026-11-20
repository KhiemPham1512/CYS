import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { MAIN_TABS, type MainTabKey } from "../navigation/tabs";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";
import { useReduceMotion } from "./motion";

// Thanh tab dưới chỉ icon (mỗi icon có nhãn trợ năng). Nút Hub ở giữa nổi lên và xoay khi mở.
export function TabBar({
  selected,
  hubOpen,
  onSelect,
}: {
  selected: MainTabKey;
  hubOpen: boolean;
  onSelect: (key: MainTabKey) => void;
}) {
  const { theme, palette } = useTheme();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: palette.surface, borderColor: palette.line },
        theme === "pink" && { borderRadius: 26 },
      ]}
      accessibilityRole="tablist"
    >
      {MAIN_TABS.map((tab) =>
        tab.key === "hub" ? (
          <HubButton
            key={tab.key}
            open={hubOpen}
            active={selected === "hub"}
            onPress={() => onSelect("hub")}
            label={hubOpen ? "Đóng chức năng" : "Mở chức năng"}
          />
        ) : (
          <TabButton
            key={tab.key}
            tabKey={tab.key}
            label={tab.label}
            on={!hubOpen && selected === tab.key}
            onPress={() => onSelect(tab.key)}
          />
        )
      )}
    </View>
  );
}

function TabButton({
  tabKey,
  label,
  on,
  onPress,
}: {
  tabKey: MainTabKey;
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      pop.setValue(on ? 1 : 0);
      return;
    }
    Animated.spring(pop, {
      toValue: on ? 1 : 0,
      friction: 5,
      tension: 180,
      useNativeDriver: true,
    }).start();
  }, [on, reduce, pop]);
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
    >
      <Animated.View
        style={{
          transform: [
            {
              scale: pop.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.12],
              }),
            },
          ],
        }}
      >
        <Icon
          name={tabKey as "stock" | "use" | "catalog" | "menu"}
          theme={theme}
          color={on ? palette.accent : palette.muted}
          strokeWidth={on ? 2.2 : 1.8}
        />
      </Animated.View>
      <Animated.View
        style={[styles.dot, { backgroundColor: palette.accent, opacity: pop }]}
      />
    </Pressable>
  );
}

function HubButton({
  open,
  active,
  onPress,
  label,
}: {
  open: boolean;
  active: boolean; // đang ở một chức năng của Hub
  onPress: () => void;
  label: string;
}) {
  const { theme, palette } = useTheme();
  const reduce = useReduceMotion();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      turn.setValue(open ? 1 : 0);
      return;
    }
    Animated.spring(turn, {
      toValue: open ? 1 : 0,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [open, reduce, turn]);
  return (
    <View style={styles.hubSlot}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          styles.hub,
          {
            backgroundColor:
              open || active ? palette.accentDeep : palette.hubFrom,
            borderColor: palette.bg,
            borderRadius: theme === "pink" ? 28 : 18,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
        ]}
      >
        <Animated.View
          style={{
            transform: [
              {
                rotate: turn.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", theme === "pink" ? "135deg" : "90deg"],
                }),
              },
            ],
          }}
        >
          <Icon name="hub" theme={theme} color="#fff" strokeWidth={2.1} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 14,
    height: 62,
    borderRadius: 22,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
  hubSlot: { flex: 1, alignItems: "center" },
  hub: {
    width: 54,
    height: 54,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    elevation: 4,
  },
});

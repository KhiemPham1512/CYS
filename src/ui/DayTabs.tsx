import { Pressable, View } from "react-native";
import { formatDayMonth } from "../stock/expiry";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "./Text";

// Ngày đang mở: ngày đã chọn nếu còn trong danh sách, không thì ngày cũ nhất (days đã xếp cũ trước).
export const activeDayOf = (days: string[], picked: string | null) =>
  picked && days.includes(picked) ? picked : days[0];

// Dải tab "Đơn ngày dd/mm" (Nhận hàng, chip Đang về ở Tồn kho).
export function DayTabs({
  days,
  active,
  onPick,
  flush,
}: {
  days: string[];
  active: string | undefined;
  onPick: (day: string) => void;
  flush?: boolean; // sát lề khi đặt trong khối đã có lề (thanh công cụ Tồn kho)
}) {
  return (
    <View style={[styles.row, flush && styles.flush]}>
      {days.map((d) => (
        <Pressable
          key={d}
          style={[styles.tab, d === active && styles.tabOn]}
          onPress={() => onPick(d)}
          accessibilityRole="tab"
          accessibilityState={{ selected: d === active }}
        >
          <Text style={[styles.text, d === active && styles.textOn]}>
            Đơn ngày {formatDayMonth(d)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = themedStyles((c: Palette) => ({
  row: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  flush: { paddingHorizontal: 0, paddingTop: 10, paddingBottom: 0 },
  tab: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: { backgroundColor: c.accentDeep, borderColor: c.accentDeep },
  text: { fontSize: 15, fontWeight: "600", color: c.ink },
  textOn: { color: c.onAccent },
}));

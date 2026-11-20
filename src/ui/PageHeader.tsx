import { View, type ViewStyle } from "react-native";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "./Text";

// Tiêu đề trang của web admin: tên trang + một dòng phụ (số lượng...).
export function PageHeader({
  title,
  sub,
  style,
}: {
  title: string;
  sub?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.head, style]}>
      <Text style={styles.title}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = themedStyles((c: Palette) => ({
  head: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: c.ink },
  sub: { fontSize: 14, color: c.muted },
}));

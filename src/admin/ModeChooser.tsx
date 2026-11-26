import { Pressable, ScrollView, View } from "react-native";
import type { WebMode } from "../navigation/adminWeb";
import { themedStyles } from "../theme/themedStyles";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/themes";
import { Glyph, Logo } from "../ui/icons";
import { Text } from "../ui/Text";

const OPTIONS: { mode: WebMode; title: string; detail: string }[] = [
  {
    mode: "app",
    title: "App tồn kho",
    detail:
      "Tồn kho, Ghi dùng, Đặt hàng, Nhận hàng, Kiểm kho như trên điện thoại.",
  },
  {
    mode: "console",
    title: "Trang Quản trị",
    detail: "Người dùng, Danh mục, Sửa hàng loạt, Nhật ký thay đổi.",
  },
];

// Quản trị đăng nhập trên web (máy tính, iPhone qua Safari) chọn vào đâu; đổi lại được trong Menu / thanh bên.
export function ModeChooser({
  branchName,
  onPick,
  onSignOut,
}: {
  branchName: string;
  onPick: (mode: WebMode) => void;
  onSignOut: () => void;
}) {
  const { theme, palette } = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.inner}>
        <View style={styles.head}>
          <Logo theme={theme} size={48} />
          <Text style={styles.title}>Mở phần nào?</Text>
          <Text style={styles.sub}>
            {branchName}. Đổi lại được bất cứ lúc nào.
          </Text>
        </View>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.mode}
            onPress={() => onPick(o.mode)}
            accessibilityRole="button"
            accessibilityLabel={`${o.title}: ${o.detail}`}
            // react-native-web có thêm trạng thái hovered (kiểu của RN chưa khai báo).
            style={(state) => [
              styles.option,
              (state as { hovered?: boolean }).hovered && styles.optionHover,
              state.pressed && styles.pressed,
            ]}
          >
            <Text style={styles.optionTitle}>{o.title}</Text>
            <Text style={styles.optionDetail}>{o.detail}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Đăng xuất"
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <Glyph name="logout" color={palette.red} size={18} />
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = themedStyles((c: Palette) => ({
  page: { flexGrow: 1, justifyContent: "center", padding: 20 },
  inner: { width: "100%", maxWidth: 440, alignSelf: "center", gap: 12 },
  head: { alignItems: "center", gap: 6, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: "700", color: c.ink },
  sub: { fontSize: 15, color: c.muted, textAlign: "center" },
  option: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 16,
    padding: 18,
    gap: 4,
    minHeight: 88,
    justifyContent: "center",
  },
  optionHover: { borderColor: c.accentDeep, backgroundColor: c.accentSoft },
  optionTitle: { fontSize: 18, fontWeight: "700", color: c.accentDeep },
  optionDetail: { fontSize: 15, color: c.muted, lineHeight: 21 },
  pressed: { opacity: 0.7 },
  logout: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  logoutText: { fontSize: 15, fontWeight: "600", color: c.red },
}));

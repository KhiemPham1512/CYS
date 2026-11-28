import { Pressable, ScrollView, View } from "react-native";
import type { Branch } from "../branches/api";
import type { WebMode } from "../navigation/adminWeb";
import { themedStyles } from "../theme/themedStyles";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/themes";
import { Glyph, Logo } from "../ui/icons";
import { Text } from "../ui/Text";

type Choice = { key: string; title: string; detail?: string };

const OPTIONS: (Choice & { key: WebMode })[] = [
  {
    key: "app",
    title: "App tồn kho",
    detail:
      "Tồn kho, Ghi dùng, Đặt hàng, Nhận hàng, Kiểm kho như trên điện thoại.",
  },
  {
    key: "console",
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
  return (
    <ChoiceScreen
      title="Mở phần nào?"
      sub={`${branchName}. Đổi lại được bất cứ lúc nào.`}
      choices={OPTIONS}
      onPick={(key) => onPick(key as WebMode)}
      onSignOut={onSignOut}
    />
  );
}

// Quản trị cấp cao mở app tồn kho: chọn Chi nhánh để làm việc (mọi quán, kể cả quán của mình).
export function BranchChooser({
  branches,
  onPick,
  onBack,
  onSignOut,
}: {
  branches: Branch[];
  onPick: (branch: Branch) => void;
  onBack: () => void;
  onSignOut: () => void;
}) {
  return (
    <ChoiceScreen
      title="Vào Chi nhánh nào?"
      sub="Chọn lại được khi mở lại App tồn kho từ Trang Quản trị."
      choices={branches.map((b) => ({
        key: b.branch_id,
        title: b.branch_name,
      }))}
      onPick={(key) => {
        const b = branches.find((x) => x.branch_id === key);
        if (b) onPick(b);
      }}
      onBack={onBack}
      onSignOut={onSignOut}
    />
  );
}

function ChoiceScreen({
  title,
  sub,
  choices,
  onPick,
  onBack,
  onSignOut,
}: {
  title: string;
  sub: string;
  choices: Choice[];
  onPick: (key: string) => void;
  onBack?: () => void;
  onSignOut: () => void;
}) {
  const { theme, palette } = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.inner}>
        <View style={styles.head}>
          <Logo theme={theme} size={48} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>
        {choices.map((o) => (
          <Pressable
            key={o.key}
            onPress={() => onPick(o.key)}
            accessibilityRole="button"
            accessibilityLabel={o.detail ? `${o.title}: ${o.detail}` : o.title}
            // react-native-web có thêm trạng thái hovered (kiểu của RN chưa khai báo).
            style={(state) => [
              styles.option,
              !o.detail && styles.optionShort,
              (state as { hovered?: boolean }).hovered && styles.optionHover,
              state.pressed && styles.pressed,
            ]}
          >
            <Text style={styles.optionTitle}>{o.title}</Text>
            {o.detail ? (
              <Text style={styles.optionDetail}>{o.detail}</Text>
            ) : null}
          </Pressable>
        ))}
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.footerBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.backText}>Quay lại</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Đăng xuất"
          style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}
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
  optionShort: { minHeight: 56 },
  optionHover: { borderColor: c.accentDeep, backgroundColor: c.accentSoft },
  optionTitle: { fontSize: 18, fontWeight: "700", color: c.accentDeep },
  optionDetail: { fontSize: 15, color: c.muted, lineHeight: 21 },
  pressed: { opacity: 0.7 },
  footerBtn: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  backText: { fontSize: 15, fontWeight: "600", color: c.accentDeep },
  logoutText: { fontSize: 15, fontWeight: "600", color: c.red },
}));

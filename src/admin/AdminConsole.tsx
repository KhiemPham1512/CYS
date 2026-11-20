import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { CatalogScreen } from "../catalog/CatalogScreen";
import { BulkEditScreen } from "../catalog/BulkEditScreen";
import { ADMIN_PAGES, type AdminPageKey } from "../navigation/adminWeb";
import { themedStyles } from "../theme/themedStyles";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/themes";
import { Glyph, Logo } from "../ui/icons";
import { Text } from "../ui/Text";
import { UsersScreen } from "../users/UsersScreen";
import { AuditScreen } from "./AuditScreen";

const SIDEBAR_FROM = 900; // từ bề rộng này trở lên: thanh bên trái; hẹp hơn: dải mục nằm ngang ở trên

// Web dành cho Quản trị: thanh bên trái + một trang một lúc. Dùng lại các màn quản trị đã có.
export function AdminConsole({
  branchId,
  branchName,
  userId,
  email,
  onSignOut,
}: {
  branchId: string;
  branchName: string;
  userId: string;
  email: string;
  onSignOut: () => void;
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const side = width >= SIDEBAR_FROM;
  const [page, setPage] = useState<AdminPageKey>("audit");

  const nav = ADMIN_PAGES.map((p) => (
    <Pressable
      key={p.key}
      onPress={() => setPage(p.key)}
      accessibilityRole="button"
      accessibilityState={{ selected: page === p.key }}
      style={({ pressed }) => [
        styles.item,
        side ? styles.itemSide : styles.itemTop,
        page === p.key && styles.itemOn,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.itemText, page === p.key && styles.itemTextOn]}>
        {p.label}
      </Text>
    </Pressable>
  ));

  return (
    <View style={[styles.root, side && styles.rootSide]}>
      {side ? (
        <View style={styles.sidebar}>
          <View style={styles.brand}>
            <Logo theme={theme} size={36} />
            <View style={styles.grow}>
              <Text style={styles.brandTitle}>Quản trị</Text>
              <Text style={styles.brandSub} numberOfLines={1}>
                {branchName}
              </Text>
            </View>
          </View>
          <View style={styles.navList}>{nav}</View>
          <View style={styles.grow} />
          <Account email={email} onSignOut={onSignOut} />
        </View>
      ) : (
        <View style={styles.topbar}>
          <View style={styles.brand}>
            <Logo theme={theme} size={30} />
            <Text style={[styles.brandTitle, styles.grow]} numberOfLines={1}>
              Quản trị · {branchName}
            </Text>
            <Account email={email} onSignOut={onSignOut} compact />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.navRow}>{nav}</View>
          </ScrollView>
        </View>
      )}

      <View style={styles.content}>
        {page === "audit" && <AuditScreen branchId={branchId} />}
        {page === "users" && <UsersScreen currentUserId={userId} />}
        {page === "catalog" && <CatalogScreen branchId={branchId} />}
        {page === "bulk" && <BulkEditScreen branchId={branchId} />}
      </View>
    </View>
  );
}

function Account({
  email,
  onSignOut,
  compact,
}: {
  email: string;
  onSignOut: () => void;
  compact?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View style={compact ? styles.accountCompact : styles.account}>
      {!compact && (
        <Text style={styles.email} numberOfLines={1}>
          {email}
        </Text>
      )}
      <Pressable
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Đăng xuất"
        style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
      >
        <Glyph name="logout" color={palette.red} size={18} />
        {!compact && <Text style={styles.logoutText}>Đăng xuất</Text>}
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c: Palette) => ({
  root: { flex: 1, backgroundColor: c.bg },
  rootSide: { flexDirection: "row" },
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
  sidebar: {
    width: 248,
    padding: 16,
    gap: 16,
    backgroundColor: c.surface,
    borderRightWidth: 1,
    borderRightColor: c.line,
  },
  topbar: {
    padding: 12,
    gap: 8,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandTitle: { fontSize: 18, fontWeight: "700", color: c.ink },
  brandSub: { fontSize: 12, color: c.muted },
  navList: { gap: 4 },
  navRow: { flexDirection: "row", gap: 6 },
  item: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  itemSide: {},
  itemTop: { borderWidth: 1, borderColor: c.line },
  itemOn: { backgroundColor: c.accentSoft, borderColor: c.accentDeep },
  itemText: { fontSize: 15, fontWeight: "500", color: c.ink },
  itemTextOn: { fontWeight: "700", color: c.accentDeep },
  account: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 12,
  },
  accountCompact: { flexDirection: "row" },
  email: { fontSize: 13, color: c.muted },
  logout: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoutText: { fontSize: 15, fontWeight: "600", color: c.red },
  content: { flex: 1 },
}));

import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { CatalogScreen } from "../catalog/CatalogScreen";
import { BulkEditScreen } from "../catalog/BulkEditScreen";
import {
  ADMIN_PAGES,
  WIDE_LAYOUT,
  type AdminPageKey,
} from "../navigation/adminWeb";
import { themedStyles } from "../theme/themedStyles";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/themes";
import { Glyph, Logo } from "../ui/icons";
import { useOnline } from "../lib/useOnline";
import { Text } from "../ui/Text";
import { UsersScreen } from "../users/UsersScreen";
import type { Branch } from "../branches/api";
import { SystemScreen } from "../branches/SystemScreen";
import { AuditScreen } from "./AuditScreen";

type Page = AdminPageKey | "system";

// Web dành cho Quản trị: thanh bên trái + một trang một lúc. Dùng lại các màn quản trị đã có.
// branches != null: Quản trị cấp cao, đổi được quán đang xem và có trang Hệ thống.
export function AdminConsole({
  branchId: ownBranchId,
  branchName: ownBranchName,
  branches,
  onBranchesChanged,
  userId,
  email,
  onSignOut,
}: {
  branchId: string;
  branchName: string;
  branches: Branch[] | null;
  onBranchesChanged: () => Promise<void>;
  userId: string;
  email: string;
  onSignOut: () => void;
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const side = width >= WIDE_LAYOUT;
  const online = useOnline();
  const [page, setPage] = useState<Page>("audit");
  const [branchId, setBranchId] = useState(ownBranchId);
  const owner = branches !== null;
  const branchName =
    branches?.find((b) => b.branch_id === branchId)?.branch_name ??
    ownBranchName;
  const heading = page === "system" ? "Toàn hệ thống" : branchName;

  const navItem = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.item,
        !side && styles.itemTop,
        selected && styles.itemOn,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[styles.itemText, selected && styles.itemTextOn]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
  const pageNav = ADMIN_PAGES.map((p) =>
    navItem(p.key, p.label, page === p.key, () => setPage(p.key))
  );
  const branchNav = (branches ?? []).map((b) =>
    navItem(
      b.branch_id,
      b.branch_name,
      page !== "system" && b.branch_id === branchId,
      () => {
        setBranchId(b.branch_id);
        if (page === "system") setPage("audit");
      }
    )
  );
  const systemNav = owner
    ? navItem("system", "Hệ thống", page === "system", () => setPage("system"))
    : null;

  return (
    <View style={[styles.root, side && styles.rootSide]}>
      {side ? (
        <View style={styles.sidebar}>
          <View style={styles.brand}>
            <Logo theme={theme} size={36} />
            <View style={styles.grow}>
              <Text style={styles.brandTitle}>
                {owner ? "Quản trị cấp cao" : "Quản trị"}
              </Text>
              <Text style={styles.brandSub} numberOfLines={1}>
                {heading}
              </Text>
            </View>
          </View>
          <ScrollView
            style={styles.grow}
            contentContainerStyle={styles.navList}
          >
            {owner && <Text style={styles.groupLabel}>Chi nhánh</Text>}
            {branchNav}
            {owner && <Text style={styles.groupLabel}>Trang của quán</Text>}
            {pageNav}
            {owner && <View style={styles.divider} />}
            {systemNav}
          </ScrollView>
          <Account email={email} onSignOut={onSignOut} />
        </View>
      ) : (
        <View style={styles.topbar}>
          <View style={styles.brand}>
            <Logo theme={theme} size={30} />
            <Text style={[styles.brandTitle, styles.grow]} numberOfLines={1}>
              Quản trị · {heading}
            </Text>
            <Account email={email} onSignOut={onSignOut} compact />
          </View>
          {owner && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.navRow}>
                {branchNav}
                {systemNav}
              </View>
            </ScrollView>
          )}
          {page !== "system" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.navRow}>{pageNav}</View>
            </ScrollView>
          )}
        </View>
      )}

      {/* key=branchId: đổi quán thì các trang tải lại từ đầu, không lẫn dữ liệu quán cũ. */}
      <View
        style={styles.content}
        key={page === "system" ? "system" : branchId}
      >
        {!online && (
          <Text style={styles.offline}>Mất mạng, đang chờ kết nối lại</Text>
        )}
        {page === "audit" && <AuditScreen branchId={branchId} />}
        {page === "users" && (
          <UsersScreen
            branchId={branchId}
            currentUserId={userId}
            role={owner ? "owner" : "branch_admin"}
          />
        )}
        {page === "catalog" && <CatalogScreen branchId={branchId} />}
        {page === "bulk" && <BulkEditScreen branchId={branchId} />}
        {page === "system" && branches && (
          <SystemScreen
            branches={branches}
            currentUserId={userId}
            onBranchesChanged={onBranchesChanged}
          />
        )}
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
  root: { flex: 1, width: "100%", alignSelf: "stretch", backgroundColor: c.bg },
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
  groupLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: c.muted,
    marginTop: 8,
    marginLeft: 14,
  },
  divider: { height: 1, backgroundColor: c.line, marginVertical: 8 },
  navRow: { flexDirection: "row", gap: 6 },
  item: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 12,
  },
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
  offline: {
    backgroundColor: c.redSoft,
    color: c.red,
    textAlign: "center",
    padding: 8,
    fontWeight: "600",
  },
}));

import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";
import { useOnline } from "./src/lib/useOnline";
import { useLockWatch } from "./src/lib/useLockWatch";
import { CatalogScreen } from "./src/catalog/CatalogScreen";
import { CountScreen } from "./src/stock/CountScreen";
import { StockScreen } from "./src/stock/StockScreen";
import { ExportScreen } from "./src/orders/ExportScreen";
import { OrderScreen } from "./src/orders/OrderScreen";
import { OwedScreen } from "./src/orders/OwedScreen";
import { ReceiveScreen } from "./src/orders/ReceiveScreen";
import { UseScreen } from "./src/stock/UseScreen";
import { UsersScreen } from "./src/users/UsersScreen";

const LOCKED_MESSAGE = "Người dùng này đã bị khóa. Liên hệ Quản trị.";
// RLS không phân biệt bị khóa với bị gỡ khỏi Chi nhánh.
const NO_ACCESS_MESSAGE =
  "Bạn không còn quyền vào Chi nhánh (bị khóa hoặc bị gỡ). Liên hệ Quản trị.";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const online = useOnline();
  const onLocked = useCallback(() => {
    setNotice(NO_ACCESS_MESSAGE);
    void supabase.auth.signOut({ scope: "local" }); // đã bị cấm: chỉ xóa phiên trên máy
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) setNotice(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <View style={styles.root}>
      {!online && (
        <Text style={styles.offline} accessibilityRole="alert">
          Mất mạng — không lưu được thay đổi cho tới khi có mạng lại.
        </Text>
      )}
      <View style={styles.body}>
        {session === undefined ? (
          <ActivityIndicator />
        ) : session ? (
          <HomeScreen userId={session.user.id} onLocked={onLocked} />
        ) : (
          <LoginScreen online={online} notice={notice} />
        )}
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

function LoginScreen({
  online,
  notice,
}: {
  online: boolean;
  notice: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setError(
        error.code === "user_banned"
          ? LOCKED_MESSAGE
          : "Sai email hoặc mật khẩu, hoặc lỗi kết nối."
      );
    }
    setBusy(false);
  }

  const disabled = !online || busy || !email || !password;
  return (
    <View style={styles.form}>
      <Text style={styles.title}>CYS — Đăng nhập</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mật khẩu"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => !disabled && signIn()}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, disabled && styles.buttonDisabled]}
        disabled={disabled}
        onPress={signIn}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </Text>
      </Pressable>
    </View>
  );
}

type HomeView =
  | "stock"
  | "use"
  | "order"
  | "receive"
  | "owed"
  | "export"
  | "count"
  | "catalog"
  | "users";

const NAV_TABS: { key: HomeView; label: string; adminOnly?: boolean }[] = [
  { key: "stock", label: "Tồn kho" },
  { key: "use", label: "Ghi dùng" },
  { key: "order", label: "Đặt hàng" },
  { key: "receive", label: "Nhận hàng" },
  { key: "owed", label: "Hàng thiếu" },
  { key: "export", label: "Xuất ảnh" },
  { key: "count", label: "Kiểm kho" },
  { key: "catalog", label: "Danh mục" },
  { key: "users", label: "Người dùng", adminOnly: true },
];

function HomeScreen({
  userId,
  onLocked,
}: {
  userId: string;
  onLocked: () => void;
}) {
  useLockWatch(userId, onLocked);
  // undefined = đang tải; null = không có Chi nhánh (chưa là thành viên hoặc bị khóa).
  const [branch, setBranch] = useState<
    { branch_id: string; branch_name: string } | null | undefined
  >();
  const [error, setError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<HomeView>("stock");

  useEffect(() => {
    // shortcut: lấy Chi nhánh đầu tiên; khi một người thuộc nhiều Chi nhánh thì thêm bước chọn.
    supabase
      .from("branch_settings")
      .select("branch_id, branch_name")
      .order("branch_id")
      .limit(1)
      .maybeSingle()
      .then(async ({ data, error }) => {
        setError(!!error);
        setBranch(data ?? null);
        if (!data) return;
        const { data: me } = await supabase
          .from("members")
          .select("is_admin")
          .eq("branch_id", data.branch_id)
          .eq("user_id", userId)
          .maybeSingle();
        setIsAdmin(me?.is_admin ?? false);
      });
  }, [userId]);

  if (branch) {
    return (
      <View style={styles.homeContainer}>
        <View style={styles.topBar}>
          <Text style={styles.branchTitle}>{branch.branch_name}</Text>
          <View style={styles.topActions}>
            <Pressable
              style={styles.linkButton}
              onPress={() => supabase.auth.signOut()}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Đăng xuất</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.navScroll}
          contentContainerStyle={styles.navBar}
        >
          {NAV_TABS.filter((tab) => !tab.adminOnly || isAdmin).map((tab) => {
            const selected = view === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.navTab, selected && styles.navTabSelected]}
                onPress={() => setView(tab.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.navTabText,
                    selected && styles.navTabTextSelected,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {view === "stock" ? (
          <StockScreen branchId={branch.branch_id} />
        ) : view === "use" ? (
          <UseScreen branchId={branch.branch_id} userId={userId} />
        ) : view === "order" ? (
          <OrderScreen branchId={branch.branch_id} />
        ) : view === "receive" ? (
          <ReceiveScreen branchId={branch.branch_id} />
        ) : view === "owed" ? (
          <OwedScreen branchId={branch.branch_id} />
        ) : view === "export" ? (
          <ExportScreen
            branchId={branch.branch_id}
            branchName={branch.branch_name}
          />
        ) : view === "count" ? (
          <CountScreen
            branchId={branch.branch_id}
            onDone={() => setView("stock")}
          />
        ) : isAdmin && view === "users" ? (
          <UsersScreen currentUserId={userId} />
        ) : (
          <CatalogScreen branchId={branch.branch_id} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.form}>
      {branch === undefined ? (
        <ActivityIndicator />
      ) : error ? (
        <Text style={styles.error}>Không tải được dữ liệu. Kiểm tra mạng.</Text>
      ) : (
        <Text style={styles.error}>
          Bạn chưa thuộc Chi nhánh nào hoặc đã bị khóa. Liên hệ Quản trị.
        </Text>
      )}
      <Pressable
        style={styles.linkButton}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button"
      >
        <Text style={styles.link}>Đăng xuất</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  offline: {
    backgroundColor: "#b91c1c",
    color: "#fff",
    padding: 12,
    paddingTop: 48,
    textAlign: "center",
    fontWeight: "600",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  form: { width: "100%", maxWidth: 360, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: { color: "#b91c1c", textAlign: "center" },
  button: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    minHeight: 48,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkButton: { padding: 12, alignItems: "center", minHeight: 44 },
  link: { color: "#0f766e", fontSize: 16 },
  homeContainer: { flex: 1, width: "100%", paddingTop: 32 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  branchTitle: { fontSize: 18, fontWeight: "700" },
  navScroll: { flexGrow: 0 },
  navBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  navTab: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d4d4d8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  navTabSelected: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  navTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#27272a",
  },
  navTabTextSelected: {
    color: "#fff",
  },
  topActions: { flexDirection: "row", alignItems: "center" },
});

import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";
import { useOnline } from "./src/lib/useOnline";
import { CatalogScreen } from "./src/catalog/CatalogScreen";
import { CountScreen } from "./src/stock/CountScreen";
import { StockScreen } from "./src/stock/StockScreen";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>();
  const online = useOnline();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s)
    );
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
          <HomeScreen />
        ) : (
          <LoginScreen online={online} />
        )}
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

function LoginScreen({ online }: { online: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setError("Sai email hoặc mật khẩu, hoặc lỗi kết nối.");
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

type HomeView = "stock" | "count" | "catalog";

const NAV_TABS: { key: HomeView; label: string }[] = [
  { key: "stock", label: "Tồn kho" },
  { key: "count", label: "Kiểm kho" },
  { key: "catalog", label: "Danh mục" },
];

function HomeScreen() {
  // undefined = đang tải; null = không có Chi nhánh (chưa là thành viên hoặc bị khóa).
  const [branch, setBranch] = useState<
    { branch_id: string; branch_name: string } | null | undefined
  >();
  const [error, setError] = useState(false);
  const [view, setView] = useState<HomeView>("stock");

  useEffect(() => {
    // shortcut: lấy Chi nhánh đầu tiên; khi một người thuộc nhiều Chi nhánh thì thêm bước chọn.
    supabase
      .from("branch_settings")
      .select("branch_id, branch_name")
      .order("branch_id")
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        setError(!!error);
        setBranch(data ?? null);
      });
  }, []);

  if (branch) {
    return (
      <View style={styles.homeContainer}>
        <View style={styles.topBar}>
          <Text style={styles.branchTitle}>{branch.branch_name}</Text>
          <Pressable
            style={styles.linkButton}
            onPress={() => supabase.auth.signOut()}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Đăng xuất</Text>
          </Pressable>
        </View>
        <View style={styles.navBar}>
          {NAV_TABS.map((tab) => {
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
        </View>
        {view === "stock" ? (
          <StockScreen branchId={branch.branch_id} />
        ) : view === "count" ? (
          <CountScreen
            branchId={branch.branch_id}
            onDone={() => setView("stock")}
          />
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
  navBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  navTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d4d4d8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
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
});

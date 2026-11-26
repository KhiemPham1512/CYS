import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
} from "@expo-google-fonts/be-vietnam-pro";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Loading } from "./src/ui/Loading";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";
import { useOnline } from "./src/lib/useOnline";
import { useLockWatch } from "./src/lib/useLockWatch";
import type { HubKey, MainTabKey } from "./src/navigation/tabs";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import type { Palette } from "./src/theme/themes";
import { Bow, Glyph, Logo } from "./src/ui/icons";
import { HubSheet } from "./src/ui/HubSheet";
import { ConfirmHost } from "./src/ui/ConfirmHost";
import { MenuScreen } from "./src/ui/MenuScreen";
import { fontFamily, useReduceMotion } from "./src/ui/motion";
import { Splash } from "./src/ui/Splash";
import { TabBar } from "./src/ui/TabBar";
import { AdminWebGate } from "./src/admin/AdminWebGate";
import { DevScreen } from "./src/admin/DevScreen";
import { ModeChooser } from "./src/admin/ModeChooser";
import { adminWebView, type WebMode } from "./src/navigation/adminWeb";
import { CatalogScreen } from "./src/catalog/CatalogScreen";
import { CountScreen } from "./src/stock/CountScreen";
import { StockScreen } from "./src/stock/StockScreen";
import { ExpiryScreen } from "./src/stock/ExpiryScreen";
import { ExportScreen } from "./src/orders/ExportScreen";
import { OrderScreen } from "./src/orders/OrderScreen";
import { OwedScreen } from "./src/orders/OwedScreen";
import { ReceiveScreen } from "./src/orders/ReceiveScreen";
import { UseScreen } from "./src/stock/UseScreen";
import { ReadOrderScreen } from "./src/supplier/ReadOrderScreen";

const LOCKED_MESSAGE = "Người dùng này đã bị khóa. Liên hệ Quản trị.";
// RLS không phân biệt bị khóa, bị gỡ hay đã Chuyển quán.
const NO_ACCESS_MESSAGE =
  "Bạn không còn ở Chi nhánh này (bị khóa, bị gỡ hoặc đã chuyển quán). Đăng nhập lại hoặc liên hệ Quản trị.";

export default function App() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}

function Root() {
  const { palette, ready: themeReady } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });
  const [session, setSession] = useState<Session | null | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [splashDone, setSplashDone] = useState(false);
  const online = useOnline();
  const onLocked = useCallback(() => {
    setNotice(NO_ACCESS_MESSAGE);
    void supabase.auth.signOut({ scope: "local" }); // đã bị cấm: chỉ xóa phiên trên máy
  }, []);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) setNotice(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const styles = useMemo(() => makeStyles(palette), [palette]);
  // Font lỗi thì dùng font hệ thống, không treo màn trắng.
  if (!themeReady || (!fontsLoaded && !fontError))
    return <View style={styles.root} />;
  return (
    <View style={styles.root}>
      {!online && (
        <Text style={styles.offline} accessibilityRole="alert">
          Mất mạng — không lưu được thay đổi cho tới khi có mạng lại.
        </Text>
      )}
      <View style={styles.body}>
        {session === undefined ? (
          <Loading />
        ) : session ? (
          <HomeScreen
            userId={session.user.id}
            email={session.user.email ?? ""}
            online={online}
            onLocked={onLocked}
          />
        ) : (
          <LoginScreen online={online} notice={notice} />
        )}
      </View>
      <ConfirmHost />
      {!splashDone && <Splash onDone={finishSplash} />}
      <StatusBar style="dark" />
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
  const { theme, palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<"email" | "password" | null>(null);
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
  const field = (name: "email" | "password") => [
    styles.field,
    { borderColor: focus === name ? palette.accent : palette.line },
    focus === name && { borderWidth: 2 },
  ];
  return (
    <Enter k="login" style={styles.form}>
      <View style={styles.logoWrap}>
        <Logo theme={theme} size={80} />
        {theme === "pink" && (
          <View style={styles.logoBow}>
            <Bow color={palette.accent} width={30} />
          </View>
        )}
      </View>
      <Text style={styles.loginTitle}>Chào mừng trở lại</Text>
      <Text style={styles.loginSub}>Đăng nhập để quản lý kho của quán</Text>

      <Text style={styles.label}>Email</Text>
      <View style={field("email")}>
        <Glyph
          name="mail"
          color={focus === "email" ? palette.accent : palette.muted}
          size={20}
        />
        <TextInput
          style={styles.fieldInput}
          placeholder="nhanvien@quan.vn"
          accessibilityLabel="Email"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocus("email")}
          onBlur={() => setFocus(null)}
        />
      </View>

      <Text style={styles.label}>Mật khẩu</Text>
      <View style={field("password")}>
        <Glyph
          name="lock"
          color={focus === "password" ? palette.accent : palette.muted}
          size={20}
        />
        <TextInput
          style={styles.fieldInput}
          placeholder="••••••••"
          accessibilityLabel="Mật khẩu"
          placeholderTextColor={palette.muted}
          secureTextEntry={!showPassword}
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocus("password")}
          onBlur={() => setFocus(null)}
          onSubmitEditing={() => !disabled && signIn()}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          hitSlop={10}
        >
          <Glyph
            name="eye"
            color={showPassword ? palette.accent : palette.muted}
            size={20}
          />
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          disabled && styles.buttonDisabled,
          pressed && { transform: [{ scale: 0.98 }] },
        ]}
        disabled={disabled}
        onPress={signIn}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </Text>
      </Pressable>
      <Text style={styles.fine}>
        Tài khoản do Quản trị cấp. Quên mật khẩu? Liên hệ Quản trị.
      </Text>
    </Enter>
  );
}

// Trang/màn mới vào: mờ dần và trượt lên nhẹ (220 ms). Giảm chuyển động thì chỉ mờ.
function Enter({
  k,
  children,
  style,
}: {
  k: string;
  children: ReactNode;
  style?: object;
}) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, {
      toValue: 1,
      duration: reduce ? 120 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [k, reduce, v]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            {
              translateY: reduce
                ? 0
                : v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

type HomeView = "stock" | "use" | "catalog" | "menu" | HubKey | "dev";

// Màn tự cập nhật theo thời gian thực: giữ lại khi chuyển tab. Màn khác dựng mới mỗi lần mở.
const KEEP_ALIVE = new Set<HomeView>([
  "stock",
  "use",
  "catalog",
  "order",
  "receive",
  "owed",
  "expiry",
]);

// Một màn trong khung chính: ẩn khi không chọn (vẫn giữ dữ liệu); hiện lại thì mờ dần + trượt nhẹ.
function Pane({
  active,
  children,
  style,
}: {
  active: boolean;
  children: ReactNode;
  style?: object;
}) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(active ? 0 : 1)).current;
  useEffect(() => {
    if (!active) return;
    v.setValue(0);
    Animated.timing(v, {
      toValue: 1,
      duration: reduce ? 100 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [active, reduce, v]);
  return (
    <Animated.View
      style={[
        style,
        { display: active ? "flex" : "none" },
        {
          opacity: v,
          transform: [
            {
              translateY: reduce
                ? 0
                : v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const TITLES: Record<HomeView, string> = {
  stock: "Tồn kho",
  use: "Ghi dùng",
  catalog: "Danh mục",
  menu: "Tài khoản",
  order: "Đặt hàng",
  receive: "Nhận hàng",
  owed: "Hàng thiếu",
  readOrder: "Đọc ảnh đơn",
  count: "Kiểm kho",
  expiry: "Hạn dùng",
  export: "Xuất ảnh",
  dev: "Chế độ phát triển",
};

function HomeScreen({
  userId,
  email,
  online,
  onLocked,
}: {
  userId: string;
  email: string;
  online: boolean;
  onLocked: () => void;
}) {
  const { theme, palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  // undefined = đang tải; null = không có Chi nhánh (chưa là thành viên hoặc bị khóa).
  const [branch, setBranch] = useState<
    { branch_id: string; branch_name: string } | null | undefined
  >();
  useLockWatch(userId, branch?.branch_id, onLocked);
  const [error, setError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [webChoice, setWebChoice] = useState<WebMode | null>(null); // chỉ Quản trị trên web dùng
  const [view, setView] = useState<HomeView>("stock");
  const [hubOpen, setHubOpen] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const devTapRef = useRef<{ count: number; firstAt: number }>({
    count: 0,
    firstAt: 0,
  });

  const onLogoPress = () => {
    if (!isAdmin || view !== "stock") return;
    const now = Date.now();
    if (
      devTapRef.current.count === 0 ||
      now - devTapRef.current.firstAt > 6000
    ) {
      devTapRef.current = { count: 1, firstAt: now };
      return;
    }
    const next = devTapRef.current.count + 1;
    if (next >= 10) {
      devTapRef.current = { count: 0, firstAt: 0 };
      setDevMode(true);
      setView("dev");
    } else {
      devTapRef.current.count = next;
    }
  };

  useEffect(() => {
    // Quán = dòng members của chính mình (mỗi người đúng một quán). Không đọc branch_settings
    // trước: Quản trị cấp cao đọc được mọi quán nên có thể vào nhầm quán.
    void (async () => {
      const { data: me, error: meError } = await supabase
        .from("members")
        .select("branch_id, is_admin")
        .eq("user_id", userId)
        .maybeSingle();
      if (meError || !me) {
        setError(!!meError);
        setBranch(null);
        return;
      }
      const { data, error } = await supabase
        .from("branch_settings")
        .select("branch_id, branch_name")
        .eq("branch_id", me.branch_id)
        .maybeSingle();
      setIsAdmin(me.is_admin);
      setError(!!error);
      setBranch(data ?? null);
    })();
  }, [userId]);

  const selectedTab: MainTabKey =
    view === "stock" || view === "use" || view === "catalog" || view === "menu"
      ? view
      : "hub";
  const onTab = (key: MainTabKey) => {
    if (key === "hub") {
      setHubOpen((o) => !o);
      return;
    }
    setHubOpen(false);
    setView(key);
  };
  const onHubPick = (key: HubKey) => {
    setHubOpen(false);
    setView(key);
  };

  const [mounted, setMounted] = useState<HomeView[]>(["stock"]);
  useEffect(() => {
    if (KEEP_ALIVE.has(view))
      setMounted((m) => (m.includes(view) ? m : [...m, view]));
  }, [view]);

  function renderView(k: HomeView) {
    if (!branch) return null;
    const id = branch.branch_id;
    switch (k) {
      case "stock":
        return <StockScreen branchId={id} />;
      case "use":
        return <UseScreen branchId={id} userId={userId} />;
      case "order":
        return <OrderScreen branchId={id} branchName={branch.branch_name} />;
      case "receive":
        return <ReceiveScreen branchId={id} isAdmin={isAdmin} />;
      case "owed":
        return <OwedScreen branchId={id} />;
      case "expiry":
        return <ExpiryScreen branchId={id} />;
      case "export":
        return <ExportScreen branchId={id} branchName={branch.branch_name} />;
      case "count":
        return <CountScreen branchId={id} onDone={() => setView("stock")} />;
      case "menu":
        return (
          <MenuScreen
            userId={userId}
            email={email}
            isAdmin={isAdmin}
            branchName={branch.branch_name}
            online={online}
            onSignOut={() => supabase.auth.signOut()}
            onOpenAdmin={
              webChoice === "app" ? () => setWebChoice("console") : undefined
            }
          />
        );
      case "readOrder":
        return <ReadOrderScreen userId={userId} branchId={id} />;
      case "catalog":
        return <CatalogScreen branchId={id} />;
      case "dev":
        return (
          <DevScreen
            branchId={id}
            branchName={branch.branch_name}
            onExit={() => {
              setDevMode(false);
              setView("stock");
            }}
          />
        );
    }
  }

  // Web: Quản trị chọn bảng điều khiển hoặc app tồn kho; nhân viên và điện thoại dùng app.
  const webView = adminWebView(Platform.OS === "web", isAdmin, webChoice);
  if (branch && webView === "choose")
    return (
      <ModeChooser
        branchName={branch.branch_name}
        onPick={setWebChoice}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  if (branch && webView === "console")
    return (
      <AdminWebGate
        branch={branch}
        userId={userId}
        email={email}
        onOpenApp={() => setWebChoice("app")}
      />
    );

  if (branch) {
    return (
      <View style={styles.homeContainer}>
        <View style={styles.topBar}>
          <View style={styles.topTitle}>
            <Text style={styles.screenTitle} numberOfLines={1}>
              {TITLES[view]}
              {theme === "pink" && view === "stock" ? "  " : ""}
            </Text>
            <Text style={styles.branchSub} numberOfLines={1}>
              {branch.branch_name}
            </Text>
          </View>
          {theme === "pink" && view === "stock" && (
            <Bow color={palette.accent} width={26} />
          )}
          <Pressable
            onPress={onLogoPress}
            accessibilityRole="button"
            accessibilityLabel="Logo"
          >
            <Logo theme={theme} size={34} />
          </Pressable>
        </View>
        {devMode && (
          <Pressable
            style={styles.devStrip}
            onPress={() => setView("dev")}
            accessibilityRole="button"
          >
            <Text style={styles.devStripText}>Chế độ phát triển</Text>
          </Pressable>
        )}
        {/* Màn đã mở được giữ lại (ẩn đi) để quay lại tức thì, không tải lại; chỉ màn có cập nhật thời gian thực. */}
        {mounted.map((k) => (
          <Pane
            key={`${theme}-${k}`}
            active={k === view}
            style={styles.content}
          >
            {renderView(k)}
          </Pane>
        ))}
        {!KEEP_ALIVE.has(view) && (
          <Pane key={`fresh-${theme}-${view}`} active style={styles.content}>
            {renderView(view)}
          </Pane>
        )}
        {/* shortcut: số đỏ trên Hub chưa nối dữ liệu (đơn chờ nhận, hạn sắp tới); làm ở PR từng màn. */}
        <HubSheet
          open={hubOpen}
          badges={{}}
          onPick={onHubPick}
          onClose={() => setHubOpen(false)}
        />
        <TabBar selected={selectedTab} hubOpen={hubOpen} onSelect={onTab} />
      </View>
    );
  }

  return (
    <View style={styles.form}>
      {branch === undefined ? (
        <Loading />
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    offline: {
      backgroundColor: c.red,
      color: "#fff",
      padding: 12,
      paddingTop: 48,
      textAlign: "center",
      fontFamily: fontFamily.semi,
    },
    body: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    form: { width: "100%", maxWidth: 392, gap: 8, padding: 16 },
    logoWrap: { alignSelf: "center", marginBottom: 12 },
    logoBow: {
      position: "absolute",
      top: -6,
      right: -18,
      transform: [{ rotate: "14deg" }],
    },
    loginTitle: { fontSize: 26, fontFamily: fontFamily.bold, color: c.ink },
    loginSub: {
      fontSize: 14,
      color: c.muted,
      fontFamily: fontFamily.regular,
      marginBottom: 10,
    },
    label: {
      fontSize: 12,
      color: c.muted,
      fontFamily: fontFamily.medium,
      marginTop: 4,
    },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      minHeight: 52,
    },
    fieldInput: {
      flex: 1,
      fontSize: 15,
      color: c.ink,
      fontFamily: fontFamily.regular,
      paddingVertical: 12,
    },
    error: { color: c.red, textAlign: "center", fontFamily: fontFamily.medium },
    button: {
      backgroundColor: c.accentDeep,
      borderRadius: 16,
      padding: 14,
      alignItems: "center",
      minHeight: 52,
      justifyContent: "center",
      marginTop: 10,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: {
      color: c.onAccent,
      fontSize: 16,
      fontFamily: fontFamily.semi,
    },
    fine: {
      color: c.muted,
      fontSize: 12,
      textAlign: "center",
      fontFamily: fontFamily.regular,
      marginTop: 8,
    },
    linkButton: { padding: 12, alignItems: "center", minHeight: 44 },
    link: { color: c.accentDeep, fontSize: 16, fontFamily: fontFamily.medium },
    homeContainer: { flex: 1, width: "100%", paddingTop: 36 },
    content: { flex: 1 },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    topTitle: { flex: 1 },
    screenTitle: { fontSize: 24, fontFamily: fontFamily.bold, color: c.ink },
    branchSub: { fontSize: 12, color: c.muted, fontFamily: fontFamily.regular },
    devStrip: {
      backgroundColor: c.amberSoft,
      paddingVertical: 6,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    devStripText: {
      color: c.amber,
      fontSize: 12,
      fontFamily: fontFamily.semi,
    },
  });

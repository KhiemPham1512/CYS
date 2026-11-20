import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  useWindowDimensions,
  View,
} from "react-native";
import { TextInput } from "../ui/TextInput";
import { switchTrack, themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import { Loading } from "../ui/Loading";
import { validateNewUser } from "../../supabase/functions/admin-users/logic.ts";
import { useOnline } from "../lib/useOnline";
import {
  createUser,
  listUsers,
  setAdmin,
  setLocked,
  type ManagedUser,
} from "./api";

const WIDE = 900; // từ bề rộng này trở lên: bảng + khung thêm người dùng đặt cạnh nhau (web máy tính)

export function UsersScreen({ currentUserId }: { currentUserId: string }) {
  const online = useOnline();
  const wide = useWindowDimensions().width >= WIDE;
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(
    null
  );

  const reload = useCallback(async () => {
    setLoadError(null);
    const { data, error } = await listUsers();
    if (error) setLoadError(error);
    else setUsers(data ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(
    userId: string,
    run: () => Promise<{ error: string | null }>
  ) {
    setBusyId(userId);
    setRowError(null);
    const { error } = await run();
    if (error) setRowError({ id: userId, msg: error });
    await reload();
    setBusyId(null);
  }

  if (loadError && !users) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
        <Pressable
          style={styles.button}
          onPress={reload}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }
  if (!users) {
    return (
      <View style={styles.center}>
        <Loading />
      </View>
    );
  }

  const disabled = !online || busyId !== null;
  const rows = users.map((u) => {
    const self = u.user_id === currentUserId;
    const actions = !self && (
      <View style={styles.actions}>
        <Pressable
          style={[styles.smallButton, disabled && styles.disabled]}
          disabled={disabled}
          onPress={() =>
            act(u.user_id, () => setLocked(u.user_id, !u.is_locked))
          }
          accessibilityRole="button"
        >
          <Text style={styles.smallButtonText}>
            {u.is_locked ? "Mở khóa" : "Khóa"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.smallButton, disabled && styles.disabled]}
          disabled={disabled}
          onPress={() => act(u.user_id, () => setAdmin(u.user_id, !u.is_admin))}
          accessibilityRole="button"
        >
          <Text style={styles.smallButtonText}>
            {u.is_admin ? "Bỏ Quản trị" : "Cấp Quản trị"}
          </Text>
        </Pressable>
      </View>
    );
    const badges = (
      <View style={styles.badges}>
        {u.is_admin && <Text style={styles.badge}>Quản trị</Text>}
        {u.is_locked && (
          <Text style={[styles.badge, styles.badgeLocked]}>Đã khóa</Text>
        )}
      </View>
    );
    const err = rowError?.id === u.user_id && (
      <Text style={styles.error}>{rowError.msg}</Text>
    );
    return wide ? (
      <View key={u.user_id} style={styles.trWide}>
        <View style={styles.colEmail}>
          <Text style={styles.email}>
            {u.email}
            {self ? " (bạn)" : ""}
          </Text>
          {err}
        </View>
        <View style={styles.colState}>{badges}</View>
        <View style={styles.colActions}>{actions}</View>
      </View>
    ) : (
      <View key={u.user_id} style={styles.row}>
        <Text style={styles.email}>
          {u.email}
          {self ? " (bạn)" : ""}
        </Text>
        {badges}
        {actions}
        {err}
      </View>
    );
  });

  if (!wide) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        {!online && (
          <Text style={styles.error}>Mất mạng — không thay đổi được</Text>
        )}
        {rows}
        <NewUserForm disabled={!online} onCreated={reload} />
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.pageWide}>
      <View style={styles.innerWide}>
        <View style={styles.headWide}>
          <Text style={styles.pageTitle}>Người dùng</Text>
          <Text style={styles.pageSub}>{users.length} tài khoản</Text>
        </View>
        {!online && (
          <Text style={styles.error}>Mất mạng — không thay đổi được</Text>
        )}
        <View style={styles.split}>
          <View style={[styles.card, styles.tableCard]}>
            <View style={[styles.trWide, styles.thWide]}>
              <Text style={[styles.th, styles.colEmail]}>EMAIL</Text>
              <Text style={[styles.th, styles.colState]}>VAI TRÒ</Text>
              <Text style={[styles.th, styles.colActions, styles.thRight]}>
                THAO TÁC
              </Text>
            </View>
            {rows}
          </View>
          <View style={[styles.card, styles.formCard]}>
            <NewUserForm disabled={!online} onCreated={reload} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function NewUserForm({
  disabled,
  onCreated,
}: {
  disabled: boolean;
  onCreated: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    const found = validateNewUser(email, password);
    setErrors(found);
    setMessage(null);
    if (found.email || found.password) return;
    setBusy(true);
    const { error } = await createUser(
      email.trim().toLowerCase(),
      password,
      isAdmin
    );
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }
    setEmail("");
    setPassword("");
    setIsAdmin(false);
    setMessage({
      ok: true,
      text: "Đã tạo. Gửi email và mật khẩu ban đầu cho người đó.",
    });
    await onCreated();
  }

  const off = disabled || busy;
  return (
    <View style={styles.form}>
      <Text style={styles.title}>Thêm Người dùng</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {errors.email && <Text style={styles.error}>{errors.email}</Text>}
      <TextInput
        style={styles.input}
        placeholder="Mật khẩu ban đầu"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {errors.password && <Text style={styles.error}>{errors.password}</Text>}
      <View style={styles.switchRow}>
        <Switch
          value={isAdmin}
          onValueChange={setIsAdmin}
          trackColor={switchTrack()}
        />
        <Text>Là Quản trị</Text>
      </View>
      {message && (
        <Text style={message.ok ? styles.ok : styles.error}>
          {message.text}
        </Text>
      )}
      <Pressable
        style={[styles.button, off && styles.disabled]}
        disabled={off}
        onPress={submit}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{busy ? "Đang tạo…" : "Tạo"}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c: Palette) => ({
  container: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    paddingVertical: 10,
    gap: 6,
  },
  email: { fontSize: 16, fontWeight: "600", color: c.ink },
  badges: { flexDirection: "row", gap: 6 },
  badge: {
    backgroundColor: c.accentSoft,
    color: c.accentDeep,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  badgeLocked: { backgroundColor: c.redSoft, color: c.red },
  actions: { flexDirection: "row", gap: 8 },
  smallButton: {
    borderWidth: 1,
    borderColor: c.accentDeep,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  smallButtonText: { color: c.accentDeep, fontWeight: "600" },
  form: { gap: 10, marginTop: 16 },
  pageWide: { padding: 24 },
  innerWide: { width: "100%", maxWidth: 1200, alignSelf: "center", gap: 16 },
  headWide: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: "700", color: c.ink },
  pageSub: { fontSize: 14, color: c.muted },
  split: { flexDirection: "row", gap: 20, alignItems: "flex-start" },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 16,
    overflow: "hidden",
  },
  tableCard: { flex: 1 },
  formCard: { width: 340, padding: 16 },
  trWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  thWide: { minHeight: 40, backgroundColor: c.accentSoft },
  th: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: c.muted },
  thRight: { textAlign: "right" },
  colEmail: { flex: 3 },
  colState: { flex: 2 },
  colActions: { flex: 3, alignItems: "flex-end" },
  title: { fontSize: 18, fontWeight: "700", color: c.ink },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  button: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    minHeight: 48,
  },
  buttonText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  error: { color: c.red },
  ok: { color: c.accentDeep },
}));

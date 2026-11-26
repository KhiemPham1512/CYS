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
import { PageHeader } from "../ui/PageHeader";
import { Text } from "../ui/Text";
import { WIDE_LAYOUT } from "../navigation/adminWeb";
import { Loading } from "../ui/Loading";
import {
  deniedFor,
  validateNewUser,
  validatePassword,
  type AdminRequest,
  type CallerRole,
} from "../../supabase/functions/admin-users/logic.ts";
import { useOnline } from "../lib/useOnline";
import {
  createUser,
  listUsers,
  resetPassword,
  setAdmin,
  setLocked,
  type ManagedUser,
} from "./api";

// Bảng và form "Thêm Người dùng" đứng cạnh nhau chỉ khi bảng còn đủ chỗ (trừ thanh bên + form).
const SPLIT_LAYOUT = 1280;

export function UsersScreen({
  branchId,
  currentUserId,
  role,
}: {
  branchId: string;
  currentUserId: string;
  role: CallerRole;
}) {
  const online = useOnline();
  const width = useWindowDimensions().width;
  const wide = width >= WIDE_LAYOUT;
  const split = width >= SPLIT_LAYOUT;
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(
    null
  );
  const [resetFor, setResetFor] = useState<string | null>(null); // người đang mở ô đặt lại mật khẩu

  const reload = useCallback(async () => {
    setLoadError(null);
    const { data, error } = await listUsers(branchId);
    if (error) setLoadError(error);
    else setUsers(data ?? []);
  }, [branchId]);

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
    // Hiện nút theo cùng luật máy chủ dùng (deniedFor); cấp cao chỉ lộ ra ở màn Hệ thống.
    const target = { is_admin: u.is_admin, is_owner: false, is_self: self };
    const can = (req: AdminRequest) => !deniedFor(role, req, target);
    const canLock =
      !self && can({ action: "set_locked", user_id: u.user_id, locked: true });
    const canAdmin =
      !self &&
      can({ action: "set_admin", user_id: u.user_id, is_admin: !u.is_admin });
    const canReset = can({
      action: "set_password",
      user_id: u.user_id,
      password: "",
    });
    const actions = (
      <View style={styles.actions}>
        {canLock && (
          <Pressable
            style={[styles.smallButton, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() =>
              act(u.user_id, () => setLocked(u.user_id, !u.is_locked))
            }
            accessibilityRole="button"
            accessibilityLabel={`${u.is_locked ? "Mở khóa" : "Khóa"} ${u.email}`}
            accessibilityState={{ disabled }}
          >
            <Text style={styles.smallButtonText}>
              {u.is_locked ? "Mở khóa" : "Khóa"}
            </Text>
          </Pressable>
        )}
        {canAdmin && (
          <Pressable
            style={[styles.smallButton, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() =>
              act(u.user_id, () => setAdmin(u.user_id, !u.is_admin))
            }
            accessibilityRole="button"
            accessibilityLabel={`${u.is_admin ? "Bỏ Quản trị quán" : "Cấp Quản trị quán"} ${u.email}`}
            accessibilityState={{ disabled }}
          >
            <Text style={styles.smallButtonText}>
              {u.is_admin ? "Bỏ Quản trị quán" : "Cấp Quản trị quán"}
            </Text>
          </Pressable>
        )}
        {canReset && (
          <Pressable
            style={[styles.smallButton, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() =>
              setResetFor(resetFor === u.user_id ? null : u.user_id)
            }
            accessibilityRole="button"
            accessibilityLabel={`Đặt lại mật khẩu ${u.email}`}
            accessibilityState={{ disabled }}
          >
            <Text style={styles.smallButtonText}>Đặt lại mật khẩu</Text>
          </Pressable>
        )}
      </View>
    );
    const badges = (
      <View style={styles.badges}>
        {u.is_admin && <Text style={styles.badge}>Quản trị quán</Text>}
        {u.is_locked && (
          <Text style={[styles.badge, styles.badgeLocked]}>Đã khóa</Text>
        )}
      </View>
    );
    const err = rowError?.id === u.user_id && (
      <Text style={styles.error}>{rowError.msg}</Text>
    );
    const resetForm = resetFor === u.user_id && (
      <ResetPasswordForm
        userId={u.user_id}
        email={u.email}
        disabled={!online}
        onClose={() => setResetFor(null)}
      />
    );
    return wide ? (
      <View key={u.user_id} style={styles.trWide}>
        <View style={styles.colEmail}>
          <Text style={styles.email}>
            {u.email}
            {self ? " (bạn)" : ""}
          </Text>
          {err}
          {resetForm}
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
        {resetForm}
      </View>
    );
  });

  const empty = users.length === 0 && (
    <Text style={styles.emptyText}>
      Chi nhánh này chưa có Người dùng. Tạo tài khoản đầu tiên ở form &quot;Thêm
      Người dùng&quot;.
    </Text>
  );
  const newUserForm = (
    <NewUserForm
      disabled={!online}
      onCreated={reload}
      branchId={branchId}
      allowAdmin={role === "owner"}
    />
  );
  if (!wide) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        {!online && (
          <Text style={styles.error}>Mất mạng, chưa thay đổi được</Text>
        )}
        {empty}
        {rows}
        {newUserForm}
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.pageWide}>
      <View style={styles.innerWide}>
        <PageHeader title="Người dùng" sub={`${users.length} tài khoản`} />
        {!online && (
          <Text style={styles.error}>Mất mạng, chưa thay đổi được</Text>
        )}
        <View style={split ? styles.split : styles.stack}>
          <View style={[styles.card, split && styles.tableCard]}>
            <View style={[styles.trWide, styles.thWide]}>
              <Text style={[styles.th, styles.colEmail]}>EMAIL</Text>
              <Text style={[styles.th, styles.colState]}>VAI TRÒ</Text>
              <Text style={[styles.th, styles.colActions, styles.thRight]}>
                THAO TÁC
              </Text>
            </View>
            {empty && <View style={styles.trWide}>{empty}</View>}
            {rows}
          </View>
          <View
            style={[styles.card, split ? styles.formCard : styles.formWide]}
          >
            {newUserForm}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function NewUserForm({
  disabled,
  onCreated,
  branchId,
  allowAdmin,
}: {
  disabled: boolean;
  onCreated: () => Promise<void>;
  branchId: string;
  allowAdmin: boolean; // chỉ Quản trị cấp cao tạo được Quản trị
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
      allowAdmin && isAdmin,
      branchId
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
        accessibilityLabel="Email Người dùng mới"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {errors.email && <Text style={styles.error}>{errors.email}</Text>}
      <TextInput
        style={styles.input}
        placeholder="Mật khẩu ban đầu"
        accessibilityLabel="Mật khẩu ban đầu"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {errors.password && <Text style={styles.error}>{errors.password}</Text>}
      {allowAdmin && (
        <View style={styles.switchRow}>
          <Switch
            value={isAdmin}
            onValueChange={setIsAdmin}
            trackColor={switchTrack()}
            accessibilityLabel="Là Quản trị quán"
          />
          <Text>Là Quản trị quán</Text>
        </View>
      )}
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

function ResetPasswordForm({
  userId,
  email,
  disabled,
  onClose,
}: {
  userId: string;
  email: string;
  disabled: boolean;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    const invalid = validatePassword(password);
    if (invalid) return setMessage({ ok: false, text: invalid });
    setBusy(true);
    setMessage(null);
    const { error } = await resetPassword(userId, password);
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error });
    setPassword("");
    setMessage({
      ok: true,
      text: "Đã đặt lại. Gửi mật khẩu mới cho người đó.",
    });
  }

  const off = disabled || busy;
  return (
    <View style={styles.resetBox}>
      <TextInput
        style={styles.input}
        placeholder={`Mật khẩu mới cho ${email}`}
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
        accessibilityLabel={`Mật khẩu mới cho ${email}`}
      />
      {message && (
        <Text style={message.ok ? styles.ok : styles.error}>
          {message.text}
        </Text>
      )}
      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.resetSave, off && styles.disabled]}
          disabled={off}
          onPress={submit}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{busy ? "Đang lưu…" : "Lưu"}</Text>
        </Pressable>
        <Pressable
          style={styles.smallButton}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.smallButtonText}>Đóng</Text>
        </Pressable>
      </View>
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
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  resetBox: { gap: 8, marginTop: 8 },
  resetSave: { paddingHorizontal: 20, minHeight: 44 },
  pageWide: { padding: 24 },
  innerWide: { width: "100%", maxWidth: 1200, alignSelf: "center", gap: 16 },
  split: { flexDirection: "row", gap: 20, alignItems: "flex-start" },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 16,
    overflow: "hidden",
  },
  tableCard: { flex: 1 },
  stack: { gap: 20 },
  formCard: { width: 340, padding: 16 },
  formWide: { padding: 16, maxWidth: 480 },
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
  colEmail: { flex: 3, minWidth: 200 },
  colState: { flex: 2, minWidth: 90 },
  colActions: { flex: 3, minWidth: 250, alignItems: "flex-end" },
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
  emptyText: { color: c.muted, fontSize: 15 },
}));

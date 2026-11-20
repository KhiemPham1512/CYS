import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
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

export function UsersScreen({ currentUserId }: { currentUserId: string }) {
  const online = useOnline();
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
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {!online && (
        <Text style={styles.error}>Mất mạng — không thay đổi được</Text>
      )}
      {users.map((u) => {
        const self = u.user_id === currentUserId;
        return (
          <View key={u.user_id} style={styles.row}>
            <Text style={styles.email}>
              {u.email}
              {self ? " (bạn)" : ""}
            </Text>
            <View style={styles.badges}>
              {u.is_admin && <Text style={styles.badge}>Quản trị</Text>}
              {u.is_locked && (
                <Text style={[styles.badge, styles.badgeLocked]}>Đã khóa</Text>
              )}
            </View>
            {!self && (
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
                  onPress={() =>
                    act(u.user_id, () => setAdmin(u.user_id, !u.is_admin))
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.smallButtonText}>
                    {u.is_admin ? "Bỏ Quản trị" : "Cấp Quản trị"}
                  </Text>
                </Pressable>
              </View>
            )}
            {rowError?.id === u.user_id && (
              <Text style={styles.error}>{rowError.msg}</Text>
            )}
          </View>
        );
      })}
      <NewUserForm disabled={!online} onCreated={reload} />
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
          trackColor={{ false: "#d4d4d8", true: "#0f766e" }}
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

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingVertical: 10,
    gap: 6,
  },
  email: { fontSize: 16, fontWeight: "600" },
  badges: { flexDirection: "row", gap: 6 },
  badge: {
    backgroundColor: "#ccfbf1",
    color: "#0f766e",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  badgeLocked: { backgroundColor: "#fee2e2", color: "#b91c1c" },
  actions: { flexDirection: "row", gap: 8 },
  smallButton: {
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  smallButtonText: { color: "#0f766e", fontWeight: "600" },
  form: { gap: 10, marginTop: 16 },
  title: { fontSize: 18, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  button: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    minHeight: 48,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  error: { color: "#b91c1c" },
  ok: { color: "#0f766e" },
});

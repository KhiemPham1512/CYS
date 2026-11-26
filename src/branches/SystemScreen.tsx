import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { WIDE_LAYOUT } from "../navigation/adminWeb";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { confirmAction } from "../ui/confirm";
import { Loading } from "../ui/Loading";
import { PageHeader } from "../ui/PageHeader";
import { Text } from "../ui/Text";
import { TextInput } from "../ui/TextInput";
import { useOnline } from "../lib/useOnline";
import { listAllUsers, setAdmin, type SystemUser } from "../users/api";
import { createBranch, moveMember, type Branch } from "./api";

// Trang Hệ thống của Quản trị cấp cao: các Chi nhánh, tạo quán mới từ quán mẫu,
// Người dùng mọi quán (Chuyển quán, bổ nhiệm Quản trị quán).
export function SystemScreen({
  branches,
  currentUserId,
  onBranchesChanged,
}: {
  branches: Branch[];
  currentUserId: string;
  onBranchesChanged: () => Promise<void>;
}) {
  const online = useOnline();
  const wide = useWindowDimensions().width >= WIDE_LAYOUT;
  const [users, setUsers] = useState<SystemUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(
    null
  );
  const [moveFor, setMoveFor] = useState<string | null>(null); // người đang mở chọn quán đích

  const reload = useCallback(async () => {
    setLoadError(null);
    const { data, error } = await listAllUsers();
    if (error) setLoadError(error);
    else setUsers(data ?? []);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const nameOf = (id: string) =>
    branches.find((b) => b.branch_id === id)?.branch_name ?? "(quán không rõ)";

  async function act(
    userId: string,
    run: () => Promise<{ error: string | null }>
  ) {
    setBusyId(userId);
    setRowError(null);
    const { error } = await run();
    if (error) setRowError({ id: userId, msg: error });
    setMoveFor(null);
    await reload();
    setBusyId(null);
  }

  function askMove(u: SystemUser, to: Branch) {
    confirmAction({
      title: `Chuyển ${u.email} sang ${to.branch_name}?`,
      message:
        "Người này thành Nhân viên ở quán mới (mất quyền Quản trị nếu có). Lịch sử ở lại quán cũ. Máy đang mở app sẽ bị đăng xuất để đăng nhập lại vào quán mới.",
      confirmText: "Chuyển quán",
      onConfirm: () =>
        void act(u.user_id, () => moveMember(u.user_id, to.branch_id)),
    });
  }

  const disabled = !online || busyId !== null;
  const counts = new Map<string, number>();
  for (const u of users ?? [])
    counts.set(u.branch_id, (counts.get(u.branch_id) ?? 0) + 1);

  const branchCard = (
    <View style={[styles.card, wide && styles.grow]}>
      <Text style={styles.cardTitle}>Chi nhánh</Text>
      {branches.map((b) => (
        <View key={b.branch_id} style={styles.branchRow}>
          <Text style={styles.branchName}>{b.branch_name}</Text>
          <Text style={styles.muted}>
            {users ? `${counts.get(b.branch_id) ?? 0} người` : ""}
          </Text>
        </View>
      ))}
    </View>
  );

  let userBody;
  if (loadError && !users) {
    userBody = (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
        <Pressable
          style={styles.smallButton}
          onPress={reload}
          accessibilityRole="button"
        >
          <Text style={styles.smallButtonText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  } else if (!users) {
    userBody = (
      <View style={styles.center}>
        <Loading />
      </View>
    );
  } else if (users.length === 0) {
    userBody = (
      <Text style={styles.muted}>
        Chưa có Người dùng nào. Tạo tài khoản ở trang Người dùng của từng quán.
      </Text>
    );
  } else {
    const sorted = [...users].sort(
      (a, b) =>
        nameOf(a.branch_id).localeCompare(nameOf(b.branch_id)) ||
        a.email.localeCompare(b.email)
    );
    userBody = sorted.map((u) => {
      const self = u.user_id === currentUserId;
      const targets = branches.filter((b) => b.branch_id !== u.branch_id);
      return (
        <View
          key={u.user_id}
          style={[styles.userRow, wide && styles.userRowWide]}
        >
          <View style={styles.userInfo}>
            <Text style={styles.email}>
              {u.email}
              {self ? " (bạn)" : ""}
            </Text>
            <View style={styles.badges}>
              <Text style={styles.muted}>{nameOf(u.branch_id)}</Text>
              {u.is_owner && <Text style={styles.badge}>Cấp cao</Text>}
              {u.is_admin && <Text style={styles.badge}>Quản trị quán</Text>}
              {u.is_locked && (
                <Text style={[styles.badge, styles.badgeLocked]}>Đã khóa</Text>
              )}
            </View>
            {rowError?.id === u.user_id && (
              <Text style={styles.error}>{rowError.msg}</Text>
            )}
            {moveFor === u.user_id && (
              <View style={styles.moveBox}>
                <Text style={styles.muted}>Chuyển sang:</Text>
                <View style={styles.actions}>
                  {targets.map((b) => (
                    <Pressable
                      key={b.branch_id}
                      style={[styles.smallButton, disabled && styles.disabled]}
                      disabled={disabled}
                      onPress={() => askMove(u, b)}
                      accessibilityRole="button"
                      accessibilityLabel={`Chuyển ${u.email} sang ${b.branch_name}`}
                    >
                      <Text style={styles.smallButtonText}>
                        {b.branch_name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
          {!self && (
            <View style={styles.actions}>
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
              {targets.length > 0 && (
                <Pressable
                  style={[
                    styles.smallButton,
                    moveFor === u.user_id && styles.smallButtonOn,
                    disabled && styles.disabled,
                  ]}
                  disabled={disabled}
                  onPress={() =>
                    setMoveFor(moveFor === u.user_id ? null : u.user_id)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Chuyển quán ${u.email}`}
                  accessibilityState={{
                    disabled,
                    expanded: moveFor === u.user_id,
                  }}
                >
                  <Text style={styles.smallButtonText}>Chuyển quán</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      );
    });
  }

  return (
    <ScrollView contentContainerStyle={wide ? styles.pageWide : styles.page}>
      <View style={styles.inner}>
        <PageHeader
          title="Hệ thống"
          sub={`${branches.length} Chi nhánh${users ? ` · ${users.length} Người dùng` : ""}`}
        />
        {!online && (
          <Text style={styles.error}>Mất mạng, chưa thay đổi được</Text>
        )}
        <View style={wide ? styles.split : styles.stack}>
          {branchCard}
          <View style={[styles.card, wide && styles.formCard]}>
            <NewBranchForm
              branches={branches}
              disabled={!online}
              onCreated={async () => {
                await onBranchesChanged();
                await reload();
              }}
            />
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Người dùng mọi quán</Text>
          {userBody}
        </View>
      </View>
    </ScrollView>
  );
}

function NewBranchForm({
  branches,
  disabled,
  onCreated,
}: {
  branches: Branch[];
  disabled: boolean;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(branches[0]?.branch_id ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const templateName =
    branches.find((b) => b.branch_id === template)?.branch_name ?? "";

  async function create() {
    setBusy(true);
    setMessage(null);
    const { error } = await createBranch(name.trim(), template);
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error });
    setMessage({
      ok: true,
      text: `Đã tạo ${name.trim()}. Thêm Người dùng ở trang Người dùng của quán này.`,
    });
    setName("");
    await onCreated();
  }

  function submit() {
    if (!name.trim()) return setMessage({ ok: false, text: "Nhập tên quán" });
    confirmAction({
      title: `Tạo ${name.trim()} từ ${templateName}?`,
      message:
        "Chép Nhóm, Danh mục, quy cách, dữ liệu in và tên nhà cung cấp đã nhớ. Không chép tồn kho, đơn đặt, nhận hàng, Nhật ký.",
      confirmText: "Tạo Chi nhánh",
      onConfirm: () => void create(),
    });
  }

  const off = disabled || busy;
  return (
    <View style={styles.form}>
      <Text style={styles.cardTitle}>Tạo Chi nhánh</Text>
      <Text style={styles.label}>Tên quán</Text>
      <TextInput
        style={styles.input}
        placeholder="Tên hiển thị của quán"
        accessibilityLabel="Tên quán mới"
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      <Text style={styles.label}>Chép Danh mục từ</Text>
      <View style={styles.actions}>
        {branches.map((b) => (
          <Pressable
            key={b.branch_id}
            style={[
              styles.smallButton,
              template === b.branch_id && styles.smallButtonOn,
            ]}
            onPress={() => setTemplate(b.branch_id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: template === b.branch_id }}
          >
            <Text style={styles.smallButtonText}>{b.branch_name}</Text>
          </Pressable>
        ))}
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
        accessibilityState={{ disabled: off }}
      >
        <Text style={styles.buttonText}>
          {busy ? "Đang tạo…" : "Tạo Chi nhánh"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c: Palette) => ({
  page: { padding: 16 },
  pageWide: { padding: 24 },
  inner: { width: "100%", maxWidth: 1200, alignSelf: "center", gap: 16 },
  split: { flexDirection: "row", gap: 20, alignItems: "flex-start" },
  stack: { gap: 16 },
  grow: { flex: 1 },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  formCard: { width: 380 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: c.ink },
  branchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  branchName: { fontSize: 16, fontWeight: "600", color: c.ink },
  muted: { color: c.muted, fontSize: 14 },
  center: { alignItems: "center", gap: 12, paddingVertical: 24 },
  userRow: {
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  userRowWide: { flexDirection: "row", alignItems: "flex-start" },
  userInfo: { flex: 1, gap: 4 },
  email: { fontSize: 16, fontWeight: "600", color: c.ink },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  badge: {
    backgroundColor: c.accentSoft,
    color: c.accentDeep,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  badgeLocked: { backgroundColor: c.redSoft, color: c.red },
  moveBox: { gap: 6, marginTop: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallButton: {
    borderWidth: 1,
    borderColor: c.accentDeep,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  smallButtonOn: { backgroundColor: c.accentSoft },
  smallButtonText: { color: c.accentDeep, fontWeight: "600" },
  form: { gap: 10 },
  label: { fontSize: 14, fontWeight: "600", color: c.ink },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
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

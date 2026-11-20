import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Loading } from "../ui/Loading";
import { parseShortDate } from "../stock/date";
import { localDate, localTime } from "../stock/ledger";
import { listUsers, type ManagedUser } from "../users/api";
import { loadAuditFeed, type AuditRow } from "./api";
import { describeChange, type AuditEntry } from "./auditLog";

type Props = { branchId: string };

const WIDE = 720; // từ bề rộng này trở lên hiện dạng bảng, hẹp hơn hiện dạng thẻ

const TABLE_LABEL: Record<string, string> = {
  items: "Món",
  item_groups: "Nhóm",
  branch_settings: "Cài đặt",
  members: "Tài khoản",
  stock_movements: "Kho",
};

const dateOrNull = (raw: string) => {
  if (!raw.trim()) return { ok: true as const, value: null };
  const r = parseShortDate(raw, new Date());
  return r.ok ? { ok: true as const, value: r.value } : { ok: false as const };
};

// Nhật ký thay đổi: ai, lúc nào, thay đổi gì (cũ → mới). Chỉ Quản trị (máy chủ kiểm lại).
export function AuditScreen({ branchId }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [actor, setActor] = useState<string | null>(null);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [itemText, setItemText] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const from = dateOrNull(fromText);
  const to = dateOrNull(toText);
  const datesOk = from.ok && to.ok;
  const fromValue = from.ok ? from.value : null;
  const toValue = to.ok ? to.value : null;

  // Chỉ nhận kết quả của lần tải mới nhất (đổi bộ lọc nhanh không bị kết quả cũ ghi đè).
  const latest = useRef(0);
  const fetchData = useCallback(async () => {
    if (!datesOk) return;
    const request = ++latest.current;
    setLoading(true);
    const res = await loadAuditFeed(branchId, {
      actor,
      from: fromValue,
      to: toValue,
      itemId: null,
    });
    if (request !== latest.current) return;
    setRows(res.rows);
    setError(res.error);
    setLoading(false);
  }, [branchId, actor, datesOk, fromValue, toValue]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    listUsers().then((r) => setUsers(r.data ?? []));
  }, []);

  // shortcut: lọc món theo tên ở máy trên tối đa 200 dòng mới nhất đã tải.
  const shown = useMemo(() => {
    const q = itemText.trim().toLowerCase();
    return q
      ? rows.filter((r) => (r.item_name ?? "").toLowerCase().includes(q))
      : rows;
  }, [rows, itemText]);

  const clear = () => {
    setActor(null);
    setFromText("");
    setToText("");
    setItemText("");
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.inner}>
        <Text style={styles.title}>Nhật ký thay đổi</Text>

        <View style={[styles.filters, wide && styles.filtersWide]}>
          <View style={styles.field}>
            <Text style={styles.label}>Người</Text>
            <View style={styles.chips}>
              <Chip
                label="Tất cả"
                on={actor === null}
                onPress={() => setActor(null)}
              />
              {users.map((u) => (
                <Chip
                  key={u.user_id}
                  label={u.email}
                  on={actor === u.user_id}
                  onPress={() => setActor(u.user_id)}
                />
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Từ ngày</Text>
            <TextInput
              style={[styles.input, !from.ok && styles.inputError]}
              value={fromText}
              onChangeText={setFromText}
              placeholder="ví dụ 28 hoặc 28/10"
            />
            {!from.ok && (
              <Text style={styles.fieldError}>Ngày không hợp lệ</Text>
            )}
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Đến ngày</Text>
            <TextInput
              style={[styles.input, !to.ok && styles.inputError]}
              value={toText}
              onChangeText={setToText}
              placeholder="ví dụ 28 hoặc 28/10"
            />
            {!to.ok && <Text style={styles.fieldError}>Ngày không hợp lệ</Text>}
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Món</Text>
            <TextInput
              style={styles.input}
              value={itemText}
              onChangeText={setItemText}
              placeholder="Tìm theo tên món"
            />
          </View>
          <Pressable
            style={styles.clear}
            onPress={clear}
            accessibilityRole="button"
          >
            <Text style={styles.clearText}>Xóa lọc</Text>
          </Pressable>
        </View>

        {loading ? (
          <Loading />
        ) : error ? (
          <View style={styles.state}>
            <Text style={styles.error}>{error}</Text>
            <Pressable
              style={styles.retry}
              onPress={() => void fetchData()}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : shown.length === 0 ? (
          <Text style={[styles.state, styles.meta]}>
            Không có thay đổi nào.
          </Text>
        ) : (
          <>
            {wide && (
              <View style={[styles.row, styles.head]}>
                <Text style={[styles.cell, styles.colTime, styles.headText]}>
                  Lúc nào
                </Text>
                <Text style={[styles.cell, styles.colWho, styles.headText]}>
                  Ai
                </Text>
                <Text style={[styles.cell, styles.colWhat, styles.headText]}>
                  Món / đối tượng
                </Text>
                <Text style={[styles.cell, styles.colChange, styles.headText]}>
                  Thay đổi
                </Text>
              </View>
            )}
            {shown.map((r, idx) => (
              <LogRow key={`${r.logged_at}-${idx}`} row={r} wide={wide} />
            ))}
            <Text style={styles.meta}>
              Hiện {shown.length} dòng mới nhất (tối đa 200).
            </Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function LogRow({ row, wide }: { row: AuditRow; wide: boolean }) {
  const entry: AuditEntry = {
    table_name: row.table_name,
    action: row.action,
    old_data: (row.old_data as Record<string, unknown> | null) ?? null,
    new_data: (row.new_data as Record<string, unknown> | null) ?? null,
  };
  const lines = describeChange(entry);
  const when = `${localDate(row.logged_at).split("-").reverse().join("/")} ${localTime(row.logged_at)}`;
  const who = row.actor_email ?? "Hệ thống";
  const what = `${TABLE_LABEL[row.table_name] ?? row.table_name}${row.item_name ? `: ${row.item_name}` : ""}`;
  const change = (
    <View>
      {lines.length === 0 ? (
        <Text style={styles.meta}>—</Text>
      ) : (
        lines.map((l, i) => {
          const [head, tail] = l.split(" → ");
          return (
            <Text key={i} style={styles.changeLine}>
              {tail === undefined ? (
                l
              ) : (
                <>
                  <Text style={styles.oldValue}>{head}</Text>
                  {" → "}
                  <Text style={styles.newValue}>{tail}</Text>
                </>
              )}
            </Text>
          );
        })
      )}
    </View>
  );
  if (wide)
    return (
      <View style={styles.row}>
        <Text style={[styles.cell, styles.colTime]}>{when}</Text>
        <Text style={[styles.cell, styles.colWho]}>{who}</Text>
        <Text style={[styles.cell, styles.colWhat]}>{what}</Text>
        <View style={[styles.cell, styles.colChange]}>{change}</View>
      </View>
    );
  return (
    <View style={styles.card}>
      <Text style={styles.cardTop}>
        {when} · {who}
      </Text>
      <Text style={styles.cardWhat}>{what}</Text>
      {change}
    </View>
  );
}

const BORDER = "#d4d4d8";
const TEAL = "#0f766e";
const styles = StyleSheet.create({
  page: { padding: 16 },
  inner: { width: "100%", maxWidth: 1200, alignSelf: "center", gap: 12 },
  title: { fontSize: 20, fontWeight: "800", color: "#18181b" },
  filters: { gap: 12 },
  filtersWide: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  field: { gap: 4, minWidth: 180 },
  label: { fontSize: 14, fontWeight: "600", color: "#27272a" },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#fff",
    minHeight: 44,
  },
  inputError: { borderColor: "#b91c1c" },
  fieldError: { color: "#b91c1c", fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: TEAL, borderColor: TEAL },
  chipText: { fontSize: 14, color: "#18181b" },
  chipTextOn: { color: "#fff" },
  clear: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  clearText: { fontSize: 15, fontWeight: "600", color: "#18181b" },
  state: { padding: 24, alignItems: "center", gap: 12, textAlign: "center" },
  error: { color: "#b91c1c", fontSize: 15 },
  retry: {
    backgroundColor: TEAL,
    borderRadius: 8,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  meta: { fontSize: 13, color: "#52525b" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
  },
  head: { backgroundColor: "#e4e4e7" },
  headText: { fontWeight: "700" },
  cell: { padding: 10, fontSize: 14, color: "#18181b" },
  colTime: { width: 130 },
  colWho: { width: 200 },
  colWhat: { width: 220 },
  colChange: { flex: 1 },
  card: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 12,
    gap: 4,
    backgroundColor: "#fff",
  },
  cardTop: { fontSize: 13, color: "#52525b" },
  cardWhat: { fontSize: 15, fontWeight: "700", color: "#18181b" },
  changeLine: { fontSize: 14, color: "#18181b" },
  oldValue: { color: "#71717a", textDecorationLine: "line-through" },
  newValue: { color: TEAL, fontWeight: "700" },
});

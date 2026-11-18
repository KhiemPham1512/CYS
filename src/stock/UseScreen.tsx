import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { loadCatalog } from "../catalog/api";
import { matchesQuery } from "../catalog/search";
import type { Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import {
  editUse,
  loadMemberEmails,
  loadMovements,
  saveUses,
  subscribeMovements,
  voidUse,
} from "./api";
import {
  localTime,
  stockByItem,
  todaysUses,
  totalQty,
  usageCounts,
  type Movement,
} from "./ledger";
import { formatQty, parseQty, round4 } from "./qty";

type Props = { branchId: string; userId: string };

export function UseScreen({ branchId, userId }: Props) {
  const online = useOnline();
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [emails, setEmails] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null
  );
  const busy = useRef(false); // chống bấm đôi trước khi state kịp cập nhật
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const [catalog, movs] = await Promise.all([
        loadCatalog(branchId),
        loadMovements(branchId),
      ]);
      setItems(catalog.items);
      setMovements(movs);
      // Email chỉ để hiện "ai ghi"; lỗi thì hiện không tên, không chặn màn hình.
      loadMemberEmails(branchId).then(setEmails, () => {});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    void fetchData();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = subscribeMovements(branchId, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void fetchData(), 300);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [branchId, fetchData]);

  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );
  const uses = useMemo(
    () => todaysUses(movements, new Date().toISOString()).reverse(),
    [movements]
  );

  // Món hay dùng của người dùng lên đầu, còn lại theo tên.
  const list = useMemo(() => {
    const counts = usageCounts(movements, userId);
    return items
      .filter((i) => !i.is_hidden && matchesQuery(i, query))
      .sort(
        (a, b) =>
          (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) ||
          a.name.localeCompare(b.name, "vi")
      );
  }, [items, movements, userId, query]);

  const parsed = useMemo(() => {
    const errors: Record<string, string> = {};
    const rows: { item_id: string; qty: number }[] = [];
    for (const item of items) {
      const raw = inputs[item.id] ?? "";
      if (!raw.trim()) continue;
      const r = parseQty(raw, {
        caseSize: item.case_size,
        byPercent: item.record_by_percent,
      });
      if (!r.ok) errors[item.id] = r.error;
      else if (r.value > 0) rows.push({ item_id: item.id, qty: r.value });
    }
    return { errors, rows };
  }, [inputs, items]);

  const fmt = (item: Tables<"items"> | undefined, qty: number) =>
    formatQty(qty, {
      caseSize: item?.case_size ?? null,
      unit: item?.unit ?? "",
      byPercent: item?.record_by_percent ?? false,
    });

  function step(item: Tables<"items">, delta: number) {
    const r = parseQty(inputs[item.id] ?? "", {
      caseSize: item.case_size,
      byPercent: item.record_by_percent,
    });
    const next = Math.max(0, round4((r.ok ? r.value : 0) + delta));
    setInputs((p) => ({ ...p, [item.id]: next ? String(next) : "" }));
  }

  async function handleSave() {
    if (!online || busy.current || parsed.rows.length === 0) return;
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    const { error: err } = await saveUses(branchId, parsed.rows);
    if (err) setSaveError(err);
    else {
      setInputs({});
      await fetchData();
    }
    busy.current = false;
    setSaving(false);
  }

  async function handleEdit(m: Movement, raw: string) {
    const item = itemsById.get(m.item_id);
    const r = parseQty(raw, {
      caseSize: item?.case_size ?? null,
      byPercent: item?.record_by_percent ?? false,
    });
    if (!r.ok || r.value <= 0) {
      setSaveError(r.ok ? "Số lượng phải lớn hơn 0" : r.error);
      return;
    }
    if (!online || busy.current) return;
    busy.current = true;
    const { error: err } = await editUse(branchId, m, r.value);
    setSaveError(err);
    if (!err) {
      setEditing(null);
      await fetchData();
    }
    busy.current = false;
  }

  async function handleVoid(m: Movement) {
    if (!online || busy.current) return;
    busy.current = true;
    const { error: err } = await voidUse(branchId, m);
    setSaveError(err);
    if (!err) await fetchData();
    busy.current = false;
  }

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  if (error)
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Không tải được dữ liệu. Kiểm tra mạng.</Text>
        <Pressable style={styles.primary} onPress={() => void fetchData()}>
          <Text style={styles.primaryText}>Thử lại</Text>
        </Pressable>
      </View>
    );

  const saveDisabled =
    !online ||
    saving ||
    parsed.rows.length === 0 ||
    Object.keys(parsed.errors).length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TextInput
          style={styles.input}
          placeholder="Tìm món (gõ không dấu được)"
          value={query}
          onChangeText={setQuery}
        />
        {!online && <Text style={styles.error}>Mất mạng — không lưu được</Text>}
        {saveError && <Text style={styles.error}>{saveError}</Text>}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        {list.map((item) => {
          const stock = totalQty(lotsByItem.get(item.id) ?? []);
          const qty = parsed.rows.find((r) => r.item_id === item.id)?.qty ?? 0;
          return (
            <View key={item.id} style={styles.row}>
              <Text style={styles.name}>
                {item.name}
                {item.name_zh ? ` · ${item.name_zh}` : ""}
              </Text>
              <Text style={styles.meta}>
                Tồn kho: {fmt(item, stock)}
                {item.case_size !== null ? " · gõ được 1T+3" : ""}
              </Text>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => step(item, -1)}
                  accessibilityRole="button"
                  accessibilityLabel={`Giảm ${item.name}`}
                >
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <TextInput
                  style={[styles.input, styles.qtyInput]}
                  placeholder="0"
                  value={inputs[item.id] ?? ""}
                  onChangeText={(t) =>
                    setInputs((p) => ({ ...p, [item.id]: t }))
                  }
                />
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => step(item, 1)}
                  accessibilityRole="button"
                  accessibilityLabel={`Tăng ${item.name}`}
                >
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
              {parsed.errors[item.id] && (
                <Text style={styles.error}>{parsed.errors[item.id]}</Text>
              )}
              {qty > stock && (
                <Text style={styles.warn}>
                  Vượt Tồn kho thực tế ({fmt(item, stock)}) — vẫn lưu được
                </Text>
              )}
            </View>
          );
        })}

        <Text style={styles.section}>Ghi dùng hôm nay</Text>
        {uses.length === 0 && <Text style={styles.meta}>Chưa có.</Text>}
        {uses.map((m) => (
          <View key={m.id} style={styles.useRow}>
            <Text style={styles.useText}>
              {itemsById.get(m.item_id)?.name ?? "?"}:{" "}
              {fmt(itemsById.get(m.item_id), m.qty)} ·{" "}
              {emails.get(m.created_by) ?? "—"} · {localTime(m.created_at)}
            </Text>
            {editing?.id === m.id ? (
              <>
                <TextInput
                  style={[styles.input, styles.editInput]}
                  autoFocus
                  value={editing.text}
                  onChangeText={(text) => setEditing({ id: m.id, text })}
                  onSubmitEditing={() => void handleEdit(m, editing.text)}
                />
                <Pressable
                  style={styles.voidBtn}
                  onPress={() => void handleEdit(m, editing.text)}
                  accessibilityRole="button"
                >
                  <Text style={styles.okLink}>Lưu</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={styles.voidBtn}
                onPress={() => setEditing({ id: m.id, text: String(m.qty) })}
                accessibilityRole="button"
              >
                <Text style={styles.okLink}>Sửa</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.voidBtn}
              onPress={() => void handleVoid(m)}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Hủy</Text>
            </Pressable>
          </View>
        ))}
        <Text style={styles.meta}>
          Sửa/Hủy chỉ được trong ngày; người sửa được lưu lại.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.primary, saveDisabled && styles.disabled]}
          disabled={saveDisabled}
          onPress={() => void handleSave()}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>
            {saving ? "Đang lưu…" : `Lưu Ghi dùng (${parsed.rows.length} món)`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
    backgroundColor: "#fff",
    gap: 6,
  },
  name: { fontSize: 16, fontWeight: "600", color: "#18181b" },
  meta: { fontSize: 13, color: "#52525b", paddingHorizontal: 16 },
  stepper: { flexDirection: "row", gap: 8, alignItems: "center" },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#f4f4f5",
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 24, fontWeight: "700", color: "#0f766e" },
  qtyInput: { flex: 1, textAlign: "center" },
  warn: { color: "#b45309", fontSize: 14 },
  error: { color: "#b91c1c", fontSize: 14, textAlign: "center" },
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f766e",
    padding: 16,
    backgroundColor: "#f4f4f5",
  },
  useRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
  },
  useText: { flex: 1, fontSize: 14, color: "#18181b" },
  voidBtn: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  editInput: { width: 90 },
  okLink: { color: "#0f766e", fontSize: 15, fontWeight: "600" },
  link: { color: "#b91c1c", fontSize: 15, fontWeight: "600" },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    backgroundColor: "#fff",
  },
  primary: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

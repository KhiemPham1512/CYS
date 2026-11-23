import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "../lib/debounce";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { TextInput } from "../ui/TextInput";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import { Loading } from "../ui/Loading";
import { loadCatalog } from "../catalog/api";
import { matchesQuery } from "../catalog/search";
import { compareItems } from "../catalog/sections";
import type { Tables } from "../lib/database.types";
import { openInUse } from "./inUseApi";
import { tracksInUse } from "./expiry";
import { useOnline } from "../lib/useOnline";
import {
  editUse,
  type WriteResult,
  loadMemberNames,
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
import { formatItemQty, parseQty, round4 } from "./qty";

type Props = { branchId: string; userId: string };

export function UseScreen({ branchId, userId }: Props) {
  const online = useOnline();
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [groupOrder, setGroupOrder] = useState<Map<string, number>>(new Map());
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
  // Thứ tự món chốt một lần khi mở màn, không xếp lại khi vừa bấm −, tránh món nhảy lên đầu lúc đang chỉnh.
  const [order, setOrder] = useState<Map<string, number> | null>(null);
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
      setGroupOrder(new Map(catalog.groups.map((g) => [g.id, g.sort_order])));
      setMovements(movs);
      setOrder((prev) => prev ?? usageCounts(movs, userId));
      // Email chỉ để hiện "ai ghi"; lỗi thì hiện không tên, không chặn màn hình.
      loadMemberNames(branchId).then(setEmails, () => {});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [branchId, userId]);

  // Realtime chỉ cần sổ, không tải lại Danh mục/email. Chỉ nhận kết quả của lần tải mới nhất:
  // applyRows cũng tăng bộ đếm nên lần tải bắt đầu trước lúc lưu không ghi đè dòng vừa lưu.
  const movementsRequest = useRef(0);
  const fetchMovements = useCallback(async () => {
    const request = ++movementsRequest.current;
    try {
      const movs = await loadMovements(branchId);
      if (request === movementsRequest.current) setMovements(movs);
    } catch {
      // giữ dữ liệu đang có; lần sự kiện sau sẽ tải lại
    }
  }, [branchId]);

  // Dòng vừa lưu vào màn hình ngay (không chờ tải lại sổ); bỏ dòng đã có (trùng id) để không trừ đôi.
  const applyRows = (rows: Tables<"stock_movements">[]) => {
    if (rows.length === 0) return void fetchMovements(); // server không trả dòng: tải lại cho chắc
    movementsRequest.current++;
    setMovements((prev) => {
      const have = new Set(prev.map((m) => m.id));
      return [...prev, ...rows.filter((r) => !have.has(r.id))];
    });
  };

  useEffect(() => {
    setLoading(true);
    setOrder(null); // đổi Chi nhánh/người dùng thì chốt lại thứ tự
    void fetchData();
    const reload = debounce(() => void fetchMovements());
    const unsub = subscribeMovements(branchId, reload);
    return () => {
      reload.cancel();
      unsub();
    };
  }, [branchId, fetchData, fetchMovements]);

  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );
  const uses = useMemo(
    () => todaysUses(movements, new Date().toISOString()).reverse(),
    [movements]
  );

  // Lần trừ hôm nay mới nhất của mình theo món (nút + trả lại từ đây); `uses` đã sắp mới → cũ.
  const myLastUse = useMemo(() => {
    const map = new Map<string, Movement>();
    for (const m of uses)
      if (m.created_by === userId && !map.has(m.item_id)) map.set(m.item_id, m);
    return map;
  }, [uses, userId]);

  // Món hay dùng của người dùng lên đầu; cùng số lần thì theo thứ tự tờ giấy (Nhóm rồi món).
  const list = useMemo(() => {
    const counts = order ?? new Map<string, number>();
    return items
      .filter((i) => !i.is_hidden && matchesQuery(i, query))
      .sort(
        (a, b) =>
          (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) ||
          (groupOrder.get(a.group_id) ?? 0) -
            (groupOrder.get(b.group_id) ?? 0) ||
          compareItems(a, b)
      );
  }, [items, groupOrder, order, query]);

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

  // Nút −: trừ 1 và lưu ngay. Nút +: trả lại 1 từ lần trừ gần nhất của chính mình hôm nay
  // (qty > 1 thì sửa còn qty − 1, qty = 1 thì hủy). shortcut: bước cố định 1 đơn vị, số lớn gõ ở ô bên dưới.
  async function runQuick(action: () => Promise<WriteResult>) {
    if (!online || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const { error: err, rows } = await action();
      setSaveError(err);
      if (!err) applyRows(rows);
    } catch {
      setSaveError("Không lưu được. Kiểm tra mạng.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  // Món có hạn sau khui dài: sau khi lưu Ghi dùng, thêm Đang dùng.
  const openTracked = async (itemIds: string[]) => {
    const { error: err } = await openInUse(
      branchId,
      itemIds.filter((id) => {
        const it = items.find((i) => i.id === id);
        return it ? tracksInUse(it) : false;
      })
    );
    // shortcut: Ghi dùng đã lưu mà Đang dùng lỗi thì chỉ báo, không hoàn tác Ghi dùng.
    if (err) setSaveError(err);
  };

  const quickUse = (item: Tables<"items">) =>
    runQuick(async () => {
      const result = await saveUses(branchId, [{ item_id: item.id, qty: 1 }]);
      if (!result.error) void openTracked([item.id]);
      return result;
    });

  const giveBack = (item: Tables<"items">) => {
    const last = myLastUse.get(item.id);
    if (!last) return;
    return runQuick(() =>
      last.qty <= 1
        ? voidUse(branchId, last)
        : editUse(branchId, last, round4(last.qty - 1))
    );
  };

  async function handleSave() {
    if (!online || busy.current || parsed.rows.length === 0) return;
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    const { error: err, rows } = await saveUses(branchId, parsed.rows);
    if (err) setSaveError(err);
    else {
      void openTracked(parsed.rows.map((r) => r.item_id));
      setInputs({});
      applyRows(rows);
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
    const { error: err, rows } = await editUse(branchId, m, r.value);
    setSaveError(err);
    if (!err) {
      setEditing(null);
      applyRows(rows);
    }
    busy.current = false;
  }

  async function handleVoid(m: Movement) {
    if (!online || busy.current) return;
    busy.current = true;
    const { error: err, rows } = await voidUse(branchId, m);
    setSaveError(err);
    if (!err) applyRows(rows);
    busy.current = false;
  }

  if (loading)
    return (
      <View style={styles.center}>
        <Loading />
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

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {list.map((item) => {
          const stock = totalQty(lotsByItem.get(item.id) ?? []);
          const qty = parsed.rows.find((r) => r.item_id === item.id)?.qty ?? 0;
          return (
            <View key={item.id} style={styles.row}>
              <Text style={styles.name}>
                {item.name}
                {item.name_zh ? ` · ${item.name_zh}` : ""}
              </Text>
              <View style={styles.stepper}>
                <Pressable
                  style={[styles.stepBtn, stock <= 0 && styles.disabled]}
                  disabled={stock <= 0 || saving || !online}
                  onPress={() => void quickUse(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Trừ 1 ${item.name}`}
                >
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={styles.stockText}>
                  Tồn kho: {formatItemQty(item, stock)}
                </Text>
                <Pressable
                  style={[
                    styles.stepBtn,
                    !myLastUse.has(item.id) && styles.disabled,
                  ]}
                  disabled={!myLastUse.has(item.id) || saving || !online}
                  onPress={() => void giveBack(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Trả lại 1 ${item.name}`}
                >
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.input}
                placeholder={
                  item.case_size !== null
                    ? "Gõ số lớn rồi Lưu (vd 1T+3)"
                    : "Gõ số lớn rồi Lưu"
                }
                value={inputs[item.id] ?? ""}
                onChangeText={(t) => setInputs((p) => ({ ...p, [item.id]: t }))}
              />
              {parsed.errors[item.id] && (
                <Text style={styles.error}>{parsed.errors[item.id]}</Text>
              )}
              {qty > stock && (
                <Text style={styles.warn}>
                  Vượt Tồn kho thực tế ({formatItemQty(item, stock)}) — vẫn lưu
                  được
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
              {formatItemQty(itemsById.get(m.item_id), m.qty)} ·{" "}
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

const styles = themedStyles((c: Palette) => ({
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
    paddingBottom: 8,
    gap: 8,
  },
  scrollContent: { padding: 16, paddingTop: 6, gap: 8, paddingBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    backgroundColor: c.surface,
  },
  row: {
    padding: 14,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 18,
    backgroundColor: c.surface,
    gap: 10,
  },
  name: { fontSize: 16, fontWeight: "600", color: c.ink },
  meta: { fontSize: 13, color: c.muted },
  stepper: { flexDirection: "row", gap: 8, alignItems: "center" },
  stepBtn: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: c.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 24, fontWeight: "700", color: c.accentDeep },
  stockText: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: c.ink,
  },
  warn: { color: c.amber, fontSize: 14 },
  error: { color: c.red, fontSize: 14, textAlign: "center" },
  section: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: c.muted,
    paddingTop: 12,
  },
  useRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 14,
    backgroundColor: c.surface,
  },
  useText: { flex: 1, fontSize: 14, color: c.ink },
  voidBtn: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  editInput: { width: 90 },
  okLink: { color: c.accentDeep, fontSize: 15, fontWeight: "600" },
  link: { color: c.red, fontSize: 15, fontWeight: "600" },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.surface,
  },
  primary: {
    backgroundColor: c.accentDeep,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
}));

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { loadCatalog } from "../catalog/api";
import { compareItems } from "../catalog/sections";
import type { Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import { loadMovements, subscribeMovements } from "../stock/api";
import { localDate, stockByItem, totalQty } from "../stock/ledger";
import { formatQty, parseQty } from "../stock/qty";
import { formatDate } from "../stock/date";
import {
  deleteDraft,
  loadOrders,
  placeOrder,
  saveDraft,
  subscribeOrders,
  type OrderLineRow,
  type OrderRow,
} from "./api";
import { incomingByItem, projectedQty } from "./orders";

type Props = { branchId: string };

export function OrderScreen({ branchId }: Props) {
  const online = useOnline();
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [initFor, setInitFor] = useState<string | null>(null); // Nhóm đã nạp số từ đơn nháp
  const [saving, setSaving] = useState(false);
  const busy = useRef(false); // chống bấm đôi trước khi state kịp cập nhật
  const [message, setMessage] = useState<string | null>(null);

  // Chỉ nhận kết quả của lần tải mới nhất; lần tải cũ về sau bị bỏ.
  const latestRequest = useRef(0);
  const fetchData = useCallback(async () => {
    const request = ++latestRequest.current;
    setError(false);
    try {
      const [catalog, movs, ord] = await Promise.all([
        loadCatalog(branchId),
        loadMovements(branchId),
        loadOrders(branchId),
      ]);
      if (request !== latestRequest.current) return;
      setGroups(catalog.groups);
      setItems(catalog.items);
      setMovements(movs);
      setOrders(ord.orders);
      setLines(ord.lines);
      setGroupId((g) => g ?? catalog.groups[0]?.id ?? null);
    } catch {
      if (request === latestRequest.current) setError(true);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    void fetchData();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void fetchData(), 300);
    };
    const unsubOrders = subscribeOrders(branchId, reload);
    const unsubMovements = subscribeMovements(branchId, reload);
    return () => {
      clearTimeout(timer);
      unsubOrders();
      unsubMovements();
    };
  }, [branchId, fetchData]);

  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);
  const incoming = useMemo(
    () => incomingByItem(orders, lines),
    [orders, lines]
  );
  const draft = useMemo(
    () =>
      orders.find((o) => o.group_id === groupId && o.placed_at === null) ??
      null,
    [orders, groupId]
  );
  const draftLines = useMemo(
    () => (draft ? lines.filter((l) => l.order_id === draft.id) : []),
    [lines, draft]
  );
  const groupItems = useMemo(
    () =>
      items
        .filter((i) => i.group_id === groupId && !i.is_hidden)
        .sort(compareItems),
    [items, groupId]
  );
  const placedOrders = useMemo(
    () => orders.filter((o) => o.group_id === groupId && o.placed_at !== null),
    [orders, groupId]
  );
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  // Nạp số từ đơn nháp một lần mỗi khi đổi Nhóm (realtime không ghi đè chữ đang gõ).
  useEffect(() => {
    if (loading || !groupId || initFor === groupId) return;
    setInputs(
      Object.fromEntries(draftLines.map((l) => [l.item_id, String(l.qty)]))
    );
    setInitFor(groupId);
  }, [loading, groupId, initFor, draftLines]);

  const parsed = useMemo(() => {
    const errors: Record<string, string> = {};
    const wanted = new Map<string, number>();
    for (const item of groupItems) {
      const raw = inputs[item.id] ?? "";
      if (!raw.trim()) continue;
      const r = parseQty(raw, {
        caseSize: item.case_size,
        byPercent: item.record_by_percent,
      });
      if (!r.ok) errors[item.id] = r.error;
      else if (r.value > 0) wanted.set(item.id, r.value);
    }
    return { errors, wanted };
  }, [inputs, groupItems]);

  const fmt = (item: Tables<"items"> | undefined, qty: number) =>
    formatQty(qty, {
      caseSize: item?.case_size ?? null,
      unit: item?.unit ?? "",
      byPercent: item?.record_by_percent ?? false,
    });

  // Alert xác nhận giữ closure cũ; đọc dữ liệu mới nhất từ ref khi thực sự lưu/đặt.
  const latest = useRef({
    draft,
    draftLines,
    wanted: parsed.wanted,
    scope: new Set<string>(),
  });
  latest.current = {
    draft,
    draftLines,
    wanted: parsed.wanted,
    scope: new Set(groupItems.map((i) => i.id)),
  };

  const hasErrors = Object.keys(parsed.errors).length > 0;

  async function run(action: () => Promise<string | null>) {
    if (!online || busy.current) return;
    busy.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const err = await action();
      setMessage(err);
      await fetchData();
    } catch {
      setMessage("Không lưu được. Kiểm tra mạng.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const handleSave = () =>
    run(async () => {
      if (!groupId) return null;
      const cur = latest.current;
      const { error: err } = await saveDraft(
        branchId,
        groupId,
        { order: cur.draft, lines: cur.draftLines },
        cur.wanted,
        cur.scope
      );
      return err ?? "Đã lưu nháp";
    });

  const handlePlace = () => {
    if (!groupId || parsed.wanted.size === 0) {
      setMessage("Đơn chưa có món nào");
      return;
    }
    Alert.alert(
      "Đã đặt đúng như đơn?",
      "Đơn sẽ khóa, không sửa được nữa và các món thành Hàng đang về.",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Đã đặt",
          onPress: () =>
            void run(async () => {
              const cur = latest.current;
              const saved = await saveDraft(
                branchId,
                groupId,
                { order: cur.draft, lines: cur.draftLines },
                cur.wanted,
                cur.scope
              );
              if (saved.error || !saved.orderId) return saved.error;
              const placed = await placeOrder(saved.orderId);
              if (!placed.error) setInitFor(null); // nạp lại cho đơn nháp mới (rỗng)
              return placed.error ?? "Đã đặt: các món thành Hàng đang về";
            }),
        },
      ]
    );
  };

  const handleDelete = () => {
    if (!draft) return;
    Alert.alert("Xóa đơn nháp?", "Các số đã lưu trong nháp sẽ mất.", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: () =>
          void run(async () => {
            const { error: err } = await deleteDraft(draft.id);
            if (!err) {
              setInputs({});
              setInitFor(groupId);
            }
            return err;
          }),
      },
    ]);
  };

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

  const saveDisabled = !online || saving || hasErrors;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabs}
        contentContainerStyle={styles.tabsContent}
      >
        {groups.map((g) => (
          <Pressable
            key={g.id}
            style={[styles.chip, g.id === groupId && styles.chipSelected]}
            onPress={() => {
              setGroupId(g.id);
              setMessage(null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: g.id === groupId }}
          >
            <Text
              style={[
                styles.chipText,
                g.id === groupId && styles.chipTextSelected,
              ]}
            >
              {g.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {!online && <Text style={styles.error}>Mất mạng — không lưu được</Text>}
      {message && <Text style={styles.message}>{message}</Text>}

      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>
          {draft ? "Đơn nháp" : "Đơn mới"} — nhập số lượng cần đặt
        </Text>
        {groupItems.map((item) => {
          const stock = totalQty(lotsByItem.get(item.id) ?? []);
          const coming = incoming.get(item.id) ?? 0;
          return (
            <View key={item.id} style={styles.row}>
              <Text style={styles.name}>
                {item.name}
                {item.name_zh ? ` · ${item.name_zh}` : ""}
              </Text>
              <Text style={styles.meta}>
                Tồn kho thực tế: {fmt(item, stock)} · Hàng đang về:{" "}
                {fmt(item, coming)} · Tồn kho dự tính:{" "}
                {fmt(item, projectedQty(stock, coming))}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={
                  item.case_size !== null
                    ? "Số lượng đặt (vd 1T+3)"
                    : "Số lượng đặt"
                }
                value={inputs[item.id] ?? ""}
                onChangeText={(t) => setInputs((p) => ({ ...p, [item.id]: t }))}
              />
              {parsed.errors[item.id] && (
                <Text style={styles.error}>{parsed.errors[item.id]}</Text>
              )}
            </View>
          );
        })}
        {groupItems.length === 0 && (
          <Text style={styles.meta}>Nhóm này chưa có món.</Text>
        )}

        <Text style={styles.section}>Đơn đã đặt của nhóm này</Text>
        {placedOrders.length === 0 && <Text style={styles.meta}>Chưa có.</Text>}
        {placedOrders.map((o) => (
          <View key={o.id} style={styles.row}>
            <Text style={styles.name}>
              Đặt ngày {formatDate(localDate(o.placed_at ?? o.created_at))}
            </Text>
            {lines
              .filter((l) => l.order_id === o.id)
              .map((l) => (
                <Text key={l.id} style={styles.meta}>
                  {itemsById.get(l.item_id)?.name ?? "?"}:{" "}
                  {fmt(itemsById.get(l.item_id), l.qty)}
                </Text>
              ))}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.primary, saveDisabled && styles.disabled]}
          disabled={saveDisabled}
          onPress={() => void handleSave()}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>
            {saving ? "Đang lưu…" : "Lưu nháp"}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.primary,
            styles.place,
            saveDisabled && styles.disabled,
          ]}
          disabled={saveDisabled}
          onPress={handlePlace}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Đã đặt đúng như đơn</Text>
        </Pressable>
        {draft && (
          <Pressable
            style={styles.linkBtn}
            disabled={!online || saving}
            onPress={handleDelete}
            accessibilityRole="button"
          >
            <Text style={styles.danger}>Xóa đơn nháp</Text>
          </Pressable>
        )}
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
  tabs: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: "#e4e4e7" },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#f4f4f5",
  },
  chipSelected: { backgroundColor: "#0f766e" },
  chipText: { fontSize: 15, color: "#18181b" },
  chipTextSelected: { color: "#fff", fontWeight: "600" },
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f766e",
    padding: 16,
    backgroundColor: "#f4f4f5",
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
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  error: { color: "#b91c1c", fontSize: 14, textAlign: "center" },
  message: { color: "#0f766e", fontSize: 14, textAlign: "center", padding: 8 },
  footer: {
    padding: 16,
    gap: 8,
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
  place: { backgroundColor: "#b45309" },
  disabled: { opacity: 0.5 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkBtn: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  danger: { color: "#b91c1c", fontSize: 15, fontWeight: "600" },
});

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "../lib/debounce";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { confirmAction } from "../ui/confirm";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import { Loading } from "../ui/Loading";
import { loadCatalog } from "../catalog/api";
import { compareGroups, compareItems } from "../catalog/sections";
import { ItemQtyModal } from "../components/ItemQtyModal";
import type { Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import { loadMovements, subscribeMovements } from "../stock/api";
import { stockByItem, totalQty } from "../stock/ledger";
import { formatItemQty, parseQty } from "../stock/qty";
import {
  deleteDraft,
  loadOrders,
  placeOrder,
  saveDraft,
  subscribeOrders,
  type OrderLineRow,
  type OrderRow,
} from "./api";
import { incomingByItem, projectedQty, sheetQtyByItem } from "./orders";
import { PlacedOrderSheet } from "./PlacedOrderSheet";
import { loadReceivingData, subscribeReceiving } from "./receivingApi";

type Props = { branchId: string };

export function OrderScreen({ branchId }: Props) {
  const online = useOnline();
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [receivedLineIds, setReceivedLineIds] = useState<Set<string>>(
    () => new Set()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [initFor, setInitFor] = useState<string | null>(null); // Nhóm đã nạp số từ đơn nháp
  const [saving, setSaving] = useState(false);
  const busy = useRef(false); // chống bấm đôi trước khi state kịp cập nhật
  const [message, setMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const dirty = useRef(false); // có số chưa lưu (chỉ đặt khi người dùng gõ)
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Chỉ nhận kết quả của lần tải mới nhất; lần tải cũ về sau bị bỏ.
  const latestRequest = useRef(0);
  const fetchData = useCallback(async () => {
    const request = ++latestRequest.current;
    setError(false);
    try {
      const [catalog, movs, ord, rec] = await Promise.all([
        loadCatalog(branchId),
        loadMovements(branchId),
        loadOrders(branchId),
        loadReceivingData(branchId),
      ]);
      if (request !== latestRequest.current) return;
      setGroups([...catalog.groups].sort(compareGroups));
      setItems(catalog.items);
      setMovements(movs);
      setOrders(ord.orders);
      setLines(ord.lines);
      setReceivedLineIds(rec.receivedLineIds);
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
    const reload = debounce(() => void fetchData());
    const unsubOrders = subscribeOrders(branchId, reload);
    const unsubMovements = subscribeMovements(branchId, reload);
    const unsubReceiving = subscribeReceiving(branchId, reload);
    return () => {
      reload.cancel();
      unsubOrders();
      unsubMovements();
      unsubReceiving();
    };
  }, [branchId, fetchData]);

  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);
  const incoming = useMemo(
    () => incomingByItem(orders, lines, receivedLineIds),
    [orders, lines, receivedLineIds]
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
  const sheetData = useMemo(
    () => sheetQtyByItem(placedOrders, lines, receivedLineIds),
    [placedOrders, lines, receivedLineIds]
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
    const values: Record<string, number> = {};
    const wanted = new Map<string, number>();
    for (const item of groupItems) {
      const raw = inputs[item.id] ?? "";
      if (!raw.trim()) continue;
      const r = parseQty(raw, {
        caseSize: item.case_size,
        byPercent: item.record_by_percent,
      });
      if (!r.ok) errors[item.id] = r.error;
      else {
        values[item.id] = r.value;
        if (r.value > 0) wanted.set(item.id, r.value);
      }
    }
    return { errors, values, wanted };
  }, [inputs, groupItems]);

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

  // Tự lưu nháp: không nút, không thông báo; lỗi mạng thì giữ dấu "chưa lưu" để thử lại.
  async function autosave() {
    if (!groupId || !online || busy.current) return;
    busy.current = true;
    dirty.current = false;
    setSaveState("saving");
    try {
      const cur = latest.current;
      const { error: err } = await saveDraft(
        branchId,
        groupId,
        { order: cur.draft, lines: cur.draftLines },
        cur.wanted,
        cur.scope
      );
      if (err) throw new Error(err);
      await fetchData();
      setMessage(null);
      setSaveState("saved");
    } catch {
      dirty.current = true;
      setSaveState("idle");
      setMessage("Chưa lưu được nháp. Kiểm tra mạng.");
    } finally {
      busy.current = false;
    }
  }

  // Gõ xong khoảng 0,8 giây thì lưu; đang lưu dở thì lưu tiếp phần mới ngay khi xong.
  useEffect(() => {
    if (!dirty.current || hasErrors || !online || saveState === "saving")
      return;
    const timer = setTimeout(() => void autosave(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, hasErrors, online, saveState]);

  // Đổi Nhóm hay rời màn: lưu ngay phần chưa lưu, không mất số vừa gõ.
  const flush = () => {
    if (dirty.current && !hasErrors) void autosave();
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const handlePlace = () => {
    if (!groupId || parsed.wanted.size === 0) {
      setMessage("Đơn chưa có món nào");
      return;
    }
    confirmAction({
      title: "Đã đặt đúng như đơn?",
      message: "Đơn sẽ khóa, không sửa được nữa và các món thành Hàng đang về.",
      confirmText: "Đã đặt",
      onConfirm: () =>
        void run(async () => {
          dirty.current = false;
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
    });
  };

  const handleDelete = () => {
    if (!draft) return;
    confirmAction({
      title: "Xóa đơn nháp?",
      message: "Các số đã lưu trong nháp sẽ mất.",
      confirmText: "Xóa",
      destructive: true,
      onConfirm: () =>
        void run(async () => {
          const { error: err } = await deleteDraft(draft.id);
          if (!err) {
            dirty.current = false;
            setInputs({});
            setInitFor(groupId);
          }
          return err;
        }),
    });
  };

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

  const placeDisabled =
    !online || saving || saveState === "saving" || hasErrors;

  const editingItem = editingItemId
    ? (itemsById.get(editingItemId) ?? null)
    : null;
  const editingInfo = editingItem
    ? (() => {
        const stock = totalQty(lotsByItem.get(editingItem.id) ?? []);
        const coming = incoming.get(editingItem.id) ?? 0;
        return [
          `Tồn kho thực tế: ${formatItemQty(editingItem, stock)}`,
          `Hàng đang về: ${formatItemQty(editingItem, coming)}`,
          `Tồn kho dự tính: ${formatItemQty(editingItem, projectedQty(stock, coming))}`,
        ];
      })()
    : [];
  const editingQty = editingItem ? parsed.values[editingItem.id] : undefined;
  const editingError = editingItem
    ? (parsed.errors[editingItem.id] ?? null)
    : null;
  const editingPreview =
    editingItem && editingQty !== undefined && !editingError
      ? `= ${formatItemQty(editingItem, editingQty)}`
      : null;

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
              if (g.id !== groupId) flush();
              setGroupId(g.id);
              setEditingItemId(null);
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
      <View style={styles.statusRow}>
        <Text style={styles.saveStatus}>
          {saveState === "saving"
            ? "Đang lưu…"
            : saveState === "saved"
              ? "Đã tự lưu"
              : "Số bạn nhập tự động được lưu"}
        </Text>
        <Pressable
          style={styles.viewBtn}
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
        >
          <Text style={styles.viewBtnText}>Đơn đã đặt</Text>
        </Pressable>
      </View>
      {!online && <Text style={styles.error}>Mất mạng — không lưu được</Text>}
      {message && <Text style={styles.message}>{message}</Text>}

      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>
          {draft ? "Đơn nháp" : "Đơn mới"} · chạm món để nhập số lượng
        </Text>
        {groupItems.map((item) => {
          const stock = totalQty(lotsByItem.get(item.id) ?? []);
          const coming = incoming.get(item.id) ?? 0;
          const validQty = parsed.values[item.id];
          const fieldError = parsed.errors[item.id];
          return (
            <Pressable
              key={item.id}
              style={styles.row}
              onPress={() => setEditingItemId(item.id)}
              accessibilityRole="button"
            >
              <View style={styles.rowTop}>
                <Text style={styles.name}>
                  {item.name}
                  {item.name_zh ? ` · ${item.name_zh}` : ""}
                </Text>
                {validQty !== undefined && (
                  <Text style={styles.orderPill}>
                    Đặt {formatItemQty(item, validQty)}
                  </Text>
                )}
              </View>
              <View style={styles.stats}>
                {[
                  ["Tồn kho", formatItemQty(item, stock)],
                  ["Đang về", formatItemQty(item, coming)],
                  ["Dự tính", formatItemQty(item, projectedQty(stock, coming))],
                ].map(([label, value]) => (
                  <View key={label} style={styles.stat}>
                    <Text style={styles.statLabel}>{label}</Text>
                    <Text style={styles.statValue}>{value}</Text>
                  </View>
                ))}
              </View>
              {fieldError && (
                <Text style={styles.fieldError}>{fieldError}</Text>
              )}
            </Pressable>
          );
        })}
        {groupItems.length === 0 && (
          <Text style={styles.meta}>Nhóm này chưa có món.</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.primary, placeDisabled && styles.disabled]}
          disabled={placeDisabled}
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

      <PlacedOrderSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        groupName={groups.find((g) => g.id === groupId)?.name ?? ""}
        items={groupItems}
        qtyByItem={sheetData.qty}
        placedAt={sheetData.placedAt}
      />
      <ItemQtyModal
        visible={editingItem !== null}
        title={
          editingItem
            ? `${editingItem.name}${editingItem.name_zh ? ` · ${editingItem.name_zh}` : ""}`
            : ""
        }
        info={editingInfo}
        label="Số lượng đặt"
        placeholder={editingItem?.case_size !== null ? "vd 1T+3" : "0"}
        value={editingItem ? (inputs[editingItem.id] ?? "") : ""}
        error={editingError}
        preview={editingPreview}
        onChangeText={(t) => {
          if (!editingItem) return;
          dirty.current = true;
          setInputs((p) => ({ ...p, [editingItem.id]: t }));
        }}
        onDone={() => setEditingItemId(null)}
        onReset={() => {
          if (editingItem) {
            const id = editingItem.id;
            dirty.current = true;
            setInputs((p) => {
              const next = { ...p };
              delete next[id];
              return next;
            });
          }
          setEditingItemId(null);
        }}
      />
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
  tabs: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: {
    paddingHorizontal: 16,
    minHeight: 40,
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: c.accentSoft,
  },
  chipSelected: { backgroundColor: c.accentDeep },
  chipText: { fontSize: 15, color: c.ink },
  chipTextSelected: { color: c.onAccent, fontWeight: "600" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  saveStatus: { flex: 1, fontSize: 13, color: c.muted },
  viewBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.accentDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  viewBtnText: { color: c.accentDeep, fontSize: 14, fontWeight: "600" },
  section: {
    fontSize: 14,
    fontWeight: "600",
    color: c.accentDeep,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: c.accentSoft,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.accentSoft,
    backgroundColor: c.surface,
    gap: 8,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: c.ink },
  orderPill: {
    fontSize: 13,
    fontWeight: "700",
    color: c.onAccent,
    backgroundColor: c.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: c.bg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statLabel: { fontSize: 11, color: c.muted },
  statValue: { fontSize: 14, fontWeight: "600", color: c.ink },
  meta: { fontSize: 13, color: c.muted, paddingHorizontal: 16 },
  fieldError: { color: c.red, fontSize: 14 },
  error: { color: c.red, fontSize: 14, textAlign: "center" },
  message: {
    color: c.accentDeep,
    fontSize: 14,
    textAlign: "center",
    padding: 8,
  },
  footer: {
    padding: 16,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.surface,
  },
  primary: {
    backgroundColor: c.accentDeep,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
  linkBtn: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  danger: { color: c.red, fontSize: 15, fontWeight: "600" },
}));

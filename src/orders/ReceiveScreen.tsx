import { formatDayMonth, formatMfg, usesMfgDate } from "../stock/expiry";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { confirmAction } from "../ui/confirm";
import { TextInput } from "../ui/TextInput";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import { Loading } from "../ui/Loading";
import { loadCatalog } from "../catalog/api";
import { compareGroups, compareItems } from "../catalog/sections";
import type { Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import { formatDate, parseShortDate } from "../stock/date";
import { formatQty, parseQty } from "../stock/qty";
import {
  loadOrders,
  subscribeOrders,
  type OrderLineRow,
  type OrderRow,
} from "./api";
import {
  allocateReceipt,
  planGroupReceipt,
  type GroupLineInput,
} from "./receiving";
import {
  loadReceivingData,
  receiveLines,
  subscribeReceiving,
} from "./receivingApi";

type Props = { branchId: string };

// Món cùng Nhóm đặt ở nhiều đơn gộp thành một dòng khi nhận; `parts` là các dòng đơn gốc, đơn cũ nhất trước.
type MergedLine = {
  id: string; // `${nhóm}|${món}`, khóa cho các ô nhập
  item_id: string;
  qty: number; // tổng đã đặt
  parts: { id: string; qty: number }[];
};

type LinePlan = Extract<
  ReturnType<typeof planGroupReceipt>,
  { ok: true }
>["lines"][number];

function omitKeys<T>(
  record: Record<string, T>,
  keys: string[]
): Record<string, T> {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
}

function sameUnitKind(items: (Tables<"items"> | undefined)[]): boolean {
  if (items.length === 0) return false;
  const first = items[0];
  if (!first) return false;
  const unit = first.unit.trim().toLowerCase();
  if (!unit) return false;
  return items.every(
    (item) =>
      item !== undefined &&
      item.unit.trim().toLowerCase() === unit &&
      item.case_size === first.case_size &&
      item.record_by_percent === first.record_by_percent
  );
}

export function ReceiveScreen({ branchId }: Props) {
  const online = useOnline();
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [receivedLineIds, setReceivedLineIds] = useState<Set<string>>(
    () => new Set()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false); // chống bấm đôi trước khi state kịp cập nhật
  const [message, setMessage] = useState<string | null>(null);

  const [shortInputs, setShortInputs] = useState<Record<string, string>>({});
  const [damagedInputs, setDamagedInputs] = useState<Record<string, string>>(
    {}
  );
  const [mfgInputs, setMfgInputs] = useState<Record<string, string>>({});
  const [groupErrors, setGroupErrors] = useState<Record<string, string[]>>({});
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  // Chỉ nhận kết quả của lần tải mới nhất; lần tải cũ về sau bị bỏ.
  const latestRequest = useRef(0);
  const fetchData = useCallback(async () => {
    const request = ++latestRequest.current;
    setError(false);
    try {
      const [catalog, ord, rec] = await Promise.all([
        loadCatalog(branchId),
        loadOrders(branchId),
        loadReceivingData(branchId),
      ]);
      if (request !== latestRequest.current) return;
      setGroups([...catalog.groups].sort(compareGroups));
      setItems(catalog.items);
      setOrders(ord.orders);
      setLines(ord.lines);
      setReceivedLineIds(rec.receivedLineIds);
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
    const unsubReceiving = subscribeReceiving(branchId, reload);
    return () => {
      clearTimeout(timer);
      unsubOrders();
      unsubReceiving();
    };
  }, [branchId, fetchData]);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  const groupedLines = useMemo(() => {
    const placedOrder = new Map<string, OrderRow>();
    for (const order of orders) {
      if (order.placed_at !== null) placedOrder.set(order.id, order);
    }
    // Dòng chưa nhận, đơn cũ nhất trước, gộp theo (Nhóm, món).
    const pending = lines
      .filter((l) => !receivedLineIds.has(l.id) && placedOrder.has(l.order_id))
      .sort((a, b) =>
        (placedOrder.get(a.order_id)?.placed_at ?? "").localeCompare(
          placedOrder.get(b.order_id)?.placed_at ?? ""
        )
      );
    const merged = new Map<string, MergedLine>();
    const byGroup = new Map<string, MergedLine[]>();
    for (const line of pending) {
      const groupId = placedOrder.get(line.order_id)?.group_id ?? "";
      const key = `${groupId}|${line.item_id}`;
      const part = { id: line.id, qty: line.qty };
      const existing = merged.get(key);
      if (existing) {
        existing.parts.push(part);
        existing.qty += line.qty;
        continue;
      }
      const entry: MergedLine = {
        id: key,
        item_id: line.item_id,
        qty: line.qty,
        parts: [part],
      };
      merged.set(key, entry);
      const list = byGroup.get(groupId);
      if (list) list.push(entry);
      else byGroup.set(groupId, [entry]);
    }
    const itemOf = (m: MergedLine) => itemsById.get(m.item_id);
    return {
      merged,
      list: groups
        .map((group) => ({
          group,
          groupLines: (byGroup.get(group.id) ?? []).sort((a, b) => {
            const ia = itemOf(a);
            const ib = itemOf(b);
            return ia && ib ? compareItems(ia, ib) : 0;
          }),
        }))
        .filter((entry) => entry.groupLines.length > 0),
    };
  }, [groups, orders, lines, receivedLineIds, itemsById]);

  const editingLine = editingLineId
    ? (groupedLines.merged.get(editingLineId) ?? null)
    : null;
  const editingItem = editingLine
    ? itemsById.get(editingLine.item_id)
    : undefined;

  const fmt = (item: Tables<"items"> | undefined, qty: number) =>
    formatQty(qty, {
      caseSize: item?.case_size ?? null,
      unit: item?.unit ?? "",
      byPercent: item?.record_by_percent ?? false,
    });

  function formatEditedSummary(
    line: MergedLine,
    item: Tables<"items"> | undefined
  ): string | null {
    const rawShort = (shortInputs[line.id] ?? "").trim();
    const rawDamaged = (damagedInputs[line.id] ?? "").trim();
    const rawMfg = (mfgInputs[line.id] ?? "").trim();
    if (!rawShort && !rawDamaged && !rawMfg) return null;

    const qtyOpts = {
      caseSize: item?.case_size ?? null,
      byPercent: item?.record_by_percent ?? false,
    };

    const shortParsed = rawShort ? parseQty(rawShort, qtyOpts) : null;
    const shortText = !rawShort
      ? fmt(item, 0)
      : shortParsed?.ok
        ? fmt(item, shortParsed.value)
        : rawShort;

    const damagedParsed = rawDamaged ? parseQty(rawDamaged, qtyOpts) : null;
    const damagedText = !rawDamaged
      ? fmt(item, 0)
      : damagedParsed?.ok
        ? fmt(item, damagedParsed.value)
        : rawDamaged;

    const mfgParsed = rawMfg ? parseShortDate(rawMfg, new Date()) : null;
    const mfgText = !rawMfg
      ? null
      : mfgParsed?.ok
        ? item
          ? formatMfg(mfgParsed.value, item)
          : formatDayMonth(mfgParsed.value)
        : rawMfg;

    const parts = [`Thiếu ${shortText}`, `Hư ${damagedText}`];
    if (mfgText) parts.push(`NSX ${mfgText}`);
    return parts.join(" · ");
  }

  async function runSave(action: () => Promise<void>) {
    if (!online || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await action();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function commitGroupReceive(
    groupId: string,
    planLines: LinePlan[],
    lineItems: (Tables<"items"> | undefined)[]
  ) {
    await runSave(async () => {
      // Mỗi món đã gộp chia về từng dòng đơn gốc (đơn cũ nhất lấp đầy trước) rồi nhận lần lượt.
      const owners: string[] = [];
      const toSave = planLines.flatMap((l) => {
        const parts = groupedLines.merged.get(l.key)?.parts ?? [];
        return allocateReceipt(parts, l.plan.short, l.plan.damaged).map((a) => {
          owners.push(l.key);
          return {
            lineId: a.id,
            received: a.received,
            damaged: a.damaged,
            mfgDate: l.plan.mfgDate,
          };
        });
      });
      const res = await receiveLines(toSave);
      if (res.error) {
        const savedOwners = owners.slice(0, res.done);
        // Món đã lưu được ít nhất một dòng đơn gốc thì xóa ô nhập (phần còn lại phải nhập lại),
        // nếu giữ thì lần nhận sau tính hàng hư/thiếu hai lần.
        const touchedKeys = planLines
          .filter((l) => savedOwners.includes(l.key))
          .map((l) => l.key);
        if (touchedKeys.length > 0) {
          setShortInputs((p) => omitKeys(p, touchedKeys));
          setDamagedInputs((p) => omitKeys(p, touchedKeys));
          setMfgInputs((p) => omitKeys(p, touchedKeys));
        }
        // Món chỉ tính là xong khi mọi dòng đơn gốc của nó đã nhận.
        const doneCount = planLines.filter(
          (l) =>
            savedOwners.filter((k) => k === l.key).length ===
            (groupedLines.merged.get(l.key)?.parts.length ?? 0)
        ).length;
        setMessage(
          `Đã nhận ${doneCount}/${planLines.length} món. Lỗi: ${res.error}${touchedKeys.length > doneCount ? ". Có món mới nhận một phần, hãy nhập lại số thiếu/hư cho phần còn lại." : ""}`
        );
        await fetchData();
        return;
      }

      const allKeys = planLines.map((l) => l.key);
      setShortInputs((p) => omitKeys(p, allKeys));
      setDamagedInputs((p) => omitKeys(p, allKeys));
      setMfgInputs((p) => omitKeys(p, allKeys));
      setGroupErrors((p) => omitKeys(p, [groupId]));

      if (sameUnitKind(lineItems)) {
        const refItem = lineItems[0];
        const totalGood = planLines.reduce((s, l) => s + l.plan.good, 0);
        const totalShort = planLines.reduce((s, l) => s + l.plan.short, 0);
        const totalDamaged = planLines.reduce((s, l) => s + l.plan.damaged, 0);
        setMessage(
          `Đã nhận ${planLines.length} món: vào kho ${fmt(refItem, totalGood)} · Thiếu ${fmt(refItem, totalShort)} · Hư ${fmt(refItem, totalDamaged)}`
        );
      } else {
        const shortCount = planLines.filter((l) => l.plan.short > 0).length;
        const damagedCount = planLines.filter((l) => l.plan.damaged > 0).length;
        setMessage(
          `Đã nhận ${planLines.length} món (thiếu ${shortCount} món · hư ${damagedCount} món)`
        );
      }
      await fetchData();
    });
  }

  function handleGroupReceive(
    group: Tables<"item_groups">,
    groupLines: MergedLine[]
  ) {
    if (!online || busy.current) return;
    setMessage(null);
    setGroupErrors((p) => omitKeys(p, [group.id]));

    const today = new Date();
    const parseErrors: string[] = [];
    const inputs: GroupLineInput[] = [];
    const lineItems: (Tables<"items"> | undefined)[] = [];

    for (const line of groupLines) {
      const item = itemsById.get(line.item_id);
      const name = item?.name ?? "?";
      const qtyOpts = {
        caseSize: item?.case_size ?? null,
        byPercent: item?.record_by_percent ?? false,
      };
      const lineErrs: string[] = [];

      let short = 0;
      const rawShort = (shortInputs[line.id] ?? "").trim();
      if (rawShort) {
        const parsed = parseQty(rawShort, qtyOpts);
        if (!parsed.ok) lineErrs.push(`Số hàng thiếu: ${parsed.error}`);
        else short = parsed.value;
      }

      let damaged = 0;
      const rawDamaged = (damagedInputs[line.id] ?? "").trim();
      if (rawDamaged) {
        const parsed = parseQty(rawDamaged, qtyOpts);
        if (!parsed.ok) lineErrs.push(`Hàng hư: ${parsed.error}`);
        else damaged = parsed.value;
      }

      let mfgDate: string | null = null;
      // Món không dùng Ngày sản xuất (ô đã ẩn): bỏ qua chữ cũ còn sót trong ô.
      const rawMfg =
        item && usesMfgDate(item) ? (mfgInputs[line.id] ?? "").trim() : "";
      if (rawMfg) {
        const parsed = parseShortDate(rawMfg, today);
        if (!parsed.ok) lineErrs.push(`Ngày sản xuất: ${parsed.error}`);
        else mfgDate = parsed.value;
      }

      if (lineErrs.length > 0) {
        parseErrors.push(`${name}: ${lineErrs.join("; ")}`);
      } else {
        inputs.push({
          key: line.id,
          name,
          ordered: line.qty,
          short,
          damaged,
          mfgDate,
          tracksMfg: item?.track_mfg_date ?? false,
        });
        lineItems.push(item);
      }
    }

    const plan = planGroupReceipt(inputs);
    if (parseErrors.length > 0 || !plan.ok) {
      const planErrs = plan.ok
        ? []
        : plan.errors.map((e) => `${e.name}: ${e.error}`);
      setGroupErrors((p) => ({
        ...p,
        [group.id]: [...parseErrors, ...planErrs],
      }));
      return;
    }

    confirmAction({
      title: `Nhận ${plan.lines.length} món của ${group.name}?`,
      confirmText: "Đã nhận hàng",
      onConfirm: () => void commitGroupReceive(group.id, plan.lines, lineItems),
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Loading />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Không tải được dữ liệu. Kiểm tra mạng.</Text>
        <Pressable
          style={styles.primary}
          onPress={() => {
            setLoading(true);
            void fetchData();
          }}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  const actionDisabled = !online || saving;

  return (
    <View style={styles.container}>
      {!online && <Text style={styles.error}>Mất mạng — không lưu được</Text>}
      {message && <Text style={styles.message}>{message}</Text>}

      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Hàng đang về</Text>
        {groupedLines.list.length === 0 && (
          <Text style={styles.meta}>Không có hàng đang về.</Text>
        )}
        {groupedLines.list.map(({ group, groupLines }) => {
          const errs = groupErrors[group.id] ?? [];
          return (
            <View key={group.id} style={styles.groupBlock}>
              <Text style={styles.groupHeader}>{group.name}</Text>
              {groupLines.map((line) => {
                const item = itemsById.get(line.item_id);
                const summary = formatEditedSummary(line, item);
                return (
                  <Pressable
                    key={line.id}
                    style={styles.row}
                    onPress={() => setEditingLineId(line.id)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.name}>
                      {item?.name ?? "?"}
                      {item?.name_zh ? ` · ${item.name_zh}` : ""}
                    </Text>
                    <Text style={styles.metaInline}>
                      Đã đặt: {fmt(item, line.qty)}
                      {line.parts.length > 1
                        ? ` (gộp ${line.parts.length} đơn)`
                        : ""}
                    </Text>
                    {summary && (
                      <Text style={styles.summaryText}>{summary}</Text>
                    )}
                  </Pressable>
                );
              })}
              {errs.length > 0 && (
                <View style={styles.errorBox}>
                  {errs.map((err, idx) => (
                    <Text key={idx} style={styles.fieldError}>
                      {err}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.groupFooter}>
                <Pressable
                  style={[styles.primary, actionDisabled && styles.disabled]}
                  disabled={actionDisabled}
                  onPress={() => handleGroupReceive(group, groupLines)}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>Đã nhận hàng</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal
        visible={editingLine !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingLineId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {editingLine && (
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>
                    {editingItem?.name ?? "?"}
                    {editingItem?.name_zh ? ` · ${editingItem.name_zh}` : ""}
                  </Text>
                  <Text style={styles.metaInline}>
                    Đã đặt: {fmt(editingItem, editingLine.qty)}
                  </Text>

                  <Text style={styles.label}>Số hàng thiếu</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    value={shortInputs[editingLine.id] ?? ""}
                    onChangeText={(t) =>
                      setShortInputs((p) => ({ ...p, [editingLine.id]: t }))
                    }
                  />

                  <Text style={styles.label}>Hàng hư</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    value={damagedInputs[editingLine.id] ?? ""}
                    onChangeText={(t) =>
                      setDamagedInputs((p) => ({ ...p, [editingLine.id]: t }))
                    }
                  />

                  {editingItem && usesMfgDate(editingItem) && (
                    <>
                      <Text style={styles.label}>
                        {editingItem?.track_mfg_date
                          ? "Ngày sản xuất (bắt buộc)"
                          : "Ngày sản xuất"}
                      </Text>
                      <TextInput
                        style={styles.input}
                        placeholder={
                          editingItem?.track_mfg_date
                            ? "bắt buộc, vd 28"
                            : "vd 28"
                        }
                        value={mfgInputs[editingLine.id] ?? ""}
                        onChangeText={(t) =>
                          setMfgInputs((p) => ({ ...p, [editingLine.id]: t }))
                        }
                      />
                    </>
                  )}

                  <View style={styles.btnRow}>
                    <Pressable
                      style={[styles.secondary, styles.btnHalf]}
                      onPress={() => {
                        const id = editingLine.id;
                        setShortInputs((p) => omitKeys(p, [id]));
                        setDamagedInputs((p) => omitKeys(p, [id]));
                        setMfgInputs((p) => omitKeys(p, [id]));
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.secondaryText}>Đặt lại</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.primary, styles.btnHalf]}
                      onPress={() => setEditingLineId(null)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.primaryText}>Xong</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: c.accentDeep,
    padding: 16,
    backgroundColor: c.accentSoft,
  },
  groupBlock: {
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    backgroundColor: c.surface,
  },
  groupHeader: {
    fontSize: 15,
    fontWeight: "700",
    color: c.ink,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: c.bg,
    borderBottomWidth: 1,
    borderBottomColor: c.accentSoft,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.accentSoft,
    backgroundColor: c.surface,
    gap: 4,
  },
  name: { fontSize: 16, fontWeight: "600", color: c.ink },
  meta: { fontSize: 13, color: c.muted, padding: 16 },
  metaInline: { fontSize: 13, color: c.muted },
  summaryText: { fontSize: 13, color: c.accentDeep, fontWeight: "600" },
  errorBox: { paddingHorizontal: 16, paddingTop: 10, gap: 4 },
  groupFooter: { padding: 16 },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: c.surface,
  },
  label: { fontSize: 14, fontWeight: "600", color: c.ink, marginTop: 4 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  btnHalf: { flex: 1 },
  error: { color: c.red, fontSize: 14, textAlign: "center", padding: 8 },
  fieldError: { color: c.red, fontSize: 14 },
  message: {
    color: c.accentDeep,
    fontSize: 14,
    textAlign: "center",
    padding: 8,
  },
  primary: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  secondary: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    backgroundColor: c.surface,
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
  secondaryText: { color: c.ink, fontSize: 16, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    maxHeight: "85%",
    padding: 16,
  },
  modalContent: { gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: c.ink },
}));

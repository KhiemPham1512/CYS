import { formatMfg, usesMfgDate } from "../stock/expiry";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
  planGroupSettle,
  owedBreakdown,
  waitingByItem,
  type OwedRow,
  type SettleLineInput,
} from "./receiving";
import {
  loadReceivingData,
  settleLines,
  subscribeReceiving,
} from "./receivingApi";

type Props = { branchId: string };

function omitKeys<T>(
  record: Record<string, T>,
  keys: string[]
): Record<string, T> {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
}

export function OwedScreen({ branchId }: Props) {
  const online = useOnline();
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [owed, setOwed] = useState<OwedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false); // chống bấm đôi trước khi state kịp cập nhật
  const [message, setMessage] = useState<string | null>(null);

  const [stillMissingInputs, setStillMissingInputs] = useState<
    Record<string, string>
  >({});
  const [mfgInputs, setMfgInputs] = useState<Record<string, string>>({});
  const [groupErrors, setGroupErrors] = useState<Record<string, string[]>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Chỉ nhận kết quả của lần tải mới nhất; lần tải cũ về sau bị bỏ.
  const latestRequest = useRef(0);
  const fetchData = useCallback(async () => {
    const request = ++latestRequest.current;
    setError(false);
    try {
      const [catalog, rec] = await Promise.all([
        loadCatalog(branchId),
        loadReceivingData(branchId),
      ]);
      if (request !== latestRequest.current) return;
      setGroups([...catalog.groups].sort(compareGroups));
      setItems(catalog.items);
      setOwed(rec.owed);
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
    const unsubReceiving = subscribeReceiving(branchId, reload);
    return () => {
      clearTimeout(timer);
      unsubReceiving();
    };
  }, [branchId, fetchData]);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  const waitingMap = useMemo(() => waitingByItem(owed), [owed]);
  const breakdown = useMemo(() => owedBreakdown(owed), [owed]);

  const groupedWaiting = useMemo(() => {
    const byGroup = new Map<
      string,
      { item: Tables<"items">; waiting: number }[]
    >();
    for (const [itemId, waiting] of waitingMap.entries()) {
      const item = itemsById.get(itemId);
      if (!item) continue;
      const list = byGroup.get(item.group_id);
      if (list) list.push({ item, waiting });
      else byGroup.set(item.group_id, [{ item, waiting }]);
    }
    return groups
      .map((group) => ({
        group,
        entries: (byGroup.get(group.id) ?? []).sort((a, b) =>
          compareItems(a.item, b.item)
        ),
      }))
      .filter((entry) => entry.entries.length > 0);
  }, [groups, waitingMap, itemsById]);

  const editingItem = editingItemId
    ? (itemsById.get(editingItemId) ?? null)
    : null;
  const editingWaiting = editingItemId
    ? (waitingMap.get(editingItemId) ?? 0)
    : 0;

  const fmt = (item: Tables<"items"> | undefined, qty: number) =>
    formatQty(qty, {
      caseSize: item?.case_size ?? null,
      unit: item?.unit ?? "",
      byPercent: item?.record_by_percent ?? false,
    });

  function formatEditedSummary(
    item: Tables<"items">,
    waiting: number
  ): string | null {
    const rawStill = (stillMissingInputs[item.id] ?? "").trim();
    const rawMfg = (mfgInputs[item.id] ?? "").trim();
    if (!rawStill && !rawMfg) return null;

    const qtyOpts = {
      caseSize: item.case_size ?? null,
      byPercent: item.record_by_percent ?? false,
    };
    const stillParsed = rawStill ? parseQty(rawStill, qtyOpts) : null;
    const stillText = !rawStill
      ? fmt(item, waiting)
      : stillParsed?.ok
        ? fmt(item, stillParsed.value)
        : rawStill;

    const mfgParsed = rawMfg ? parseShortDate(rawMfg, new Date()) : null;
    const mfgText = !rawMfg
      ? null
      : mfgParsed?.ok
        ? formatMfg(mfgParsed.value, item)
        : rawMfg;

    const parts = [`Còn thiếu: ${stillText}`];
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

  async function handleGroupSettle(
    group: Tables<"item_groups">,
    entries: { item: Tables<"items">; waiting: number }[]
  ) {
    if (!online || busy.current) return;
    setMessage(null);
    setGroupErrors((p) => omitKeys(p, [group.id]));

    const today = new Date();
    const parseErrors: string[] = [];
    const inputs: SettleLineInput[] = [];

    for (const { item, waiting } of entries) {
      const qtyOpts = {
        caseSize: item.case_size ?? null,
        byPercent: item.record_by_percent ?? false,
      };
      const itemErrs: string[] = [];

      let stillMissing = waiting;
      const rawStill = (stillMissingInputs[item.id] ?? "").trim();
      if (rawStill) {
        const parsed = parseQty(rawStill, qtyOpts);
        if (!parsed.ok) itemErrs.push(`Số vẫn còn thiếu: ${parsed.error}`);
        else stillMissing = parsed.value;
      }

      let mfgDate: string | null = null;
      // Món không dùng Ngày sản xuất (ô đã ẩn): bỏ qua chữ cũ còn sót trong ô.
      const rawMfg = usesMfgDate(item) ? (mfgInputs[item.id] ?? "").trim() : "";
      if (rawMfg) {
        const parsed = parseShortDate(rawMfg, today);
        if (!parsed.ok) itemErrs.push(`Ngày sản xuất: ${parsed.error}`);
        else mfgDate = parsed.value;
      }

      if (itemErrs.length > 0) {
        parseErrors.push(`${item.name}: ${itemErrs.join("; ")}`);
      } else {
        inputs.push({
          key: item.id,
          name: item.name,
          waiting,
          stillMissing,
          mfgDate,
          tracksMfg: item.track_mfg_date,
        });
      }
    }

    const plan = planGroupSettle(inputs);
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

    if (plan.lines.length === 0) {
      setMessage("Chưa có món nào đã về");
      return;
    }

    await runSave(async () => {
      const res = await settleLines(
        plan.lines.map((l) => ({
          itemId: l.key,
          qty: l.qty,
          mfgDate: l.mfgDate,
        }))
      );
      if (res.error) {
        const doneKeys = plan.lines.slice(0, res.done).map((l) => l.key);
        if (doneKeys.length > 0) {
          setStillMissingInputs((p) => omitKeys(p, doneKeys));
          setMfgInputs((p) => omitKeys(p, doneKeys));
        }
        setMessage(
          `Đã nhận bù ${res.done}/${plan.lines.length} món. Lỗi: ${res.error}`
        );
        await fetchData();
        return;
      }

      const allKeys = plan.lines.map((l) => l.key);
      setStillMissingInputs((p) => omitKeys(p, allKeys));
      setMfgInputs((p) => omitKeys(p, allKeys));
      setGroupErrors((p) => omitKeys(p, [group.id]));
      setMessage(`Đã nhận bù ${plan.lines.length} món`);
      await fetchData();
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
        <Text style={styles.section}>Chờ nhà cung cấp</Text>
        {groupedWaiting.length === 0 && (
          <Text style={styles.meta}>
            Không có món nào đang chờ nhà cung cấp.
          </Text>
        )}
        {groupedWaiting.map(({ group, entries }) => {
          const errs = groupErrors[group.id] ?? [];
          return (
            <View key={group.id} style={styles.groupBlock}>
              <Text style={styles.groupHeader}>{group.name}</Text>
              {entries.map(({ item, waiting }) => {
                const summary = formatEditedSummary(item, waiting);
                return (
                  <Pressable
                    key={item.id}
                    style={styles.row}
                    onPress={() => setEditingItemId(item.id)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.name}>
                      {item.name}
                      {item.name_zh ? ` · ${item.name_zh}` : ""}
                    </Text>
                    <Text style={styles.metaInline}>
                      Đang chờ: {fmt(item, waiting)}
                    </Text>
                    <Text style={styles.metaInline}>
                      {[
                        ["Thiếu", breakdown.get(item.id)?.short ?? 0],
                        ["Hư", breakdown.get(item.id)?.damaged ?? 0],
                        ["Đã nhận bù", breakdown.get(item.id)?.settled ?? 0],
                      ]
                        .filter(([, q]) => (q as number) > 0)
                        .map(
                          ([label, q]) => `${label}: ${fmt(item, q as number)}`
                        )
                        .join(" · ")}
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
                  onPress={() => void handleGroupSettle(group, entries)}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>Nhận bù</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal
        visible={editingItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingItemId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {editingItem && (
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>
                    {editingItem.name}
                    {editingItem.name_zh ? ` · ${editingItem.name_zh}` : ""}
                  </Text>
                  <Text style={styles.metaInline}>
                    Đang chờ: {fmt(editingItem, editingWaiting)}
                  </Text>

                  <Text style={styles.label}>Số vẫn còn thiếu</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={fmt(editingItem, editingWaiting)}
                    value={stillMissingInputs[editingItem.id] ?? ""}
                    onChangeText={(t) =>
                      setStillMissingInputs((p) => ({
                        ...p,
                        [editingItem.id]: t,
                      }))
                    }
                  />

                  {usesMfgDate(editingItem) && (
                    <>
                      <Text style={styles.label}>
                        {editingItem.track_mfg_date
                          ? "Ngày sản xuất (bắt buộc khi có nhận)"
                          : "Ngày sản xuất"}
                      </Text>
                      <TextInput
                        style={styles.input}
                        placeholder={
                          editingItem.track_mfg_date
                            ? "bắt buộc, vd 28"
                            : "vd 28"
                        }
                        value={mfgInputs[editingItem.id] ?? ""}
                        onChangeText={(t) =>
                          setMfgInputs((p) => ({ ...p, [editingItem.id]: t }))
                        }
                      />
                    </>
                  )}

                  <View style={styles.btnRow}>
                    <Pressable
                      style={[styles.secondary, styles.btnHalf]}
                      onPress={() => {
                        const id = editingItem.id;
                        setStillMissingInputs((p) => omitKeys(p, [id]));
                        setMfgInputs((p) => omitKeys(p, [id]));
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.secondaryText}>Đặt lại</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.primary, styles.btnHalf]}
                      onPress={() => setEditingItemId(null)}
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

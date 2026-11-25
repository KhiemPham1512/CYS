import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
} from "react-native";
import { TextInput } from "../ui/TextInput";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import { Loading } from "../ui/Loading";
import { loadCatalog } from "../catalog/api";
import { buildSections } from "../catalog/sections";
import { ItemQtyModal } from "../components/ItemQtyModal";
import type { Tables } from "../lib/database.types";
import { confirmAction } from "../ui/confirm";
import { useNow } from "../lib/useNow";
import { useOnline } from "../lib/useOnline";
import { loadMovements, saveCount } from "./api";
import { loadCountDraft, storeCountDraft } from "./countDraft";
import {
  checkedSince,
  countDiffs,
  stockByItem,
  totalQty,
  voidedIds,
  type CountDiff,
} from "./ledger";
import {
  formatQty,
  formatStockQty,
  OPEN_CASE_SIZE,
  parseQty,
  round4,
} from "./qty";

type Props = {
  branchId: string;
  onDone: () => void;
};

type SectionData = {
  group: Tables<"item_groups">;
  data: Tables<"items">[];
};

export function CountScreen({ branchId, onDone }: Props) {
  const online = useOnline();
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // chống bấm đôi trước khi state kịp cập nhật
  const [saveError, setSaveError] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<CountDiff[] | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Nháp trên máy: số đang gõ sống sót khi app bị đứng/tắt. Chỉ ghi sau khi đã thử khôi phục.
  const draftReady = useRef(false);
  const [restored, setRestored] = useState(false);
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  useEffect(() => {
    let alive = true;
    void loadCountDraft(branchId).then((d) => {
      if (!alive) return;
      if (d) {
        setInputs((cur) => ({ ...d, ...cur })); // số vừa gõ thắng nháp cũ
        setRestored(true);
      }
      draftReady.current = true;
    });
    return () => {
      alive = false;
      if (draftReady.current) void storeCountDraft(branchId, inputsRef.current);
    };
  }, [branchId]);
  useEffect(() => {
    if (!draftReady.current) return;
    const t = setTimeout(() => {
      if (draftReady.current) void storeCountDraft(branchId, inputs); // đã lưu vào sổ thì không ghi lại
    }, 400);
    return () => clearTimeout(t);
  }, [inputs, branchId]);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const [catalog, movs] = await Promise.all([
        loadCatalog(branchId),
        loadMovements(branchId),
      ]);
      setGroups(catalog.groups);
      setItems(catalog.items);
      setMovements(movs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    void fetchData();
  }, [fetchData]);

  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);
  const now = useNow();
  const checked = useMemo(() => checkedSince(movements, now), [movements, now]);

  const itemsById = useMemo(() => {
    const map = new Map<string, Tables<"items">>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }, [items]);

  const sections = useMemo<SectionData[]>(() => {
    return buildSections(groups, items, { query, showHidden: false }).map(
      (s) => ({
        group: s.group,
        data: s.items,
      })
    );
  }, [groups, items, query]);

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    const parsedValues: Record<string, number> = {};
    const rows: {
      item_id: string;
      qty: number;
      expected_qty: number;
      qty_text: string | null;
    }[] = [];

    for (const item of items) {
      if (item.is_hidden) continue;
      const raw = inputs[item.id] ?? "";
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const parsed = parseQty(trimmed, {
        caseSize: item.case_size,
        byPercent: item.record_by_percent,
      });
      if (!parsed.ok) {
        errors[item.id] = parsed.error;
      } else {
        parsedValues[item.id] = parsed.value;
        const lots = lotsByItem.get(item.id);
        const expected = lots ? totalQty(lots) : 0;
        rows.push({
          item_id: item.id,
          qty: parsed.value,
          expected_qty: expected,
          qty_text: trimmed.length <= 40 ? trimmed : null,
        });
      }
    }

    return {
      errors,
      parsedValues,
      rows,
      hasError: Object.keys(errors).length > 0,
    };
  }, [inputs, items, lotsByItem]);

  async function handleSave() {
    if (
      !online ||
      savingRef.current ||
      validation.rows.length === 0 ||
      validation.hasError
    ) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);

    // expected_qty lấy từ sổ mới nhất (máy khác có thể vừa ghi), không từ bản tải lúc mở màn.
    let rows = validation.rows;
    try {
      const latest = stockByItem(await loadMovements(branchId));
      rows = rows.map((r) => ({
        ...r,
        expected_qty: totalQty(latest.get(r.item_id) ?? []),
      }));
    } catch {
      setSaveError("Không lưu được. Kiểm tra mạng.");
      savingRef.current = false;
      setSaving(false);
      return;
    }

    const { batchId, error: err } = await saveCount(branchId, rows);
    if (err) {
      setSaveError(err);
      savingRef.current = false;
      setSaving(false);
      return;
    }

    void storeCountDraft(branchId, {}); // đã vào sổ: bỏ nháp
    draftReady.current = false; // chặn cleanup/timer ghi lại nháp cũ
    try {
      const fresh = await loadMovements(branchId);
      setMovements(fresh); // nhãn Chưa kiểm cập nhật ngay sau khi lưu
      setDiffs(countDiffs(fresh, batchId));
    } catch {
      // Đã lưu nhưng tải lại lỗi: tính lệch từ chính các dòng vừa lưu, không báo "không lệch" sai.
      setDiffs(
        rows
          .filter((r) => r.qty !== r.expected_qty)
          .map((r) => ({
            item_id: r.item_id,
            expected: r.expected_qty,
            actual: r.qty,
            diff: round4(r.qty - r.expected_qty),
          }))
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Lần Kiểm kho gần nhất (dòng count chưa bị hủy có batch_id, seq lớn nhất) để xem lại món lệch.
  const latestBatchId = useMemo(() => {
    const voided = voidedIds(movements);
    let best: { seq: number; id: string } | null = null;
    for (const m of movements) {
      if (
        m.kind === "count" &&
        !voided.has(m.id) &&
        m.batch_id &&
        (!best || m.seq > best.seq)
      ) {
        best = { seq: m.seq, id: m.batch_id };
      }
    }
    return best?.id ?? null;
  }, [movements]);

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
        <Text style={styles.error}>
          Không tải được dữ liệu Kiểm kho. Kiểm tra mạng.
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            setLoading(true);
            void fetchData();
          }}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  if (diffs !== null) {
    return (
      <ScrollView contentContainerStyle={styles.diffContainer}>
        <Text style={styles.diffTitle}>Món lệch sau Kiểm kho</Text>
        {diffs.length === 0 ? (
          <Text style={styles.emptyText}>Không có món nào lệch</Text>
        ) : (
          diffs.map((d) => {
            const item = itemsById.get(d.item_id);
            const opts = {
              caseSize: item?.case_size ?? null,
              unit: item?.unit ?? "",
              byPercent: item?.record_by_percent ?? false,
              splitCases: false,
            };
            const expectedText = formatQty(d.expected, opts);
            const actualText = formatQty(d.actual, opts);
            const absDiffText = formatQty(Math.abs(d.diff), opts);
            const sign = d.diff > 0 ? "+" : "−";
            return (
              <View key={d.item_id} style={styles.diffRow}>
                <Text style={styles.diffLine}>
                  {item?.name ?? d.item_id}: sổ ghi {expectedText} → đếm{" "}
                  {actualText} (lệch {sign}
                  {absDiffText})
                </Text>
              </View>
            );
          })
        )}
        <Pressable
          style={styles.primaryButton}
          onPress={onDone}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Xong</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const saveDisabled =
    !online || saving || validation.rows.length === 0 || validation.hasError;

  const editingItem = editingItemId
    ? (itemsById.get(editingItemId) ?? null)
    : null;
  const editingQty = editingItem
    ? validation.parsedValues[editingItem.id]
    : undefined;
  const editingError = editingItem
    ? (validation.errors[editingItem.id] ?? null)
    : null;
  const editingPreview =
    editingItem && editingQty !== undefined && !editingError
      ? `= ${formatStockQty(editingItem, editingQty, inputs[editingItem.id])}`
      : null;

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm món (gõ không dấu được)"
          value={query}
          onChangeText={setQuery}
        />
        {latestBatchId && (
          <Pressable
            style={styles.linkButton}
            onPress={() => setDiffs(countDiffs(movements, latestBatchId))}
            accessibilityRole="button"
          >
            <Text style={styles.link}>
              Xem món lệch của lần Kiểm kho gần nhất
            </Text>
          </Pressable>
        )}
        {restored && (
          <Pressable
            style={styles.linkButton}
            onPress={() =>
              confirmAction({
                title: "Xóa số đang gõ dở?",
                message: "Các số chưa lưu trên màn này sẽ mất.",
                confirmText: "Xóa",
                destructive: true,
                onConfirm: () => {
                  setInputs({});
                  setRestored(false);
                  void storeCountDraft(branchId, {});
                },
              })
            }
            accessibilityRole="button"
          >
            <Text style={styles.link}>
              Đã khôi phục số đang gõ dở (chưa lưu). Bấm để xóa hết.
            </Text>
          </Pressable>
        )}
        {!online && <Text style={styles.error}>Mất mạng — không lưu được</Text>}
        {saveError && <Text style={styles.error}>{saveError}</Text>}
      </View>

      <SectionList<Tables<"items">, SectionData>
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {section.group.name}
              {section.group.name_zh ? ` (${section.group.name_zh})` : ""}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const parsedQty = validation.parsedValues[item.id];
          const fieldError = validation.errors[item.id];
          return (
            <Pressable
              style={styles.itemRow}
              onPress={() => setEditingItemId(item.id)}
              accessibilityRole="button"
            >
              <Text style={styles.itemName}>
                {item.name}
                {item.name_zh ? ` · ${item.name_zh}` : ""}
              </Text>
              {!item.skip_count && !checked.has(item.id) && (
                <Text style={styles.uncheckedTag}>Chưa kiểm</Text>
              )}
              <Text style={styles.itemMeta}>
                Đơn vị tính: {item.unit}
                {item.case_size !== null
                  ? item.case_size === OPEN_CASE_SIZE
                    ? ` · Thùng và ${item.unit.toLowerCase()} đếm riêng (ví dụ: 1T+28)`
                    : ` · Quy cách thùng: ${item.case_size} (ví dụ: 1T+3)`
                  : ""}
                {item.record_by_percent ? " · Ghi theo %" : ""}
              </Text>
              {parsedQty !== undefined && (
                <Text style={styles.summaryText}>
                  Đã đếm: {formatStockQty(item, parsedQty, inputs[item.id])}
                </Text>
              )}
              {fieldError && (
                <Text style={styles.fieldError}>{fieldError}</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>Không có món phù hợp.</Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryButton, saveDisabled && styles.buttonDisabled]}
          disabled={saveDisabled}
          onPress={handleSave}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>
            {saving ? "Đang lưu…" : "Lưu Kiểm kho"}
          </Text>
        </Pressable>
      </View>

      <ItemQtyModal
        visible={editingItem !== null}
        title={
          editingItem
            ? `${editingItem.name}${editingItem.name_zh ? ` · ${editingItem.name_zh}` : ""}`
            : ""
        }
        info={editingItem ? [`Đơn vị tính: ${editingItem.unit}`] : []}
        label="Số đếm được"
        placeholder={
          editingItem?.case_size !== null
            ? "gõ được 1T+3"
            : "bỏ trống nếu không đếm"
        }
        value={editingItem ? (inputs[editingItem.id] ?? "") : ""}
        error={editingError}
        preview={editingPreview}
        onChangeText={(text) => {
          if (!editingItem) return;
          setInputs((prev) => ({ ...prev, [editingItem.id]: text }));
        }}
        onDone={() => setEditingItemId(null)}
        onReset={() => {
          if (editingItem) {
            const id = editingItem.id;
            setInputs((prev) => {
              const next = { ...prev };
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
  linkButton: { minHeight: 44, justifyContent: "center" },
  link: { color: c.accentDeep, fontSize: 15, fontWeight: "600" },
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
    borderBottomColor: c.line,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: c.surface,
  },
  listContent: { paddingBottom: 24 },
  sectionHeader: {
    backgroundColor: c.accentSoft,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: c.accentDeep },
  itemRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.accentSoft,
    backgroundColor: c.surface,
    gap: 6,
  },
  uncheckedTag: { fontSize: 12, fontWeight: "700", color: c.amber },
  itemName: { fontSize: 16, fontWeight: "600", color: c.ink },
  itemMeta: { fontSize: 13, color: c.muted },
  summaryText: { fontSize: 13, color: c.accentDeep, fontWeight: "600" },
  fieldError: { color: c.red, fontSize: 14 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.surface,
  },
  primaryButton: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
  error: { color: c.red, textAlign: "center", fontSize: 15 },
  emptyText: { color: c.muted, textAlign: "center", fontSize: 15 },
  diffContainer: { padding: 16, gap: 12 },
  diffTitle: { fontSize: 18, fontWeight: "700", color: c.ink },
  diffRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.accentSoft,
  },
  diffLine: { fontSize: 15, color: c.ink },
}));

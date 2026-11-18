import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { loadCatalog } from "../catalog/api";
import { buildSections } from "../catalog/sections";
import type { Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import { loadMovements, saveCount } from "./api";
import { countDiffs, stockByItem, totalQty, type CountDiff } from "./ledger";
import { formatQty, parseQty, round4 } from "./qty";

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
    const rows: { item_id: string; qty: number; expected_qty: number }[] = [];

    for (const item of items) {
      if (item.is_hidden) continue;
      const raw = inputs[item.id] ?? "";
      if (!raw.trim()) continue;
      const parsed = parseQty(raw, {
        caseSize: item.case_size,
        byPercent: item.record_by_percent,
      });
      if (!parsed.ok) {
        errors[item.id] = parsed.error;
      } else {
        const lots = lotsByItem.get(item.id);
        const expected = lots ? totalQty(lots) : 0;
        rows.push({
          item_id: item.id,
          qty: parsed.value,
          expected_qty: expected,
        });
      }
    }

    return {
      errors,
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

    try {
      const fresh = await loadMovements(branchId);
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

  // Lần Kiểm kho gần nhất (dòng count có batch_id, seq lớn nhất) để xem lại món lệch.
  const latestBatchId = useMemo(() => {
    let best: { seq: number; id: string } | null = null;
    for (const m of movements) {
      if (m.kind === "count" && m.batch_id && (!best || m.seq > best.seq)) {
        best = { seq: m.seq, id: m.batch_id };
      }
    }
    return best?.id ?? null;
  }, [movements]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
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
          const val = inputs[item.id] ?? "";
          const fieldError = validation.errors[item.id];
          return (
            <View style={styles.itemRow}>
              <Text style={styles.itemName}>
                {item.name}
                {item.name_zh ? ` · ${item.name_zh}` : ""}
              </Text>
              <Text style={styles.itemMeta}>
                Đơn vị tính: {item.unit}
                {item.case_size !== null
                  ? ` · Quy cách thùng: ${item.case_size} (ví dụ: 1T+3)`
                  : ""}
                {item.record_by_percent ? " · Ghi theo %" : ""}
              </Text>
              <TextInput
                style={styles.qtyInput}
                placeholder="bỏ trống nếu không đếm"
                value={val}
                onChangeText={(text) =>
                  setInputs((prev) => ({ ...prev, [item.id]: text }))
                }
              />
              {fieldError && (
                <Text style={styles.fieldError}>{fieldError}</Text>
              )}
            </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  linkButton: { minHeight: 44, justifyContent: "center" },
  link: { color: "#0f766e", fontSize: 15, fontWeight: "600" },
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
  searchInput: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  listContent: { paddingBottom: 24 },
  sectionHeader: {
    backgroundColor: "#f4f4f5",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#0f766e" },
  itemRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
    backgroundColor: "#fff",
    gap: 6,
  },
  itemName: { fontSize: 16, fontWeight: "600", color: "#18181b" },
  itemMeta: { fontSize: 13, color: "#52525b" },
  qtyInput: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  fieldError: { color: "#b91c1c", fontSize: 14 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    backgroundColor: "#fff",
  },
  primaryButton: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { color: "#b91c1c", textAlign: "center", fontSize: 15 },
  emptyText: { color: "#52525b", textAlign: "center", fontSize: 15 },
  diffContainer: { padding: 16, gap: 12 },
  diffTitle: { fontSize: 18, fontWeight: "700", color: "#18181b" },
  diffRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
  },
  diffLine: { fontSize: 15, color: "#18181b" },
});

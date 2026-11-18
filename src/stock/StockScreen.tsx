import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { loadCatalog, subscribeCatalog } from "../catalog/api";
import { buildSections } from "../catalog/sections";
import type { Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import {
  assignMfg,
  loadMovements,
  saveAdjust,
  subscribeMovements,
} from "./api";
import { formatDate, parseShortDate } from "./date";
import { loadOrders, subscribeOrders } from "../orders/api";
import { incomingByItem, projectedQty } from "../orders/orders";
import { loadReceivingData, subscribeReceiving } from "../orders/receivingApi";
import { stockByItem, totalQty, type Lot } from "./ledger";
import { formatQty, parseAdjust, parseQty } from "./qty";

type Props = {
  branchId: string;
};

type SectionData = {
  group: Tables<"item_groups">;
  data: Tables<"items">[];
};

function round4(n: number): number {
  const rounded = Math.round(n * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

function toEditableQty(
  qty: number,
  caseSize: number | null,
  byPercent: boolean
): string {
  const q = round4(qty);
  if (q <= 0) return "0";

  const formatRest = (rest: number): string => {
    const r = round4(rest);
    if (byPercent) {
      const whole = Math.floor(r);
      const frac = round4(r - whole);
      if (frac > 0) {
        const pct = String(round4(frac * 100)).replace(".", ",");
        return whole > 0 ? `${whole}+${pct}%` : `${pct}%`;
      }
      return String(whole);
    }
    return String(r).replace(".", ",");
  };

  if (caseSize !== null && caseSize > 0 && q >= caseSize) {
    const cases = Math.floor((q + 1e-9) / caseSize);
    const rest = Math.max(0, round4(q - cases * caseSize));
    return rest === 0 ? `${cases}T` : `${cases}T+${formatRest(rest)}`;
  }

  return formatRest(q);
}

const enteredLabel = (lot: Lot) =>
  lot.enteredOn ? ` (vào kho ${formatDate(lot.enteredOn)})` : "";

export function StockScreen({ branchId }: Props) {
  const online = useOnline();
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [incoming, setIncoming] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  const [selectedItem, setSelectedItem] = useState<Tables<"items"> | null>(
    null
  );
  const busy = useRef(false); // chống bấm đôi trước khi state kịp cập nhật
  const [mode, setMode] = useState<"adjust" | "mfg">("adjust");
  const [adjustInput, setAdjustInput] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [savingAdjust, setSavingAdjust] = useState(false);

  const [mfgChunk, setMfgChunk] = useState<string | null>(null);
  const [mfgQtyInput, setMfgQtyInput] = useState("");
  const [mfgQtyError, setMfgQtyError] = useState<string | null>(null);
  const [mfgDateInput, setMfgDateInput] = useState("");
  const [mfgDateError, setMfgDateError] = useState<string | null>(null);
  const [savingMfg, setSavingMfg] = useState(false);

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
      setIncoming(incomingByItem(ord.orders, ord.lines, rec.receivedLineIds));
      setGroups(catalog.groups);
      setItems(catalog.items);
      setMovements(movs);
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
    const scheduleReload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void fetchData(), 300);
    };
    const unsubCatalog = subscribeCatalog(branchId, scheduleReload);
    const unsubMovements = subscribeMovements(branchId, scheduleReload);
    const unsubOrders = subscribeOrders(branchId, scheduleReload);
    const unsubReceiving = subscribeReceiving(branchId, scheduleReload);
    return () => {
      clearTimeout(timer);
      unsubCatalog();
      unsubMovements();
      unsubOrders();
      unsubReceiving();
    };
  }, [branchId, fetchData]);

  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);

  const sections = useMemo<SectionData[]>(() => {
    return buildSections(groups, items, { query, showHidden: false }).map(
      (s) => ({
        group: s.group,
        data: s.items,
      })
    );
  }, [groups, items, query]);

  const selectedLots: Lot[] = useMemo(() => {
    if (!selectedItem) return [];
    return lotsByItem.get(selectedItem.id) ?? [];
  }, [lotsByItem, selectedItem]);

  // Phần chưa có Ngày sản xuất, mỗi phần là một đợt vào kho; Thêm Ngày sản xuất cho từng đợt.
  const undatedLots = useMemo(
    () => selectedLots.filter((l) => l.mfgDate === null && l.qty > 0),
    [selectedLots]
  );
  const unassignedLot =
    undatedLots.find((l) => l.enteredOn === mfgChunk) ?? undatedLots[0] ?? null;

  // Gõ "+2" / "-1" thì hiện số sau khi lưu để người dùng chắc chắn trước khi bấm.
  const adjustPreview = useMemo(() => {
    if (!selectedItem || !/^[+\-−]/.test(adjustInput.trim())) return null;
    const opts = {
      caseSize: selectedItem.case_size,
      byPercent: selectedItem.record_by_percent,
    };
    const r = parseAdjust(adjustInput, totalQty(selectedLots), opts);
    return r.ok
      ? formatQty(r.value, { ...opts, unit: selectedItem.unit })
      : null;
  }, [adjustInput, selectedItem, selectedLots]);

  const parsedDatePreview = useMemo(() => {
    if (!mfgDateInput.trim()) return null;
    return parseShortDate(mfgDateInput, new Date());
  }, [mfgDateInput]);

  function openItem(item: Tables<"items">) {
    const lots = lotsByItem.get(item.id) ?? [];
    const unallocated = lots.find((l) => l.mfgDate === null && l.qty > 0);
    setSelectedItem(item);
    setMfgChunk(unallocated?.enteredOn ?? null);
    setMode("adjust");
    setAdjustInput("");
    setAdjustNote("");
    setAdjustError(null);
    setMfgQtyInput(
      unallocated
        ? toEditableQty(unallocated.qty, item.case_size, item.record_by_percent)
        : ""
    );
    setMfgQtyError(null);
    setMfgDateInput("");
    setMfgDateError(null);
  }

  async function handleSaveAdjust() {
    if (!selectedItem || !online || busy.current) return;
    busy.current = true;
    setSavingAdjust(true);
    setAdjustError(null);
    // Số hiện có lấy từ sổ mới nhất (máy khác có thể vừa ghi), để +x / -x và "lệch" không dựa trên bản cũ.
    let expected: number;
    try {
      const latest = stockByItem(await loadMovements(branchId));
      expected = totalQty(latest.get(selectedItem.id) ?? []);
    } catch {
      busy.current = false;
      setSavingAdjust(false);
      setAdjustError("Không lưu được. Kiểm tra mạng.");
      return;
    }
    const parsed = parseAdjust(adjustInput, expected, {
      caseSize: selectedItem.case_size,
      byPercent: selectedItem.record_by_percent,
    });
    if (!parsed.ok || parsed.value === expected) {
      busy.current = false;
      setSavingAdjust(false);
      setAdjustError(parsed.ok ? "Số lượng không đổi" : parsed.error);
      return;
    }
    const { error: err } = await saveAdjust(
      branchId,
      selectedItem.id,
      parsed.value,
      expected,
      adjustNote || null
    );
    busy.current = false;
    setSavingAdjust(false);
    if (err) {
      setAdjustError(err);
      return;
    }
    setSelectedItem(null);
    void fetchData();
  }

  async function handleAssignMfg() {
    if (!selectedItem || !unassignedLot || !online || busy.current) return;
    const parsedQty = parseQty(mfgQtyInput, {
      caseSize: selectedItem.case_size,
      byPercent: selectedItem.record_by_percent,
    });
    const parsedDate = parseShortDate(mfgDateInput, new Date());

    let hasErr = false;
    if (!parsedQty.ok) {
      setMfgQtyError(parsedQty.error);
      hasErr = true;
    } else if (parsedQty.value <= 0) {
      setMfgQtyError("Số lượng không hợp lệ");
      hasErr = true;
    } else if (parsedQty.value > unassignedLot.qty) {
      setMfgQtyError(
        `Đợt này chỉ còn ${formatQty(unassignedLot.qty, {
          caseSize: selectedItem.case_size,
          unit: selectedItem.unit,
          byPercent: selectedItem.record_by_percent,
        })} chưa có Ngày sản xuất`
      );
      hasErr = true;
    } else {
      setMfgQtyError(null);
    }

    if (!parsedDate.ok) {
      setMfgDateError(parsedDate.error);
      hasErr = true;
    } else {
      setMfgDateError(null);
    }

    if (hasErr || !parsedQty.ok || !parsedDate.ok) return;

    busy.current = true;
    setSavingMfg(true);
    const { error: err } = await assignMfg(
      branchId,
      selectedItem.id,
      parsedQty.value,
      parsedDate.value,
      unassignedLot.enteredOn ?? null
    );
    busy.current = false;
    setSavingMfg(false);
    if (err) {
      setMfgDateError(err);
      return;
    }
    setSelectedItem(null);
    void fetchData();
  }

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
          Không tải được dữ liệu Tồn kho thực tế. Kiểm tra mạng.
        </Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => {
            setLoading(true);
            void fetchData();
          }}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm món (gõ không dấu được)"
          value={query}
          onChangeText={setQuery}
        />
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
          const lots = lotsByItem.get(item.id);
          const qtyOpts = {
            caseSize: item.case_size,
            unit: item.unit,
            byPercent: item.record_by_percent,
          };
          const headerLine = lots
            ? `${item.name} — ${formatQty(totalQty(lots), qtyOpts)}`
            : `${item.name} — Chưa kiểm`;
          const coming = incoming.get(item.id) ?? 0;

          return (
            <Pressable
              style={styles.itemRow}
              onPress={() => openItem(item)}
              accessibilityRole="button"
            >
              <Text style={styles.itemTitle}>{headerLine}</Text>
              {coming > 0 && (
                <Text style={styles.lotLine}>
                  Hàng đang về: {formatQty(coming, qtyOpts)} · Tồn kho dự tính:{" "}
                  {formatQty(
                    projectedQty(totalQty(lots ?? []), coming),
                    qtyOpts
                  )}
                </Text>
              )}
              {lots &&
                lots.map((lot, idx) => (
                  <Text
                    key={`${lot.mfgDate ?? lot.enteredOn ?? "none"}-${idx}`}
                    style={styles.lotLine}
                  >
                    {lot.mfgDate
                      ? `Ngày sản xuất ${formatDate(lot.mfgDate)}: ${formatQty(
                          lot.qty,
                          qtyOpts
                        )}`
                      : `Chưa có Ngày sản xuất${enteredLabel(lot)}: ${formatQty(lot.qty, qtyOpts)}`}
                  </Text>
                ))}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>Không có món phù hợp.</Text>
          </View>
        }
      />

      <Modal
        visible={selectedItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {selectedItem && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{selectedItem.name}</Text>
                    <Pressable
                      style={styles.closeButton}
                      onPress={() => setSelectedItem(null)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.closeText}>Đóng</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.metaText}>
                    Đơn vị tính: {selectedItem.unit}
                    {selectedItem.case_size !== null
                      ? ` · Quy cách thùng: ${selectedItem.case_size}`
                      : ""}
                    {selectedItem.record_by_percent ? " · Ghi theo %" : ""}
                  </Text>

                  {!online && (
                    <Text style={styles.offlineText}>
                      Mất mạng — không lưu được
                    </Text>
                  )}

                  <View style={styles.cardSection}>
                    <Text style={styles.sectionHeading}>
                      Tồn kho thực tế:{" "}
                      {formatQty(totalQty(selectedLots), {
                        caseSize: selectedItem.case_size,
                        unit: selectedItem.unit,
                        byPercent: selectedItem.record_by_percent,
                      })}
                    </Text>
                    {selectedLots.map((lot) => (
                      <Text
                        key={lot.mfgDate ?? `none-${lot.enteredOn}`}
                        style={styles.metaText}
                      >
                        {lot.mfgDate
                          ? `Ngày sản xuất ${formatDate(lot.mfgDate)}`
                          : `Chưa có Ngày sản xuất${enteredLabel(lot)}`}
                        :{" "}
                        {formatQty(lot.qty, {
                          caseSize: selectedItem.case_size,
                          unit: selectedItem.unit,
                          byPercent: selectedItem.record_by_percent,
                        })}
                      </Text>
                    ))}
                  </View>

                  <View style={styles.tabRow}>
                    {(
                      [
                        ["adjust", "Điều chỉnh tồn kho"],
                        ["mfg", "Thêm Ngày sản xuất"],
                      ] as const
                    ).map(([key, label]) => {
                      const selected = mode === key;
                      return (
                        <Pressable
                          key={key}
                          style={[styles.tab, selected && styles.tabSelected]}
                          onPress={() => setMode(key)}
                          accessibilityRole="tab"
                          accessibilityState={{ selected }}
                        >
                          <Text
                            style={[
                              styles.tabText,
                              selected && styles.tabTextSelected,
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {mode === "adjust" && (
                    <View style={styles.cardSection}>
                      <Text style={styles.metaText}>
                        Nhập Tồn kho thực tế mới, hoặc gõ +2 / -1 để cộng trừ
                        vào số đang có. Ngày sản xuất đã nhập được giữ: phần
                        tăng vào "Chưa có Ngày sản xuất", phần giảm trừ Lô cũ
                        nhất trước.
                      </Text>
                      <TextInput
                        style={styles.input}
                        placeholder={
                          selectedItem.case_size !== null
                            ? "Ví dụ: 15, 1T+3, +2 hoặc -1"
                            : selectedItem.record_by_percent
                              ? "Ví dụ: 2+95%, +1 hoặc -50%"
                              : "Ví dụ: 15, +2 hoặc -1"
                        }
                        value={adjustInput}
                        onChangeText={(t) => {
                          setAdjustInput(t);
                          setAdjustError(null);
                        }}
                      />
                      {adjustPreview && (
                        <Text style={styles.datePreview}>
                          Sau khi lưu: {adjustPreview}
                        </Text>
                      )}
                      {adjustError && (
                        <Text style={styles.fieldError}>{adjustError}</Text>
                      )}
                      <TextInput
                        style={styles.input}
                        placeholder="Lý do (không bắt buộc)"
                        value={adjustNote}
                        onChangeText={setAdjustNote}
                      />
                      <Pressable
                        style={[
                          styles.saveButton,
                          (!online || savingAdjust) && styles.buttonDisabled,
                        ]}
                        disabled={!online || savingAdjust}
                        onPress={handleSaveAdjust}
                        accessibilityRole="button"
                      >
                        <Text style={styles.saveButtonText}>
                          {savingAdjust ? "Đang lưu…" : "Lưu điều chỉnh"}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {mode === "mfg" && !unassignedLot && (
                    <Text style={styles.metaText}>
                      Toàn bộ Tồn kho thực tế đã có Ngày sản xuất.
                    </Text>
                  )}

                  {mode === "mfg" && unassignedLot && (
                    <View style={styles.cardSection}>
                      <Text style={styles.metaText}>
                        Chọn đợt hàng chưa có Ngày sản xuất:
                      </Text>
                      <View style={styles.chipRow}>
                        {undatedLots.map((lot) => {
                          const selected = lot === unassignedLot;
                          return (
                            <Pressable
                              key={lot.enteredOn ?? "none"}
                              style={[
                                styles.chip,
                                selected && styles.tabSelected,
                              ]}
                              onPress={() => {
                                setMfgChunk(lot.enteredOn ?? null);
                                setMfgQtyInput(
                                  toEditableQty(
                                    lot.qty,
                                    selectedItem.case_size,
                                    selectedItem.record_by_percent
                                  )
                                );
                                setMfgQtyError(null);
                              }}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                            >
                              <Text
                                style={[
                                  styles.tabText,
                                  selected && styles.tabTextSelected,
                                ]}
                              >
                                {formatQty(lot.qty, {
                                  caseSize: selectedItem.case_size,
                                  unit: selectedItem.unit,
                                  byPercent: selectedItem.record_by_percent,
                                })}
                                {lot.enteredOn
                                  ? ` — vào kho ${formatDate(lot.enteredOn)}`
                                  : ""}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Số lượng"
                        value={mfgQtyInput}
                        onChangeText={(t) => {
                          setMfgQtyInput(t);
                          setMfgQtyError(null);
                        }}
                      />
                      {mfgQtyError && (
                        <Text style={styles.fieldError}>{mfgQtyError}</Text>
                      )}
                      <TextInput
                        style={styles.input}
                        placeholder="Ngày sản xuất (ví dụ: 28 hoặc 28/10)"
                        value={mfgDateInput}
                        onChangeText={(t) => {
                          setMfgDateInput(t);
                          setMfgDateError(null);
                        }}
                      />
                      {parsedDatePreview && parsedDatePreview.ok && (
                        <Text style={styles.datePreview}>
                          Ngày sản xuất: {formatDate(parsedDatePreview.value)}
                        </Text>
                      )}
                      {mfgDateError && (
                        <Text style={styles.fieldError}>{mfgDateError}</Text>
                      )}
                      <Pressable
                        style={[
                          styles.saveButton,
                          (!online || savingMfg) && styles.buttonDisabled,
                        ]}
                        disabled={!online || savingMfg}
                        onPress={handleAssignMfg}
                        accessibilityRole="button"
                      >
                        <Text style={styles.saveButtonText}>
                          {savingMfg ? "Đang lưu…" : "Lưu Ngày sản xuất"}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  listContent: { paddingBottom: 32 },
  sectionHeader: {
    backgroundColor: "#f4f4f5",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#0f766e" },
  tabRow: { flexDirection: "row", gap: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  tabSelected: { backgroundColor: "#0f766e" },
  tabText: { color: "#0f766e", fontWeight: "600", textAlign: "center" },
  tabTextSelected: { color: "#fff" },
  itemRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
    backgroundColor: "#fff",
    gap: 4,
  },
  itemTitle: { fontSize: 16, fontWeight: "600", color: "#18181b" },
  lotLine: { fontSize: 14, color: "#52525b", paddingLeft: 8 },
  error: { color: "#b91c1c", textAlign: "center", fontSize: 15 },
  retryButton: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  emptyText: { color: "#52525b", textAlign: "center", fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    maxHeight: "90%",
    width: "100%",
  },
  modalContent: { padding: 16, gap: 14 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#18181b", flex: 1 },
  closeButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  closeText: { color: "#0f766e", fontSize: 16, fontWeight: "600" },
  metaText: { fontSize: 14, color: "#52525b" },
  offlineText: { color: "#b91c1c", fontSize: 14, fontWeight: "600" },
  cardSection: {
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 12,
    gap: 8,
  },
  sectionHeading: { fontSize: 16, fontWeight: "700", color: "#18181b" },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  fieldError: { color: "#b91c1c", fontSize: 14 },
  datePreview: { color: "#0f766e", fontSize: 14, fontWeight: "600" },
  saveButton: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  buttonDisabled: { opacity: 0.5 },
  saveButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});

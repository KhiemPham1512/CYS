import { SCRIM } from "../ui/overlay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "../lib/debounce";
import {
  Modal,
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
import { loadCatalog, subscribeCatalog } from "../catalog/api";
import { buildSections } from "../catalog/sections";
import type { Tables } from "../lib/database.types";
import { useNow } from "../lib/useNow";
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
import {
  checkedSince,
  localDate,
  stockByItem,
  totalQty,
  type Lot,
} from "./ledger";
import { expiredLots, formatDayMonth, formatMfg, usesMfgDate } from "./expiry";
import { ReturnDamagedPanel } from "./ReturnDamagedPanel";
import { filterByFlag, stockSummary, type StockFlag } from "./summary";
import { formatQty, formatSheetQty, parseAdjust, parseQty } from "./qty";

type Props = {
  branchId: string;
};

type SectionData = {
  group: Tables<"item_groups">;
  data: Tables<"items">[];
};

const enteredLabel = (lot: Lot) =>
  lot.enteredOn ? ` (vào kho ${formatDayMonth(lot.enteredOn)})` : "";

export function StockScreen({ branchId }: Props) {
  const online = useOnline();
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [incoming, setIncoming] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [flag, setFlag] = useState<StockFlag | null>(null); // chip tóm tắt đang bấm để lọc

  const [selectedItem, setSelectedItem] = useState<Tables<"items"> | null>(
    null
  );
  const busy = useRef(false); // chống bấm đôi trước khi state kịp cập nhật
  const [mode, setMode] = useState<"adjust" | "mfg" | "return">("adjust");
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
    const scheduleReload = debounce(() => void fetchData());
    const unsubCatalog = subscribeCatalog(branchId, scheduleReload);
    const unsubMovements = subscribeMovements(branchId, scheduleReload);
    const unsubOrders = subscribeOrders(branchId, scheduleReload);
    const unsubReceiving = subscribeReceiving(branchId, scheduleReload);
    return () => {
      scheduleReload.cancel();
      unsubCatalog();
      unsubMovements();
      unsubOrders();
      unsubReceiving();
    };
  }, [branchId, fetchData]);

  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);
  const now = useNow();
  const today = localDate(now);
  const checked = useMemo(() => checkedSince(movements, now), [movements, now]);

  // Tóm tắt tính trên mọi món đang hiện (không phụ thuộc ô tìm), bấm chip để lọc.
  const summary = useMemo(() => {
    const visible = buildSections(groups, items, {
      query: "",
      showHidden: false,
    }).flatMap((s) => s.items);
    return stockSummary({
      items: visible,
      lotsByItem,
      checked,
      incoming,
      today,
    });
  }, [groups, items, lotsByItem, checked, incoming, today]);

  const sections = useMemo<SectionData[]>(() => {
    return buildSections(groups, items, { query, showHidden: false })
      .map((s) => ({
        group: s.group,
        data: filterByFlag(s.items, summary, flag),
      }))
      .filter((s) => s.data.length > 0);
  }, [groups, items, query, summary, flag]);

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
        ? formatSheetQty(unallocated.qty, {
            caseSize: item.case_size,
            byPercent: item.record_by_percent,
          })
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
        <Loading />
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
        <View style={styles.sumRow}>
          {(
            [
              ["unchecked", "Chưa kiểm", styles.sumAmber, styles.sumAmberOn],
              ["expired", "Quá hạn", styles.sumRed, styles.sumRedOn],
              ["incoming", "Đang về", styles.sumAccent, styles.sumAccentOn],
            ] as const
          ).map(([key, label, base, on]) => {
            const selected = flag === key;
            const n = summary.counts[key];
            return (
              <Pressable
                key={key}
                style={[
                  styles.sumChip,
                  selected ? on : base,
                  n === 0 && !selected && styles.sumChipEmpty,
                ]}
                disabled={n === 0 && !selected}
                onPress={() => setFlag(selected ? null : key)}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${n} món`}
                accessibilityHint="Bấm để lọc danh sách"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.sumNum, selected && styles.sumTextOn]}>
                  {n}
                </Text>
                <Text style={[styles.sumLabel, selected && styles.sumTextOn]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SectionList<Tables<"items">, SectionData>
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {section.group.name.toUpperCase()}
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
          const total = lots ? totalQty(lots) : 0;
          const coming = incoming.get(item.id) ?? 0;
          const expired = expiredLots(lots ?? [], item, today);
          const stripe =
            expired.length > 0
              ? styles.stripeRed
              : !checked.has(item.id)
                ? styles.stripeAmber
                : styles.stripeAccent;

          return (
            <Pressable
              style={styles.card}
              onPress={() => openItem(item)}
              accessibilityRole="button"
              accessibilityLabel={[
                `${item.name}, ${formatQty(total, qtyOpts)}`,
                !checked.has(item.id) ? "chưa kiểm" : null,
                expired.length > 0
                  ? `quá hạn ${formatQty(totalQty(expired), qtyOpts)}`
                  : null,
                coming > 0
                  ? `hàng đang về ${formatQty(coming, qtyOpts)}`
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            >
              <View style={[styles.stripe, stripe]} />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemQty}>
                    {formatQty(total, qtyOpts)}
                  </Text>
                </View>
                {(!checked.has(item.id) ||
                  expired.length > 0 ||
                  coming > 0) && (
                  <View style={styles.pills}>
                    {!checked.has(item.id) && (
                      <Text style={[styles.pill, styles.pillAmber]}>
                        Chưa kiểm
                      </Text>
                    )}
                    {expired.length > 0 && (
                      <Text style={[styles.pill, styles.pillRed]}>
                        Quá hạn: {formatQty(totalQty(expired), qtyOpts)}
                      </Text>
                    )}
                    {coming > 0 && (
                      <Text style={[styles.pill, styles.pillAccent]}>
                        Hàng đang về {formatQty(coming, qtyOpts)}
                      </Text>
                    )}
                  </View>
                )}
                {coming > 0 && (
                  <Text style={styles.lotLine}>
                    Tồn kho dự tính:{" "}
                    {formatQty(projectedQty(total, coming), qtyOpts)}
                  </Text>
                )}
                {lots &&
                  usesMfgDate(item) &&
                  lots.map((lot, idx) => (
                    <Text
                      key={`${lot.mfgDate ?? lot.enteredOn ?? "none"}-${idx}`}
                      style={styles.lotLine}
                    >
                      {lot.mfgDate
                        ? `NSX ${formatMfg(lot.mfgDate, item)}: ${formatQty(
                            lot.qty,
                            qtyOpts
                          )}`
                        : `Chưa có NSX${enteredLabel(lot)}: ${formatQty(lot.qty, qtyOpts)}`}
                    </Text>
                  ))}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {flag
                ? "Không có món nào thuộc loại này."
                : "Không có món phù hợp."}
            </Text>
            {flag && (
              <Pressable
                style={styles.retryButton}
                onPress={() => setFlag(null)}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Bỏ lọc</Text>
              </Pressable>
            )}
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
                    {usesMfgDate(selectedItem) &&
                      selectedLots.map((lot) => (
                        <Text
                          key={lot.mfgDate ?? `none-${lot.enteredOn}`}
                          style={styles.metaText}
                        >
                          {lot.mfgDate
                            ? `NSX ${formatMfg(lot.mfgDate, selectedItem)}`
                            : `Chưa có NSX${enteredLabel(lot)}`}
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
                        ["return", "Trả hàng hư"],
                      ] as const
                    )
                      .filter(
                        ([key]) => key !== "mfg" || usesMfgDate(selectedItem)
                      )
                      .map(([key, label]) => {
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

                  {mode === "return" && (
                    <View style={styles.cardSection}>
                      <ReturnDamagedPanel
                        item={selectedItem}
                        lots={selectedLots}
                        online={online}
                      />
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
                                  formatSheetQty(lot.qty, {
                                    caseSize: selectedItem.case_size,
                                    byPercent: selectedItem.record_by_percent,
                                  })
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
                                  ? ` — vào kho ${formatDayMonth(lot.enteredOn)}`
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
  },
  searchInput: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    backgroundColor: c.surface,
  },
  listContent: { paddingBottom: 130, paddingHorizontal: 16, gap: 8 },
  sectionHeader: { paddingTop: 12, paddingBottom: 2 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    color: c.muted,
  },
  sumRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 10 },
  sumChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  sumChipEmpty: { opacity: 0.45 },
  sumAmber: { backgroundColor: c.amberSoft },
  sumRed: { backgroundColor: c.redSoft },
  sumAccent: { backgroundColor: c.accentSoft },
  sumAmberOn: { backgroundColor: c.amber },
  sumRedOn: { backgroundColor: c.red },
  sumAccentOn: { backgroundColor: c.accentDeep },
  sumNum: { fontSize: 15, fontWeight: "700", color: c.ink },
  sumLabel: { fontSize: 13, fontWeight: "500", color: c.ink },
  sumTextOn: { color: c.onAccent },
  tabRow: { flexDirection: "row", gap: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.accentDeep,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.accentDeep,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  tabSelected: { backgroundColor: c.accentDeep },
  tabText: { color: c.accentDeep, fontWeight: "600", textAlign: "center" },
  tabTextSelected: { color: c.onAccent },
  card: {
    flexDirection: "row",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 56,
  },
  stripe: { width: 4 },
  stripeRed: { backgroundColor: c.red },
  stripeAmber: { backgroundColor: c.amber },
  stripeAccent: { backgroundColor: c.accent },
  cardBody: { flex: 1, padding: 14, gap: 6 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: c.ink },
  itemQty: { fontSize: 16, fontWeight: "700", color: c.accentDeep },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    fontSize: 12,
    fontWeight: "600",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  pillAmber: { backgroundColor: c.amberSoft, color: c.amber },
  pillRed: { backgroundColor: c.redSoft, color: c.red },
  pillAccent: { backgroundColor: c.accentSoft, color: c.accentDeep },
  lotLine: { fontSize: 13, color: c.muted },
  error: { color: c.red, textAlign: "center", fontSize: 15 },
  retryButton: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: { color: c.onAccent, fontSize: 15, fontWeight: "600" },
  emptyText: { color: c.muted, textAlign: "center", fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: SCRIM,
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: c.surface,
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
  modalTitle: { fontSize: 18, fontWeight: "700", color: c.ink, flex: 1 },
  closeButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  closeText: { color: c.accentDeep, fontSize: 16, fontWeight: "600" },
  metaText: { fontSize: 14, color: c.muted },
  offlineText: { color: c.red, fontSize: 14, fontWeight: "600" },
  cardSection: {
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 12,
    gap: 8,
  },
  sectionHeading: { fontSize: 16, fontWeight: "700", color: c.ink },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: c.surface,
  },
  fieldError: { color: c.red, fontSize: 14 },
  datePreview: { color: c.accentDeep, fontSize: 14, fontWeight: "600" },
  saveButton: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  buttonDisabled: { opacity: 0.5 },
  saveButtonText: { color: c.onAccent, fontSize: 15, fontWeight: "600" },
}));

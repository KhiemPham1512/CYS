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
import type { Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import { formatDate, parseShortDate } from "../stock/date";
import { localDate } from "../stock/ledger";
import { formatQty, parseQty } from "../stock/qty";
import {
  loadOrders,
  subscribeOrders,
  type OrderLineRow,
  type OrderRow,
} from "./api";
import { planReceipt, waitingByItem, type OwedRow } from "./receiving";
import {
  loadReceivingData,
  receiveLine,
  settleOwed,
  subscribeReceiving,
} from "./receivingApi";

type Props = { branchId: string };

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
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
  const [owed, setOwed] = useState<OwedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false); // chống bấm đôi trước khi state kịp cập nhật
  const [message, setMessage] = useState<string | null>(null);

  const [receivedInputs, setReceivedInputs] = useState<Record<string, string>>(
    {}
  );
  const [damagedInputs, setDamagedInputs] = useState<Record<string, string>>(
    {}
  );
  const [mfgInputs, setMfgInputs] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string | null>>(
    {}
  );

  const [settleQtyInputs, setSettleQtyInputs] = useState<
    Record<string, string>
  >({});
  const [settleMfgInputs, setSettleMfgInputs] = useState<
    Record<string, string>
  >({});
  const [settleErrors, setSettleErrors] = useState<
    Record<string, string | null>
  >({});

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
      setGroups(catalog.groups);
      setItems(catalog.items);
      setOrders(ord.orders);
      setLines(ord.lines);
      setReceivedLineIds(rec.receivedLineIds);
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
    const unsubOrders = subscribeOrders(branchId, reload);
    const unsubReceiving = subscribeReceiving(branchId, reload);
    return () => {
      clearTimeout(timer);
      unsubOrders();
      unsubReceiving();
    };
  }, [branchId, fetchData]);

  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups]
  );
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  const placedOrders = useMemo(() => {
    return orders
      .filter((o) => o.placed_at !== null)
      .sort((a, b) => (b.placed_at ?? "").localeCompare(a.placed_at ?? ""))
      .map((order) => ({
        order,
        unreceivedLines: lines.filter(
          (l) => l.order_id === order.id && !receivedLineIds.has(l.id)
        ),
      }))
      .filter((entry) => entry.unreceivedLines.length > 0);
  }, [orders, lines, receivedLineIds]);

  const waitingList = useMemo(() => {
    const map = waitingByItem(owed);
    return [...map.entries()].sort(([aId], [bId]) => {
      const aName = itemsById.get(aId)?.name ?? "";
      const bName = itemsById.get(bId)?.name ?? "";
      return aName.localeCompare(bName, "vi");
    });
  }, [owed, itemsById]);

  const fmt = (item: Tables<"items"> | undefined, qty: number) =>
    formatQty(qty, {
      caseSize: item?.case_size ?? null,
      unit: item?.unit ?? "",
      byPercent: item?.record_by_percent ?? false,
    });

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

  async function handleReceive(
    line: OrderLineRow,
    item: Tables<"items"> | undefined,
    full: boolean
  ) {
    if (!online || busy.current) return;
    setMessage(null);
    setLineErrors((p) => ({ ...p, [line.id]: null }));

    const qtyOpts = {
      caseSize: item?.case_size ?? null,
      byPercent: item?.record_by_percent ?? false,
    };

    let received = line.qty;
    if (!full) {
      const rawRec = (receivedInputs[line.id] ?? "").trim();
      if (rawRec) {
        const parsed = parseQty(rawRec, qtyOpts);
        if (!parsed.ok) {
          setLineErrors((p) => ({ ...p, [line.id]: parsed.error }));
          return;
        }
        received = parsed.value;
      }
    }

    let damaged = 0;
    if (!full) {
      const rawDam = (damagedInputs[line.id] ?? "").trim();
      if (rawDam) {
        const parsed = parseQty(rawDam, qtyOpts);
        if (!parsed.ok) {
          setLineErrors((p) => ({ ...p, [line.id]: parsed.error }));
          return;
        }
        damaged = parsed.value;
      }
    }

    let mfgDate: string | null = null;
    const rawMfg = (mfgInputs[line.id] ?? "").trim();
    if (rawMfg) {
      const parsed = parseShortDate(rawMfg, new Date());
      if (!parsed.ok) {
        setLineErrors((p) => ({ ...p, [line.id]: parsed.error }));
        return;
      }
      mfgDate = parsed.value;
    }

    const plan = planReceipt({
      ordered: line.qty,
      received,
      damaged,
      mfgDate,
      tracksMfg: item?.track_mfg_date ?? false,
    });
    if (!plan.ok) {
      setLineErrors((p) => ({ ...p, [line.id]: plan.error }));
      return;
    }

    await runSave(async () => {
      const { error: err } = await receiveLine(
        line.id,
        received,
        damaged,
        plan.mfgDate
      );
      if (err) {
        setLineErrors((p) => ({ ...p, [line.id]: err }));
        return;
      }
      setReceivedInputs((p) => omitKey(p, line.id));
      setDamagedInputs((p) => omitKey(p, line.id));
      setMfgInputs((p) => omitKey(p, line.id));
      setLineErrors((p) => omitKey(p, line.id));
      setMessage(
        `Vào kho ${fmt(item, plan.good)} · Thiếu ${fmt(item, plan.short)} · Hư ${fmt(item, plan.damaged)}`
      );
      await fetchData();
    });
  }

  async function handleSettle(itemId: string, waitingQty: number) {
    if (!online || busy.current) return;
    setMessage(null);
    setSettleErrors((p) => ({ ...p, [itemId]: null }));

    const item = itemsById.get(itemId);
    const qtyOpts = {
      caseSize: item?.case_size ?? null,
      byPercent: item?.record_by_percent ?? false,
    };

    const parsedQty = parseQty(settleQtyInputs[itemId] ?? "", qtyOpts);
    if (!parsedQty.ok) {
      setSettleErrors((p) => ({ ...p, [itemId]: parsedQty.error }));
      return;
    }
    if (parsedQty.value <= 0 || parsedQty.value > waitingQty) {
      setSettleErrors((p) => ({
        ...p,
        [itemId]: "Số lượng nhận bù không hợp lệ",
      }));
      return;
    }

    let mfgDate: string | null = null;
    const rawMfg = (settleMfgInputs[itemId] ?? "").trim();
    if (rawMfg) {
      const parsedDate = parseShortDate(rawMfg, new Date());
      if (!parsedDate.ok) {
        setSettleErrors((p) => ({ ...p, [itemId]: parsedDate.error }));
        return;
      }
      mfgDate = parsedDate.value;
    } else if (item?.track_mfg_date) {
      setSettleErrors((p) => ({
        ...p,
        [itemId]: "Cần nhập Ngày sản xuất",
      }));
      return;
    }

    await runSave(async () => {
      const { error: err } = await settleOwed(itemId, parsedQty.value, mfgDate);
      if (err) {
        setSettleErrors((p) => ({ ...p, [itemId]: err }));
        return;
      }
      setSettleQtyInputs((p) => omitKey(p, itemId));
      setSettleMfgInputs((p) => omitKey(p, itemId));
      setSettleErrors((p) => omitKey(p, itemId));
      setMessage(
        `Đã nhận bù ${item?.name ?? ""}: ${fmt(item, parsedQty.value)}`
      );
      await fetchData();
    });
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
        {placedOrders.length === 0 && (
          <Text style={styles.meta}>Không có hàng đang về.</Text>
        )}
        {placedOrders.map(({ order, unreceivedLines }) => {
          const groupName = groupsById.get(order.group_id)?.name ?? "?";
          const placedLabel = formatDate(
            localDate(order.placed_at ?? order.created_at)
          );
          return (
            <View key={order.id} style={styles.orderBlock}>
              <Text style={styles.orderHeader}>
                {groupName} · Đặt ngày {placedLabel}
              </Text>
              {unreceivedLines.map((line) => {
                const item = itemsById.get(line.item_id);
                const lineError = lineErrors[line.id];
                return (
                  <View key={line.id} style={styles.row}>
                    <Text style={styles.name}>
                      {item?.name ?? "?"}
                      {item?.name_zh ? ` · ${item.name_zh}` : ""}
                    </Text>
                    <Text style={styles.metaInline}>
                      Đã đặt: {fmt(item, line.qty)}
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder={`Số thực nhận (mặc định ${fmt(item, line.qty)})`}
                      value={receivedInputs[line.id] ?? ""}
                      onChangeText={(t) => {
                        setReceivedInputs((p) => ({ ...p, [line.id]: t }));
                        setLineErrors((p) => ({ ...p, [line.id]: null }));
                      }}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Hàng hư (mặc định 0)"
                      value={damagedInputs[line.id] ?? ""}
                      onChangeText={(t) => {
                        setDamagedInputs((p) => ({ ...p, [line.id]: t }));
                        setLineErrors((p) => ({ ...p, [line.id]: null }));
                      }}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={
                        item?.track_mfg_date
                          ? "Ngày sản xuất (bắt buộc, vd 28)"
                          : "Ngày sản xuất (vd 28)"
                      }
                      value={mfgInputs[line.id] ?? ""}
                      onChangeText={(t) => {
                        setMfgInputs((p) => ({ ...p, [line.id]: t }));
                        setLineErrors((p) => ({ ...p, [line.id]: null }));
                      }}
                    />
                    {lineError && (
                      <Text style={styles.fieldError}>{lineError}</Text>
                    )}
                    <View style={styles.btnRow}>
                      <Pressable
                        style={[
                          styles.primary,
                          styles.btnHalf,
                          actionDisabled && styles.disabled,
                        ]}
                        disabled={actionDisabled}
                        onPress={() => void handleReceive(line, item, true)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.primaryText}>Đã đủ hàng</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.primary,
                          styles.place,
                          styles.btnHalf,
                          actionDisabled && styles.disabled,
                        ]}
                        disabled={actionDisabled}
                        onPress={() => void handleReceive(line, item, false)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.primaryText}>Lưu nhận hàng</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        <Text style={styles.section}>Chờ nhà cung cấp</Text>
        {waitingList.length === 0 && (
          <Text style={styles.meta}>Không có món nào đang chờ.</Text>
        )}
        {waitingList.map(([itemId, waitingQty]) => {
          const item = itemsById.get(itemId);
          const settleError = settleErrors[itemId];
          return (
            <View key={itemId} style={styles.row}>
              <Text style={styles.name}>
                {item?.name ?? "?"}
                {item?.name_zh ? ` · ${item.name_zh}` : ""}
              </Text>
              <Text style={styles.metaInline}>
                Còn chờ: {fmt(item, waitingQty)}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Số nhận bù"
                value={settleQtyInputs[itemId] ?? ""}
                onChangeText={(t) => {
                  setSettleQtyInputs((p) => ({ ...p, [itemId]: t }));
                  setSettleErrors((p) => ({ ...p, [itemId]: null }));
                }}
              />
              <TextInput
                style={styles.input}
                placeholder={
                  item?.track_mfg_date
                    ? "Ngày sản xuất (bắt buộc, vd 28)"
                    : "Ngày sản xuất (vd 28)"
                }
                value={settleMfgInputs[itemId] ?? ""}
                onChangeText={(t) => {
                  setSettleMfgInputs((p) => ({ ...p, [itemId]: t }));
                  setSettleErrors((p) => ({ ...p, [itemId]: null }));
                }}
              />
              {settleError && (
                <Text style={styles.fieldError}>{settleError}</Text>
              )}
              <Pressable
                style={[styles.primary, actionDisabled && styles.disabled]}
                disabled={actionDisabled}
                onPress={() => void handleSettle(itemId, waitingQty)}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>Đã nhận bù</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
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
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f766e",
    padding: 16,
    backgroundColor: "#f4f4f5",
  },
  orderBlock: {
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  orderHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: "#18181b",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
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
  meta: { fontSize: 13, color: "#52525b", padding: 16 },
  metaInline: { fontSize: 13, color: "#52525b" },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  btnHalf: { flex: 1 },
  error: { color: "#b91c1c", fontSize: 14, textAlign: "center", padding: 8 },
  fieldError: { color: "#b91c1c", fontSize: 14 },
  message: { color: "#0f766e", fontSize: 14, textAlign: "center", padding: 8 },
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
});

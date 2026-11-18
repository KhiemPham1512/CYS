import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { loadMovements, subscribeMovements } from "./api";
import { formatDate } from "./date";
import { expiryAlerts, inUseExpiry, lotExpiry } from "./expiry";
import { endInUse, loadInUse, subscribeInUse, type InUseRow } from "./inUseApi";
import { localDate, stockByItem, totalQty } from "./ledger";
import { formatQty, round4 } from "./qty";

type Props = { branchId: string };

const THRESHOLD_KEY = "cys.expiry-threshold";
const DEFAULT_THRESHOLD = 3;

type LotRow = {
  key: string;
  expiry: string;
  item: Tables<"items">;
  qty: number;
};

// Hạn dùng: Lô quá hạn, Lô sắp hết hạn (ngưỡng chỉnh được), và Đang dùng (món đã khui, hạn sau khui dài).
export function ExpiryScreen({ branchId }: Props) {
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [inUse, setInUse] = useState<InUseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [thresholdText, setThresholdText] = useState(String(DEFAULT_THRESHOLD));
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [catalog, movs, use] = await Promise.all([
        loadCatalog(branchId),
        loadMovements(branchId),
        loadInUse(branchId),
      ]);
      setItems(catalog.items);
      setMovements(movs);
      setInUse(use);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void fetchData();
    AsyncStorage.getItem(THRESHOLD_KEY)
      .then((raw) => {
        if (raw && /^\d+$/.test(raw)) setThresholdText(raw);
      })
      .catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void fetchData(), 300);
    };
    const unsubMov = subscribeMovements(branchId, reload);
    const unsubUse = subscribeInUse(branchId, reload);
    return () => {
      clearTimeout(timer);
      unsubMov();
      unsubUse();
    };
  }, [branchId, fetchData]);

  const today = localDate(new Date().toISOString());
  const threshold = /^\d+$/.test(thresholdText) ? Number(thresholdText) : 0;
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );
  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);

  const alerts = useMemo(() => {
    const rows: LotRow[] = [];
    for (const item of items) {
      if (item.is_hidden) continue;
      for (const lot of lotsByItem.get(item.id) ?? []) {
        const expiry = lotExpiry(lot, item);
        if (expiry)
          rows.push({
            key: `${item.id}|${lot.mfgDate ?? lot.enteredOn}`,
            expiry,
            item,
            qty: lot.qty,
          });
      }
    }
    return expiryAlerts(rows, today, threshold);
  }, [items, lotsByItem, today, threshold]);

  const fmt = (item: Tables<"items">, qty: number) =>
    formatQty(qty, {
      caseSize: item.case_size,
      unit: item.unit,
      byPercent: item.record_by_percent,
    });

  const changeThreshold = (text: string) => {
    setThresholdText(text);
    if (/^\d+$/.test(text))
      AsyncStorage.setItem(THRESHOLD_KEY, text).catch(() => undefined);
  };

  const end = async (id: string) => {
    const { error: err } = await endInUse(id);
    setMessage(err);
    if (!err) void fetchData();
  };

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (error)
    return (
      <View style={styles.center}>
        <Text style={styles.red}>Không tải được dữ liệu.</Text>
        <Pressable style={styles.button} onPress={() => void fetchData()}>
          <Text style={styles.buttonText}>Thử lại</Text>
        </Pressable>
      </View>
    );

  const lotLine = (r: LotRow) =>
    `${r.item.name} — ${fmt(r.item, r.qty)} — hạn ${formatDate(r.expiry)}`;

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.heading}>Lô quá hạn ({alerts.expired.length})</Text>
      {alerts.expired.length === 0 ? (
        <Text style={styles.meta}>Không có.</Text>
      ) : (
        alerts.expired.map((r) => (
          <Text key={r.key} style={[styles.row, styles.red]}>
            {lotLine(r)}
          </Text>
        ))
      )}

      <View style={styles.thresholdRow}>
        <Text style={styles.heading}>
          Sắp hết hạn ({alerts.soon.length}) — trong
        </Text>
        <TextInput
          style={styles.thresholdInput}
          keyboardType="number-pad"
          value={thresholdText}
          onChangeText={changeThreshold}
        />
        <Text style={styles.heading}>ngày</Text>
      </View>
      {alerts.soon.length === 0 ? (
        <Text style={styles.meta}>Không có.</Text>
      ) : (
        alerts.soon.map((r) => (
          <Text key={r.key} style={[styles.row, styles.amber]}>
            {lotLine(r)}
          </Text>
        ))
      )}

      <Text style={styles.heading}>Đang dùng ({inUse.length})</Text>
      {message ? <Text style={styles.red}>{message}</Text> : null}
      {inUse.length === 0 ? (
        <Text style={styles.meta}>Chưa có món nào đang dùng.</Text>
      ) : (
        inUse.map((u) => {
          const item = itemsById.get(u.item_id);
          if (!item) return null;
          const until = inUseExpiry(u.opened_on, item);
          const overdue = until !== null && until < today;
          // Món ghi theo %: phần lẻ của tồn kho là phần còn lại của đơn vị đang dùng.
          const stock = totalQty(lotsByItem.get(item.id) ?? []);
          const rest = round4(stock - Math.floor(stock));
          return (
            <View key={u.id} style={styles.useRow}>
              <View style={styles.useText}>
                <Text style={[styles.row, overdue && styles.red]}>
                  {item.name} — khui {formatDate(u.opened_on)}
                  {until ? `, dùng được đến ${formatDate(until)}` : ""}
                  {overdue ? " (quá hạn)" : ""}
                </Text>
                {item.record_by_percent && rest > 0 ? (
                  <Text style={styles.meta}>
                    Còn lại: {Math.round(rest * 100)}%
                  </Text>
                ) : null}
              </View>
              <Pressable
                style={styles.endButton}
                onPress={() => void end(u.id)}
                accessibilityRole="button"
              >
                <Text style={styles.endText}>Hết</Text>
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  pad: { padding: 16, gap: 8 },
  heading: { fontSize: 16, fontWeight: "700", color: "#18181b", marginTop: 8 },
  meta: { fontSize: 13, color: "#52525b" },
  row: { fontSize: 15, color: "#18181b" },
  red: { color: "#b91c1c", fontWeight: "600" },
  amber: { color: "#b45309" },
  thresholdRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  thresholdInput: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    minWidth: 48,
    fontSize: 16,
    textAlign: "center",
    backgroundColor: "#fff",
  },
  useRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  useText: { flex: 1 },
  endButton: {
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: "center",
  },
  endText: { color: "#0f766e", fontWeight: "600", fontSize: 15 },
  button: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
    padding: 14,
    minHeight: 44,
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

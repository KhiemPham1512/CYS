import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Tables } from "../lib/database.types";
import { formatDate } from "../stock/date";
import { localDate, localTime } from "../stock/ledger";
import { formatSheetQty } from "../stock/qty";
import type { OrderLineRow, OrderRow } from "./api";

type Props = {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  items: Tables<"items">[]; // đủ món của Nhóm, đã xếp theo thứ tự tờ
  placed: OrderRow[]; // các Đơn đặt hàng đã đặt của Nhóm
  lines: OrderLineRow[];
};

// Bảng đơn đã đặt viết lại y như tờ "ĐẶT HÀNG" giấy: đủ món theo thứ tự, món không đặt để trống số lượng.
export function PlacedOrderSheet({
  visible,
  onClose,
  groupName,
  items,
  placed,
  lines,
}: Props) {
  const sorted = useMemo(
    () =>
      [...placed].sort((a, b) =>
        (b.placed_at ?? "").localeCompare(a.placed_at ?? "")
      ),
    [placed]
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Mỗi lần mở lại hoặc đổi Nhóm thì về đơn mới nhất.
  useEffect(() => {
    if (visible) setPickedId(null);
  }, [visible, groupName]);

  const order = sorted.find((o) => o.id === pickedId) ?? sorted[0] ?? null;
  const qtyByItem = useMemo(
    () =>
      new Map(
        lines.filter((l) => l.order_id === order?.id).map((l) => [l.item_id, l])
      ),
    [lines, order]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>ĐẶT HÀNG</Text>
        <Text style={styles.sub}>{groupName}</Text>

        {sorted.length === 0 || !order ? (
          <Text style={styles.empty}>Nhóm này chưa có đơn đã đặt.</Text>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chips}
              contentContainerStyle={styles.chipsContent}
            >
              {sorted.map((o) => {
                const selected = o.id === order.id;
                const when = o.placed_at ?? o.created_at;
                return (
                  <Pressable
                    key={o.id}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setPickedId(o.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipTextSelected,
                      ]}
                    >
                      {formatDate(localDate(when))} {localTime(when)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.date}>
              Ngày: {formatDate(localDate(order.placed_at ?? order.created_at))}
            </Text>

            <View style={[styles.tr, styles.thRow]}>
              <Text style={[styles.cell, styles.stt, styles.th]}>STT</Text>
              <Text style={[styles.cell, styles.name, styles.th]}>
                Tên nguyên vật liệu
              </Text>
              <Text style={[styles.cell, styles.unit, styles.th]}>Đơn vị</Text>
              <Text style={[styles.cell, styles.qty, styles.th]}>Số lượng</Text>
            </View>
            <ScrollView>
              {items.map((item, idx) => {
                const line = qtyByItem.get(item.id);
                return (
                  <View key={item.id} style={styles.tr}>
                    <Text style={[styles.cell, styles.stt]}>{idx + 1}</Text>
                    <Text style={[styles.cell, styles.name]}>
                      {item.name}
                      {item.name_zh ? ` (${item.name_zh})` : ""}
                    </Text>
                    <Text style={[styles.cell, styles.unit]}>{item.unit}</Text>
                    <Text style={[styles.cell, styles.qty, styles.qtyText]}>
                      {line
                        ? formatSheetQty(line.qty, {
                            caseSize: item.case_size,
                            byPercent: item.record_by_percent,
                          })
                        : ""}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        <Pressable
          style={styles.close}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.closeText}>Đóng</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const BORDER = "#a1a1aa";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 48 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#18181b",
    textAlign: "center",
  },
  sub: {
    fontSize: 15,
    color: "#52525b",
    textAlign: "center",
    marginBottom: 8,
  },
  empty: { padding: 24, textAlign: "center", color: "#52525b", fontSize: 15 },
  chips: { flexGrow: 0 },
  chipsContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    minHeight: 40,
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#f4f4f5",
  },
  chipSelected: { backgroundColor: "#0f766e" },
  chipText: { fontSize: 14, color: "#18181b" },
  chipTextSelected: { color: "#fff", fontWeight: "600" },
  date: { paddingHorizontal: 16, paddingBottom: 6, fontSize: 14 },
  tr: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: BORDER,
    marginHorizontal: 8,
  },
  thRow: { backgroundColor: "#e4e4e7" },
  cell: {
    borderRightWidth: 1,
    borderColor: BORDER,
    paddingVertical: 10,
    paddingHorizontal: 6,
    fontSize: 14,
    color: "#18181b",
    minHeight: 44,
    textAlignVertical: "center",
  },
  th: { fontWeight: "700", textAlign: "center" },
  stt: { width: 44, textAlign: "center" },
  name: { flex: 1 },
  unit: { width: 64, textAlign: "center" },
  qty: { width: 88, textAlign: "center" },
  qtyText: { fontWeight: "700", color: "#1d4ed8" },
  close: {
    margin: 16,
    backgroundColor: "#0f766e",
    borderRadius: 8,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Tables } from "../lib/database.types";
import { planReturn } from "../orders/receiving";
import { returnDamaged } from "../orders/receivingApi";
import { formatDayMonth, formatMfg } from "./expiry";
import type { Lot } from "./ledger";
import { formatQty, parseQty } from "./qty";

type Props = {
  item: Tables<"items">;
  lots: Lot[];
  online: boolean;
};

const lotKey = (lot: Lot) => lot.mfgDate ?? `u:${lot.enteredOn ?? ""}`;
const lotLabel = (lot: Lot, item: Tables<"items">) =>
  lot.mfgDate
    ? `NSX ${formatMfg(lot.mfgDate, item)}`
    : `Chưa có NSX${lot.enteredOn ? ` (vào kho ${formatDayMonth(lot.enteredOn)})` : ""}`;

// Trả hàng hư sau khi đã vào kho: chọn Lô, nhập số; kho trừ đúng Lô và số đó sang Chờ nhà cung cấp.
export function ReturnDamagedPanel({ item, lots, online }: Props) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const opts = { caseSize: item.case_size, byPercent: item.record_by_percent };
  const fmt = (q: number) => formatQty(q, { ...opts, unit: item.unit });
  const lot = lots.find((l) => lotKey(l) === chosen);

  if (lots.length === 0)
    return <Text style={styles.meta}>Chưa có tồn kho để trả.</Text>;

  const save = async () => {
    if (saving) return;
    const parsed = parseQty(qtyInput, opts);
    if (!parsed.ok) return setError(parsed.error);
    const plan = planReturn(lot, parsed.value);
    if (!plan.ok) return setError(plan.error);
    setSaving(true);
    setError(null);
    setDone(null);
    const { error: err } = await returnDamaged(
      item.id,
      plan.qty,
      plan.mfgDate,
      plan.enteredOn
    );
    setSaving(false);
    if (err) return setError(err);
    setDone(`Đã trả ${fmt(plan.qty)}, chuyển sang tab Hàng thiếu chờ đền.`);
    setQtyInput("");
    setChosen(null);
  };

  return (
    <View style={styles.box}>
      <Text style={styles.meta}>
        Chọn Lô có hàng hư, nhập số trả. Tồn kho giảm đúng Lô đó và số này vào
        Chờ nhà cung cấp.
      </Text>
      <View style={styles.chips}>
        {lots.map((l) => {
          const selected = lotKey(l) === chosen;
          return (
            <Pressable
              key={lotKey(l)}
              style={[styles.chip, selected && styles.chipOn]}
              onPress={() => {
                setChosen(lotKey(l));
                setError(null);
                setDone(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                {lotLabel(l, item)}: {fmt(l.qty)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Số lượng hàng hư"
        value={qtyInput}
        onChangeText={(t) => {
          setQtyInput(t);
          setError(null);
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {done ? <Text style={styles.ok}>{done}</Text> : null}
      <Pressable
        style={[styles.save, (!online || saving) && styles.disabled]}
        disabled={!online || saving}
        onPress={() => void save()}
        accessibilityRole="button"
      >
        <Text style={styles.saveText}>
          {saving ? "Đang lưu…" : "Trả hàng hư"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  meta: { fontSize: 13, color: "#52525b" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  chipOn: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { fontSize: 14, color: "#18181b" },
  chipTextOn: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  error: { color: "#b91c1c", fontSize: 14 },
  ok: { color: "#0f766e", fontSize: 14, fontWeight: "600" },
  save: {
    backgroundColor: "#b45309",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

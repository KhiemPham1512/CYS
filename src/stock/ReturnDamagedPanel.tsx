import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { TextInput } from "../ui/TextInput";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import type { Tables } from "../lib/database.types";
import { planReturn } from "../orders/receiving";
import { returnDamaged } from "../orders/receivingApi";
import { formatDayMonth, formatMfg, usesMfgDate } from "./expiry";
import type { Lot } from "./ledger";
import { formatQty, parseQty } from "./qty";

type Props = {
  item: Tables<"items">;
  lots: Lot[];
  online: boolean;
};

const lotKey = (lot: Lot) => lot.mfgDate ?? `u:${lot.enteredOn ?? ""}`;
const lotLabel = (lot: Lot, item: Tables<"items">) =>
  !usesMfgDate(item)
    ? `Vào kho ${formatDayMonth(lot.enteredOn ?? lot.mfgDate ?? "")}` // món không có hạn: không nói NSX
    : lot.mfgDate
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
  const fmt = (q: number) =>
    formatQty(q, { ...opts, unit: item.unit, splitCases: false });
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

const styles = themedStyles((c: Palette) => ({
  box: { gap: 8 },
  meta: { fontSize: 13, color: c.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  chipOn: { backgroundColor: c.accentDeep, borderColor: c.accentDeep },
  chipText: { fontSize: 14, color: c.ink },
  chipTextOn: { color: c.onAccent },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: c.surface,
  },
  error: { color: c.red, fontSize: 14 },
  ok: { color: c.accentDeep, fontSize: 14, fontWeight: "600" },
  save: {
    backgroundColor: c.amber,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  saveText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
}));

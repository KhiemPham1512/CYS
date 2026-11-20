import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { TextInput } from "../ui/TextInput";
import { switchTrack, themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import type { ShelfLifeUnit, Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import { saveItem, setHidden } from "./api";
import {
  emptyForm,
  type ItemFormValues,
  parseItemForm,
  toFormValues,
} from "./itemFormModel";

type Props = {
  visible: boolean;
  groups: Tables<"item_groups">[];
  initial: Tables<"items"> | null;
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
};

const UNIT_OPTIONS: { unit: ShelfLifeUnit; label: string }[] = [
  { unit: "day", label: "Ngày" },
  { unit: "month", label: "Tháng" },
];

function UnitToggle({
  value,
  onChange,
}: {
  value: ShelfLifeUnit;
  onChange: (unit: ShelfLifeUnit) => void;
}) {
  return (
    <View style={styles.unitGroup}>
      {UNIT_OPTIONS.map((opt) => {
        const selected = value === opt.unit;
        return (
          <Pressable
            key={opt.unit}
            style={[styles.unitBtn, selected && styles.unitBtnSelected]}
            onPress={() => onChange(opt.unit)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              style={[
                styles.unitBtnText,
                selected && styles.unitBtnTextSelected,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ItemForm({
  visible,
  groups,
  initial,
  branchId,
  onClose,
  onSaved,
}: Props) {
  const online = useOnline();
  const sortedGroups = useMemo(
    () =>
      [...groups].sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name, "vi")
      ),
    [groups]
  );

  const [values, setValues] = useState<ItemFormValues>(() =>
    initial ? toFormValues(initial) : emptyForm(sortedGroups[0]?.id ?? "")
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof ItemFormValues, string>>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Chỉ đặt lại form khi mở form hoặc đổi món. Không theo dõi groups: realtime tải lại
  // Danh mục sẽ tạo mảng mới và xóa mất chữ người dùng đang gõ.
  const defaultGroupId = sortedGroups[0]?.id ?? "";
  const defaultGroupRef = useRef(defaultGroupId);
  defaultGroupRef.current = defaultGroupId;
  useEffect(() => {
    if (!visible) return;
    setValues(
      initial ? toFormValues(initial) : emptyForm(defaultGroupRef.current)
    );
    setErrors({});
    setSubmitError(null);
    setBusy(false);
  }, [visible, initial]);

  function setField<K extends keyof ItemFormValues>(
    key: K,
    val: ItemFormValues[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSave() {
    const parsed = parseItemForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setBusy(true);
    setSubmitError(null);
    const res = await saveItem(branchId, initial?.id ?? null, parsed.value);
    setBusy(false);
    if (res.error) {
      setSubmitError(res.error);
      return;
    }
    onSaved();
  }

  async function handleToggleHidden() {
    if (!initial) return;
    setBusy(true);
    setSubmitError(null);
    const res = await setHidden(initial.id, !initial.is_hidden);
    setBusy(false);
    if (res.error) {
      setSubmitError(res.error);
      return;
    }
    onSaved();
  }

  const actionsDisabled = !online || busy;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {initial ? "Sửa Nguyên vật liệu" : "Thêm Nguyên vật liệu"}
          </Text>
          <Pressable
            style={styles.cancelHeaderBtn}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Hủy</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Tên *</Text>
          <TextInput
            style={styles.input}
            value={values.name}
            onChangeText={(t) => setField("name", t)}
            placeholder="Ví dụ: Trà xanh"
          />
          {errors.name && <Text style={styles.error}>{errors.name}</Text>}

          <Text style={styles.label}>Tên tiếng Trung</Text>
          <TextInput
            style={styles.input}
            value={values.name_zh}
            onChangeText={(t) => setField("name_zh", t)}
            placeholder="Ví dụ: 綠茶"
          />

          <Text style={styles.label}>Nhóm *</Text>
          <View style={styles.chipRow}>
            {sortedGroups.map((g) => {
              const selected = values.group_id === g.id;
              return (
                <Pressable
                  key={g.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setField("group_id", g.id)}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {g.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.group_id && (
            <Text style={styles.error}>{errors.group_id}</Text>
          )}

          <Text style={styles.label}>Đơn vị tính *</Text>
          <TextInput
            style={styles.input}
            value={values.unit}
            onChangeText={(t) => setField("unit", t)}
            placeholder="Ví dụ: Bao, Thùng, Bình"
          />
          {errors.unit && <Text style={styles.error}>{errors.unit}</Text>}

          <Text style={styles.label}>Đơn vị tính (tiếng Trung)</Text>
          <TextInput
            style={styles.input}
            value={values.unit_zh}
            onChangeText={(t) => setField("unit_zh", t)}
            placeholder="Ví dụ: 包, 箱, 瓶"
          />

          <Text style={styles.label}>
            Quy cách thùng (số Đơn vị tính / thùng)
          </Text>
          <TextInput
            style={styles.input}
            value={values.case_size}
            onChangeText={(t) => setField("case_size", t)}
            keyboardType="number-pad"
            placeholder="Để trống nếu không tính theo thùng"
          />
          {errors.case_size && (
            <Text style={styles.error}>{errors.case_size}</Text>
          )}

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Theo dõi Ngày sản xuất</Text>
            <Switch
              value={values.track_mfg_date}
              onValueChange={(val) => setField("track_mfg_date", val)}
              trackColor={switchTrack()}
            />
          </View>

          <Text style={styles.label}>Thời hạn sử dụng (từ Ngày sản xuất)</Text>
          <View style={styles.durationRow}>
            <TextInput
              style={[styles.input, styles.durationInput]}
              value={values.shelf_life}
              onChangeText={(t) => setField("shelf_life", t)}
              keyboardType="number-pad"
              placeholder="Ví dụ: 12"
            />
            <UnitToggle
              value={values.shelf_life_unit}
              onChange={(u) => setField("shelf_life_unit", u)}
            />
          </View>
          {errors.shelf_life && (
            <Text style={styles.error}>{errors.shelf_life}</Text>
          )}

          <Text style={styles.label}>Hạn kể từ ngày nhập (ngày)</Text>
          <TextInput
            style={styles.input}
            value={values.shelf_life_from_receipt_days}
            onChangeText={(t) => setField("shelf_life_from_receipt_days", t)}
            keyboardType="number-pad"
            placeholder="Ví dụ: 14"
          />
          {errors.shelf_life_from_receipt_days && (
            <Text style={styles.error}>
              {errors.shelf_life_from_receipt_days}
            </Text>
          )}

          <Text style={styles.label}>Hạn sau khui/rã đông</Text>
          <View style={styles.durationRow}>
            <TextInput
              style={[styles.input, styles.durationInput]}
              value={values.shelf_life_after_open}
              onChangeText={(t) => setField("shelf_life_after_open", t)}
              keyboardType="number-pad"
              placeholder="Ví dụ: 3"
            />
            <UnitToggle
              value={values.shelf_life_after_open_unit}
              onChange={(u) => setField("shelf_life_after_open_unit", u)}
            />
          </View>
          {errors.shelf_life_after_open && (
            <Text style={styles.error}>{errors.shelf_life_after_open}</Text>
          )}

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Ghi theo %</Text>
            <Switch
              value={values.record_by_percent}
              onValueChange={(val) => setField("record_by_percent", val)}
              trackColor={switchTrack()}
            />
          </View>

          {!online && (
            <Text style={styles.offlineNote} accessibilityRole="alert">
              Mất mạng — không lưu được
            </Text>
          )}
          {submitError && <Text style={styles.error}>{submitError}</Text>}

          <View style={styles.actions}>
            <Pressable
              style={[
                styles.primaryButton,
                actionsDisabled && styles.buttonDisabled,
              ]}
              disabled={actionsDisabled}
              onPress={handleSave}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>
                {busy ? "Đang lưu…" : "Lưu"}
              </Text>
            </Pressable>

            {initial && (
              <Pressable
                style={[
                  styles.secondaryButton,
                  actionsDisabled && styles.buttonDisabled,
                ]}
                disabled={actionsDisabled}
                onPress={handleToggleHidden}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>
                  {initial.is_hidden ? "Hiện lại món" : "Ẩn món"}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={styles.cancelButton}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Hủy</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c: Palette) => ({
  container: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: c.ink },
  cancelHeaderBtn: { minHeight: 44, justifyContent: "center", padding: 8 },
  cancelText: { color: c.accentDeep, fontSize: 16, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 10, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: "600", color: c.ink, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: c.ink,
  },
  durationRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  durationInput: { flex: 1 },
  unitGroup: { flexDirection: "row", gap: 6 },
  unitBtn: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: c.surface,
  },
  unitBtnSelected: {
    backgroundColor: c.accentDeep,
    borderColor: c.accentDeep,
  },
  unitBtnText: { fontSize: 14, fontWeight: "600", color: c.ink },
  unitBtnTextSelected: { color: c.onAccent },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: c.surface,
  },
  chipSelected: {
    backgroundColor: c.accentDeep,
    borderColor: c.accentDeep,
  },
  chipText: { fontSize: 14, fontWeight: "600", color: c.ink },
  chipTextSelected: { color: c.onAccent },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    marginTop: 4,
  },
  switchLabel: { fontSize: 15, fontWeight: "600", color: c.ink, flex: 1 },
  error: { color: c.red, fontSize: 13 },
  offlineNote: {
    color: c.red,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
  actions: { gap: 10, marginTop: 12 },
  primaryButton: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: c.accentDeep,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: { color: c.accentDeep, fontSize: 16, fontWeight: "600" },
  cancelButton: {
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  buttonDisabled: { opacity: 0.5 },
}));

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import { Loading } from "../ui/Loading";
import { saveItemEdits } from "../admin/api";
import type { ShelfLifeUnit, Tables } from "../lib/database.types";
import { loadCatalog } from "./api";
import { diffItemEdits } from "./bulkEdit";
import { toFormValues, type ItemFormValues } from "./itemFormModel";
import { compareGroups, compareItems } from "./sections";

type Props = { branchId: string };

type Col = { key: string; label: string; width: number };
const COLS: Col[] = [
  { key: "name", label: "Món", width: 200 },
  { key: "unit", label: "Đơn vị", width: 90 },
  { key: "case_size", label: "Quy cách thùng", width: 110 },
  { key: "track", label: "Theo dõi NSX", width: 90 },
  { key: "shelf", label: "Thời hạn", width: 150 },
  { key: "receipt", label: "Hạn từ ngày nhập (ngày)", width: 130 },
  { key: "open", label: "Hạn sau khui", width: 150 },
  { key: "percent", label: "Ghi theo %", width: 80 },
];
const widthOf = (k: string) => COLS.find((c) => c.key === k)?.width ?? 100;

// Sửa Danh mục hàng loạt dạng bảng: sửa trực tiếp trong ô, dòng đã sửa tô vàng, lưu một lần.
// Mỗi thay đổi tự vào Nhật ký nhờ trigger ở database.
export function BulkEditScreen({ branchId }: Props) {
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [edits, setEdits] = useState<Record<string, ItemFormValues>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const latest = useRef(0);

  const fetchData = useCallback(async () => {
    const request = ++latest.current;
    try {
      const data = await loadCatalog(branchId);
      if (request !== latest.current) return;
      setGroups([...data.groups].sort(compareGroups));
      setItems(data.items.filter((i) => !i.is_hidden));
      setLoadError(false);
    } catch {
      if (request === latest.current) setLoadError(true);
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    void fetchData();
  }, [fetchData]);

  const { updates, errors } = useMemo(
    () => diffItemEdits(items, edits),
    [items, edits]
  );
  const changedIds = useMemo(
    () => new Set(updates.map((u) => u.id)),
    [updates]
  );
  const errorCount = Object.keys(errors).length;
  const canSave = updates.length > 0 && errorCount === 0 && !saving;

  const valuesOf = (item: Tables<"items">) =>
    edits[item.id] ?? toFormValues(item);
  const setField = (item: Tables<"items">, patch: Partial<ItemFormValues>) => {
    setMessage(null);
    setEdits((e) => ({ ...e, [item.id]: { ...valuesOf(item), ...patch } }));
  };
  const undo = (id: string) =>
    setEdits((e) => {
      const { [id]: _drop, ...rest } = e;
      return rest;
    });

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    const res = await saveItemEdits(updates);
    setSaving(false);
    if (res.error) {
      setMessage({
        ok: false,
        text: `${res.error} Đã lưu ${res.done}/${updates.length} món.`,
      });
    } else {
      setMessage({ ok: true, text: `Đã lưu ${res.done} món.` });
    }
    if (!res.error) setEdits({}); // lỗi giữa chừng: giữ các sửa chưa lưu để bấm Lưu lại
    await fetchData();
  };

  const sections = useMemo(
    () =>
      groups
        .map((g) => ({
          group: g,
          items: items.filter((i) => i.group_id === g.id).sort(compareItems),
        }))
        .filter((s) => s.items.length > 0),
    [groups, items]
  );

  if (loading) return <Loading />;
  if (loadError)
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Không tải được Danh mục.</Text>
        <Pressable style={styles.primary} onPress={() => void fetchData()}>
          <Text style={styles.primaryText}>Thử lại</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.title}>Sửa hàng loạt Danh mục</Text>
        {errorCount > 0 && (
          <Text style={styles.summaryError} accessibilityRole="alert">
            Có {errorCount} món nhập sai, sửa các ô viền đỏ rồi mới lưu được.
          </Text>
        )}
        {message && (
          <Text style={message.ok ? styles.ok : styles.errorText}>
            {message.text}
          </Text>
        )}

        <ScrollView horizontal>
          <View>
            <View style={[styles.row, styles.head]}>
              {COLS.map((c) => (
                <Text
                  key={c.key}
                  style={[styles.cell, styles.headText, { width: c.width }]}
                >
                  {c.label}
                </Text>
              ))}
            </View>
            {sections.map(({ group, items: list }) => (
              <View key={group.id}>
                <Text style={styles.groupHeader}>{group.name}</Text>
                {list.map((item) => {
                  const v = valuesOf(item);
                  const err = errors[item.id] ?? {};
                  const changed = changedIds.has(item.id) || !!errors[item.id];
                  return (
                    <View key={item.id}>
                      <View style={[styles.row, changed && styles.rowChanged]}>
                        <View style={[styles.cell, { width: widthOf("name") }]}>
                          <Text style={styles.name}>{item.name}</Text>
                          {changed && (
                            <Pressable
                              onPress={() => undo(item.id)}
                              accessibilityRole="button"
                            >
                              <Text style={styles.undo}>Đã sửa · Hoàn tác</Text>
                            </Pressable>
                          )}
                        </View>
                        <Cell width={widthOf("unit")} error={err.unit}>
                          <TextInput
                            style={[
                              styles.input,
                              err.unit && styles.inputError,
                            ]}
                            value={v.unit}
                            onChangeText={(t) => setField(item, { unit: t })}
                          />
                        </Cell>
                        <Cell
                          width={widthOf("case_size")}
                          error={err.case_size}
                        >
                          <TextInput
                            style={[
                              styles.input,
                              err.case_size && styles.inputError,
                            ]}
                            keyboardType="number-pad"
                            value={v.case_size}
                            onChangeText={(t) =>
                              setField(item, { case_size: t })
                            }
                          />
                        </Cell>
                        <View
                          style={[styles.cell, { width: widthOf("track") }]}
                        >
                          <Switch
                            value={v.track_mfg_date}
                            onValueChange={(b) =>
                              setField(item, { track_mfg_date: b })
                            }
                          />
                        </View>
                        <Cell width={widthOf("shelf")} error={err.shelf_life}>
                          <View style={styles.pair}>
                            <TextInput
                              style={[
                                styles.input,
                                styles.pairNum,
                                err.shelf_life && styles.inputError,
                              ]}
                              keyboardType="number-pad"
                              value={v.shelf_life}
                              onChangeText={(t) =>
                                setField(item, { shelf_life: t })
                              }
                            />
                            <UnitToggle
                              value={v.shelf_life_unit}
                              onChange={(u) =>
                                setField(item, { shelf_life_unit: u })
                              }
                            />
                          </View>
                        </Cell>
                        <Cell
                          width={widthOf("receipt")}
                          error={err.shelf_life_from_receipt_days}
                        >
                          <TextInput
                            style={[
                              styles.input,
                              err.shelf_life_from_receipt_days &&
                                styles.inputError,
                            ]}
                            keyboardType="number-pad"
                            value={v.shelf_life_from_receipt_days}
                            onChangeText={(t) =>
                              setField(item, {
                                shelf_life_from_receipt_days: t,
                              })
                            }
                          />
                        </Cell>
                        <Cell
                          width={widthOf("open")}
                          error={err.shelf_life_after_open}
                        >
                          <View style={styles.pair}>
                            <TextInput
                              style={[
                                styles.input,
                                styles.pairNum,
                                err.shelf_life_after_open && styles.inputError,
                              ]}
                              keyboardType="number-pad"
                              value={v.shelf_life_after_open}
                              onChangeText={(t) =>
                                setField(item, { shelf_life_after_open: t })
                              }
                            />
                            <UnitToggle
                              value={v.shelf_life_after_open_unit}
                              onChange={(u) =>
                                setField(item, {
                                  shelf_life_after_open_unit: u,
                                })
                              }
                            />
                          </View>
                        </Cell>
                        <View
                          style={[styles.cell, { width: widthOf("percent") }]}
                        >
                          <Switch
                            value={v.record_by_percent}
                            onValueChange={(b) =>
                              setField(item, { record_by_percent: b })
                            }
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>

      <View style={styles.bar}>
        <Text style={styles.barText}>Đã sửa {updates.length} món</Text>
        <Pressable
          style={[styles.primary, !canSave && styles.disabled]}
          disabled={!canSave}
          onPress={() => void save()}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>
            {saving ? "Đang lưu…" : "Lưu các thay đổi"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Cell({
  width,
  error,
  children,
}: {
  width: number;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.cell, { width }]}>
      {children}
      {error ? <Text style={styles.cellError}>{error}</Text> : null}
    </View>
  );
}

function UnitToggle({
  value,
  onChange,
}: {
  value: ShelfLifeUnit;
  onChange: (u: ShelfLifeUnit) => void;
}) {
  return (
    <Pressable
      style={styles.unit}
      onPress={() => onChange(value === "month" ? "day" : "month")}
      accessibilityRole="button"
      accessibilityLabel="Đổi đơn vị ngày hoặc tháng"
    >
      <Text style={styles.unitText}>
        {value === "month" ? "tháng" : "ngày"}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles((c: Palette) => ({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  pad: { padding: 16, paddingBottom: 96, gap: 8 },
  title: { fontSize: 20, fontWeight: "800", color: c.ink },
  summaryError: { color: c.red, fontWeight: "600", fontSize: 14 },
  errorText: { color: c.red, fontSize: 14 },
  ok: { color: c.accentDeep, fontWeight: "600", fontSize: 14 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
  },
  rowChanged: { backgroundColor: c.amberSoft },
  head: { backgroundColor: c.line },
  headText: { fontWeight: "700", fontSize: 13 },
  groupHeader: {
    fontSize: 15,
    fontWeight: "700",
    color: c.accentDeep,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: c.accentSoft,
  },
  cell: { padding: 6, justifyContent: "center", color: c.ink } as never,
  name: { fontSize: 14, fontWeight: "600", color: c.ink },
  undo: { fontSize: 12, color: c.amber, textDecorationLine: "underline" },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: c.surface,
    minHeight: 40,
  },
  inputError: { borderColor: c.red },
  cellError: { color: c.red, fontSize: 12 },
  pair: { flexDirection: "row", gap: 4, alignItems: "center" },
  pairNum: { flex: 1, minWidth: 50 },
  unit: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 6,
    paddingHorizontal: 8,
    minHeight: 40,
    justifyContent: "center",
    backgroundColor: c.surface,
  },
  unitText: { fontSize: 13, color: c.ink },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderColor: c.line,
  },
  barText: { fontSize: 15, fontWeight: "600", color: c.ink },
  primary: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: "center",
  },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
}));

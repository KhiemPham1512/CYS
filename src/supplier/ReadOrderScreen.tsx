import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SCRIM } from "../ui/overlay";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import { Loading } from "../ui/Loading";
import { loadCatalog } from "../catalog/api";
import { compareGroups, compareItems } from "../catalog/sections";
import type { Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import { formatItemQty } from "../stock/qty";
import { loadOrders, type OrderLineRow, type OrderRow } from "../orders/api";
import { incomingByItem } from "../orders/orders";
import { loadReceivingData } from "../orders/receivingApi";
import { sheetStrings } from "../orders/exportSheet";
import {
  nameKey,
  suggestItems,
  type CompareStatus,
  type RawLine,
} from "./orderReconcile";
import { reviewSupplierOrder } from "./orderReview";
import {
  loadAliases,
  readOrderImages,
  saveAlias,
  type ImageInput,
} from "./readOrderApi";

const MAX_IMAGES = 6;
const STATUS_TEXT: Record<CompareStatus, string> = {
  ok: "Đúng",
  less: "NCC giao ít hơn",
  more: "NCC giao nhiều hơn",
  missing: "NCC thiếu món này",
  extra: "Ngoài đơn đã đặt",
};

type Props = { branchId: string };

export function ReadOrderScreen({ branchId }: Props) {
  const online = useOnline();
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [receivedLineIds, setReceivedLineIds] = useState<Set<string>>(
    () => new Set()
  );
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [picked, setPicked] = useState<ImageInput[]>([]);
  const [read, setRead] = useState<RawLine[][] | null>(null);
  const [parts, setParts] = useState<(RawLine[] | null)[]>([]); // kết quả từng ảnh đã chọn
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [asking, setAsking] = useState<RawLine | null>(null); // tên lạ đang chọn món

  const latestRequest = useRef(0);
  const fetchData = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoadError(false);
    try {
      const [catalog, ord, rec, al] = await Promise.all([
        loadCatalog(branchId),
        loadOrders(branchId),
        loadReceivingData(branchId),
        loadAliases(branchId),
      ]);
      if (request !== latestRequest.current) return;
      setGroups([...catalog.groups].sort(compareGroups));
      setItems(catalog.items);
      setOrders(ord.orders);
      setLines(ord.lines);
      setReceivedLineIds(rec.receivedLineIds);
      setAliases(al);
    } catch {
      if (request === latestRequest.current) setLoadError(true);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    void fetchData();
  }, [fetchData]);

  // Đơn nhà cung cấp gửi chung nhiều Nhóm: so với đơn đã đặt của mọi Nhóm, khớp tên trong toàn bộ món.
  const placedGroupNames = useMemo(() => {
    const ids = new Set(
      orders.filter((o) => o.placed_at !== null).map((o) => o.group_id)
    );
    return groups.filter((g) => ids.has(g.id)).map((g) => g.name);
  }, [groups, orders]);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  // Danh sách chọn món cho tên lạ: theo Nhóm, mỗi Nhóm một tiêu đề.
  const itemsByGroup = useMemo(
    () =>
      groups.map((g) => ({
        group: g,
        items: items.filter((i) => i.group_id === g.id).sort(compareItems),
      })),
    [groups, items]
  );

  // Món để khớp: thêm tên in và chữ Trung trên tờ đặt hàng (cột items.sheet), gần tên nhà cung cấp hơn tên trong app.
  const matchItems = useMemo(
    () =>
      items.map((i) => {
        const printed = sheetStrings(i.sheet, ["name", "zh"] as const);
        return {
          id: i.id,
          name: i.name,
          unit: i.unit,
          case_size: i.case_size,
          alt_name: printed.name ?? null,
          name_zh: printed.zh ?? i.name_zh,
        };
      }),
    [items]
  );

  const review = useMemo(() => {
    if (!read) return null;
    const placed = orders.filter((o) => o.placed_at !== null);
    return reviewSupplierOrder({
      images: read,
      items: matchItems,
      aliases,
      ordered: incomingByItem(placed, lines, receivedLineIds), // chỉ phần chưa nhận hàng
    });
  }, [read, orders, lines, receivedLineIds, matchItems, aliases]);

  async function pickImages() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES,
      base64: true,
      quality: 0.8,
    });
    if (res.canceled) return;
    const chosen = res.assets
      .filter((a) => a.base64)
      .map((a) => ({ mime: a.mimeType ?? "image/jpeg", data: a.base64 ?? "" }));
    setPicked(chosen.slice(0, MAX_IMAGES));
    setParts([]);
    setRead(null);
    setMessage(
      chosen.length > MAX_IMAGES ? `Chỉ lấy ${MAX_IMAGES} ảnh đầu tiên` : null
    );
  }

  // Mỗi ảnh một lượt gọi để gộp ảnh chồng nhau ở máy (mergeRawLines); một ảnh lỗi thì báo, không so một nửa.
  async function readAll() {
    if (!online || readingRef.current || picked.length === 0) return;
    readingRef.current = true; // chống bấm đôi trước khi state kịp cập nhật
    setReading(true);
    setMessage(null);
    // Ảnh đã đọc xong giữ lại; bấm lại chỉ đọc các ảnh còn lỗi (không tốn thêm lượt).
    const todo = picked.map((_, i) => i).filter((i) => !parts[i]);
    const results = await Promise.all(
      todo.map((i) => readOrderImages(branchId, [picked[i]]))
    );
    readingRef.current = false;
    setReading(false);
    const next = [...parts];
    todo.forEach((i, k) => {
      next[i] = results[k].lines ?? null;
    });
    setParts(next);
    const failed = results.find((r) => r.error);
    if (failed) {
      const done = next.filter((x) => x).length;
      setMessage(
        `${failed.error} Đã đọc ${done}/${picked.length} ảnh, bấm đọc lại để đọc tiếp ảnh còn lại. Hoặc chọn “Đã đặt đúng như đơn” ở mục Đặt hàng.`
      );
      return;
    }
    setRead(next.map((x) => x ?? []));
  }

  async function remember(line: RawLine, itemId: string) {
    setAsking(null);
    const { error } = await saveAlias(branchId, line.name, itemId);
    if (error) {
      setMessage(error);
      return;
    }
    setAliases((a) => ({ ...a, [nameKey(line.name)]: itemId })); // so lại ngay, lần sau tự khớp
  }

  if (loading)
    return (
      <View style={styles.center}>
        <Loading />
      </View>
    );
  if (loadError)
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

  const nameOf = (id: string) => itemsById.get(id)?.name ?? "(món đã xóa)";
  const noLines = review && read && read.every((r) => r.length === 0);

  return (
    <View style={styles.container}>
      {!online && (
        <Text style={styles.error}>Mất mạng — không đọc được ảnh</Text>
      )}
      {message && <Text style={styles.error}>{message}</Text>}
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>
          1. Chọn ảnh chụp đơn (tối đa {MAX_IMAGES})
        </Text>
        {placedGroupNames.length === 0 ? (
          <Text style={styles.note}>
            Chưa có đơn nào đã đặt để đối chiếu. Đặt hàng trước ở mục Đặt hàng.
          </Text>
        ) : (
          <View style={styles.pad}>
            <Text style={styles.meta}>
              Đối chiếu với đơn đã đặt của: {placedGroupNames.join(", ")}.
            </Text>
            <Text style={styles.meta}>
              Ảnh gửi để đọc bảng sản phẩm; app dặn bỏ qua số điện thoại, địa
              chỉ, giá. Hãy cắt bớt phần đó nếu thấy cần.
            </Text>
            <Pressable
              style={[styles.secondary, reading && styles.disabled]}
              disabled={reading}
              onPress={() => void pickImages()}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>
                {picked.length > 0
                  ? `Đã chọn ${picked.length} ảnh · chọn lại`
                  : "Chọn ảnh"}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.primary,
                (!online || reading || picked.length === 0) && styles.disabled,
              ]}
              disabled={!online || reading || picked.length === 0}
              onPress={() => void readAll()}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>
                {reading ? "Đang đọc ảnh..." : "Đọc ảnh và đối chiếu"}
              </Text>
            </Pressable>
          </View>
        )}

        {review && (
          <>
            <Text style={styles.section}>2. Kết quả đối chiếu</Text>
            {noLines ? (
              <Text style={styles.error}>
                Không đọc được dòng nào. Thử ảnh rõ hơn, hoặc chọn “Đã đặt đúng
                như đơn” ở mục Đặt hàng.
              </Text>
            ) : (
              <Text style={review.allOk ? styles.okBanner : styles.warnBanner}>
                {review.allOk
                  ? "Đã ổn: nhà cung cấp giao khớp đơn đã đặt."
                  : "Có chỗ chưa khớp, xem bên dưới. Đơn đã đặt không bị sửa."}
              </Text>
            )}

            {review.unknown.map((line, i) => (
              <View key={`u${i}`} style={styles.row}>
                <Text style={styles.name}>{line.name}</Text>
                <Text style={styles.meta}>
                  {line.qty} {line.unit} · tên này chưa biết là món nào
                </Text>
                {suggestItems(line.name, matchItems).map((it) => (
                  <Pressable
                    key={it.id}
                    style={[styles.suggest, !online && styles.disabled]}
                    disabled={!online}
                    onPress={() => void remember(line, it.id)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.suggestText}>→ {it.name}</Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[styles.secondary, !online && styles.disabled]}
                  disabled={!online}
                  onPress={() => setAsking(line)}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryText}>
                    Món khác… (nhớ cho lần sau)
                  </Text>
                </Pressable>
              </View>
            ))}

            {review.matched.length > 0 && (
              <>
                <Text style={styles.note}>
                  Tên nhà cung cấp đã khớp (đã nhớ hoặc đoán). Nhầm thì bấm Sửa
                </Text>
                {review.matched.map(({ line, itemId, via }, i) => (
                  <View key={`m${i}`} style={styles.row}>
                    <Text style={styles.name}>{line.name}</Text>
                    <Text style={styles.meta}>
                      → {nameOf(itemId)} · {via === "alias" ? "đã nhớ" : "đoán"}
                    </Text>
                    <Pressable
                      style={[styles.secondary, !online && styles.disabled]}
                      disabled={!online}
                      onPress={() => setAsking(line)}
                      accessibilityRole="button"
                      accessibilityLabel={`Sửa món khớp cho ${line.name}`}
                    >
                      <Text style={styles.secondaryText}>Sửa</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {review.unconvertible.map(({ line, itemId }, i) => (
              <View key={`c${i}`} style={styles.row}>
                <Text style={styles.name}>{nameOf(itemId)}</Text>
                <Text style={styles.warnText}>
                  Không quy đổi được “{line.qty} {line.unit}”: kiểm tra đơn vị
                  hoặc quy cách của món rồi so tay.
                </Text>
              </View>
            ))}

            {review.rows.map((r) => {
              const item = itemsById.get(r.itemId);
              const bad = r.status !== "ok";
              return (
                <View key={r.itemId} style={[styles.row, bad && styles.rowBad]}>
                  <Text style={styles.name}>{nameOf(r.itemId)}</Text>
                  <Text style={styles.meta}>
                    Đã đặt {formatItemQty(item, r.ordered)} · NCC{" "}
                    {formatItemQty(item, r.supplied)}
                  </Text>
                  <Text style={bad ? styles.warnText : styles.okText}>
                    {STATUS_TEXT[r.status]}
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal
        visible={asking !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setAsking(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{asking?.name} là món nào?</Text>
            <ScrollView>
              {itemsByGroup.map(({ group, items: groupList }) => (
                <View key={group.id}>
                  <Text style={styles.pickGroup}>{group.name}</Text>
                  {groupList.map((it) => (
                    <Pressable
                      key={it.id}
                      style={styles.pickRow}
                      onPress={() => asking && void remember(asking, it.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.name}>{it.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
            <Pressable
              style={styles.secondary}
              onPress={() => setAsking(null)}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Để sau</Text>
            </Pressable>
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
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: c.accentDeep,
    padding: 16,
    backgroundColor: c.accentSoft,
  },
  pad: { padding: 16, gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16 },
  chip: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: c.surface,
  },
  chipOn: { backgroundColor: c.accentDeep, borderColor: c.accentDeep },
  chipText: { fontSize: 15, color: c.ink, fontWeight: "600" },
  chipTextOn: { color: c.onAccent },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.accentSoft,
    backgroundColor: c.surface,
    gap: 4,
  },
  rowBad: { backgroundColor: c.amberSoft },
  name: { fontSize: 16, fontWeight: "600", color: c.ink },
  meta: { fontSize: 13, color: c.muted },
  note: { fontSize: 14, color: c.muted, padding: 16 },
  okText: { fontSize: 14, fontWeight: "600", color: c.green },
  warnText: { fontSize: 14, fontWeight: "600", color: c.amber },
  okBanner: {
    fontSize: 15,
    fontWeight: "700",
    color: c.green,
    backgroundColor: c.greenSoft,
    padding: 14,
  },
  warnBanner: {
    fontSize: 15,
    fontWeight: "700",
    color: c.amber,
    backgroundColor: c.amberSoft,
    padding: 14,
  },
  error: { color: c.red, fontSize: 14, textAlign: "center", padding: 8 },
  primary: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  secondary: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    backgroundColor: c.surface,
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
  secondaryText: { color: c.ink, fontSize: 16, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: SCRIM,
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    maxHeight: "85%",
    padding: 16,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: c.ink },
  suggest: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: c.accentSoft,
  },
  suggestText: { fontSize: 15, fontWeight: "600", color: c.accentDeep },
  pickGroup: {
    fontSize: 13,
    fontWeight: "700",
    color: c.accentDeep,
    paddingTop: 12,
  },
  pickRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.accentSoft,
    minHeight: 44,
    justifyContent: "center",
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library/legacy";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { Loading } from "../ui/Loading";
import { Text } from "../ui/Text";
import { TextInput } from "../ui/TextInput";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { captureRef } from "react-native-view-shot";
import { loadCatalog } from "../catalog/api";
import { compareGroups, compareItems } from "../catalog/sections";
import type { Tables } from "../lib/database.types";
import { loadMovements } from "../stock/api";
import { formatDate } from "../stock/date";
import { stockByItem } from "../stock/ledger";
import {
  loadBranchSheet,
  loadOrders,
  type OrderLineRow,
  type OrderRow,
} from "./api";
import {
  blankZero,
  orderSheetRows,
  rememberOrdererName,
  sheetModelFor,
  stockSheetCell,
} from "./exportSheet";
import { PaperSheet } from "./PaperSheet";
import { businessDay, incomingBefore, orderedOnDay } from "./orders";
import { loadReceivingData } from "./receivingApi";

type Props = { branchId: string; branchName: string };
type Kind = "order" | "stock";

const NAMES_KEY = "cys.orderer-names";

// Xuất ảnh theo mẫu tờ giấy: mỗi Nhóm một ảnh, lưu thẳng vào Thư viện ảnh của máy.
// shortcut: chỉ Android/iOS (chưa tải PNG trên web); chưa ghi người xuất.
export function ExportScreen({ branchId, branchName }: Props) {
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [received, setReceived] = useState<Set<string>>(() => new Set());
  const [branchSheet, setBranchSheet] = useState<unknown>(null);
  const { width: screenW } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState<Kind>("order");
  const [orderer, setOrderer] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null); // Nhóm đang mở bản xem trước
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shot = useRef<ComponentRef<typeof View>>(null);

  const fetchData = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [catalog, movs, ord, rec, bs] = await Promise.all([
        loadCatalog(branchId),
        loadMovements(branchId),
        loadOrders(branchId),
        loadReceivingData(branchId),
        loadBranchSheet(branchId),
      ]);
      setGroups([...catalog.groups].sort(compareGroups));
      setItems(catalog.items);
      setMovements(movs);
      setOrders(ord.orders);
      setLines(ord.lines);
      setReceived(rec.receivedLineIds);
      setBranchSheet(bs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void fetchData();
    AsyncStorage.getItem(NAMES_KEY)
      .then((raw) => {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const saved = Array.isArray(parsed)
          ? parsed.filter((n): n is string => typeof n === "string")
          : [];
        setNames(saved);
        setOrderer((o) => o || saved[0] || "");
      })
      .catch(() => undefined);
  }, [fetchData]);

  // Thông báo tự tắt sau vài giây.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);
  // Ngày D của ảnh = Ngày của đơn nếu đặt lúc này (đã Kiểm kho hôm nay thì là ngày mai).
  const countTimes = useMemo(
    () => movements.filter((m) => m.kind === "count").map((m) => m.created_at),
    [movements]
  );
  const day = businessDay(new Date().toISOString(), countTimes);
  const incoming = useMemo(
    () => incomingBefore(orders, lines, received, day, countTimes),
    [orders, lines, received, day, countTimes]
  );

  const group = groups.find((g) => g.id === target) ?? null;
  const groupItems = useMemo(
    () =>
      items
        .filter((i) => i.group_id === target && !i.is_hidden)
        .sort(compareItems),
    [items, target]
  );

  // Ô số lượng từng món (chuỗi như viết trên tờ). Cả hai ảnh ghi ngày D.
  const qtyByItem = useMemo((): Map<string, string> => {
    if (kind === "order") {
      const ordered = orderedOnDay(
        orders.filter((o) => o.group_id === target),
        lines,
        day,
        countTimes
      );
      const rows = orderSheetRows(groupItems, ordered);
      return new Map(groupItems.map((i, idx) => [i.id, rows[idx].qty]));
    }
    return new Map(
      groupItems.map((item) => {
        const lots = lotsByItem.get(item.id) ?? [];
        return [
          item.id,
          stockSheetCell({
            incoming: incoming.get(item.id) ?? 0,
            lots,
            trackMfg: item.track_mfg_date,
            caseSize: item.case_size,
            byPercent: item.record_by_percent,
            blankZero: blankZero(group?.sheet, item.sheet),
          }),
        ];
      })
    );
  }, [
    kind,
    target,
    orders,
    lines,
    day,
    countTimes,
    groupItems,
    lotsByItem,
    incoming,
    group,
  ]);
  const date = formatDate(day);

  const model = useMemo(
    () =>
      group
        ? sheetModelFor({
            kind,
            branchName,
            branchSheet,
            group,
            items: groupItems,
            qtyByItem,
          })
        : null,
    [group, kind, branchName, branchSheet, groupItems, qtyByItem]
  );

  // Chụp bảng đang mở trong khung và lưu vào Thư viện ảnh.
  const captureAndSave = async () => {
    if (!shot.current) throw new Error("no sheet");
    const uri = await captureRef(shot, {
      format: "png",
      quality: 1,
      width: 1240,
      height: 1754,
    });
    await MediaLibrary.saveToLibraryAsync(uri);
  };

  const rememberName = () => {
    if (kind !== "order") return;
    const next = rememberOrdererName(names, orderer);
    setNames(next);
    AsyncStorage.setItem(NAMES_KEY, JSON.stringify(next)).catch(
      () => undefined
    );
  };

  // all = lần lượt mọi Nhóm (mỗi Nhóm một ảnh); không thì chỉ Nhóm đang xem trước.
  const save = async (all: boolean) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        setMessage("Cần cho phép lưu ảnh vào Thư viện.");
        return;
      }
      if (all) {
        for (const g of groups) {
          setTarget(g.id);
          // shortcut: chờ cố định để bảng của Nhóm mới vẽ xong trước khi chụp.
          await new Promise((r) => setTimeout(r, 500));
          await captureAndSave();
        }
      } else {
        await captureAndSave();
      }
      rememberName();
      setMessage(
        all
          ? `Đã lưu ${groups.length} ảnh vào Thư viện.`
          : "Đã lưu ảnh vào Thư viện."
      );
    } catch (e) {
      setMessage(
        `Không lưu được ảnh: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      if (all) setTarget(null);
      setBusy(false);
    }
  };

  if (loading) return <Loading />;
  if (error)
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Không tải được dữ liệu.</Text>
        <Pressable style={styles.primary} onPress={() => void fetchData()}>
          <Text style={styles.primaryText}>Thử lại</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.container}>
      <View style={styles.kindRow}>
        {(["order", "stock"] as const).map((k) => (
          <Pressable
            key={k}
            style={[styles.kind, kind === k && styles.kindOn]}
            onPress={() => {
              setKind(k);
              setMessage(null);
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.kindText, kind === k && styles.kindTextOn]}>
              {k === "order" ? "Đơn đặt hàng" : "Tồn kho dự tính"}
            </Text>
          </Pressable>
        ))}
      </View>

      {kind === "order" ? (
        <View style={styles.pad}>
          <Text style={styles.label}>Người đặt hàng</Text>
          <TextInput
            style={styles.input}
            value={orderer}
            onChangeText={setOrderer}
            placeholder="Tên người đặt hàng"
          />
          <View style={styles.chips}>
            {names.map((n) => (
              <Pressable
                key={n}
                style={styles.chip}
                onPress={() => setOrderer(n)}
              >
                <Text style={styles.chipText}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.pad}>
        <Pressable
          style={styles.primary}
          onPress={() => void save(true)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>
            {busy
              ? "Đang lưu..."
              : `Xuất ${groups.length} ảnh ${kind === "order" ? "Đơn đặt hàng" : "Tồn kho dự tính"} vào Thư viện`}
          </Text>
        </Pressable>
        {message && !group ? <Text style={styles.error}>{message}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.pad}>
        {groups.map((g) => (
          <Pressable
            key={g.id}
            style={styles.groupBtn}
            onPress={() => {
              setMessage(null);
              setTarget(g.id);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.groupText}>Xem trước: {g.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Modal
        visible={!!group}
        animationType="slide"
        onRequestClose={() => setTarget(null)}
      >
        <View style={styles.modal}>
          <ScrollView>
            {model ? (
              <View style={styles.paperWrap}>
                <PaperSheet
                  shotRef={shot}
                  model={model}
                  date={date}
                  orderer={kind === "order" ? orderer.trim() : ""}
                  width={Math.min(screenW - 24, 560)}
                />
              </View>
            ) : null}
          </ScrollView>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.secondary, styles.half]}
              onPress={() => setTarget(null)}
            >
              <Text style={styles.secondaryText}>Đóng</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, styles.half]}
              onPress={() => void save(false)}
              disabled={busy}
            >
              <Text style={styles.primaryText}>
                {busy ? "Đang lưu..." : "Lưu ảnh này"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = themedStyles((c: Palette) => ({
  paperWrap: { alignItems: "center", paddingVertical: 12 },
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  pad: { padding: 16, gap: 8 },
  kindRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 },
  kind: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  kindOn: { backgroundColor: c.accentDeep, borderColor: c.accentDeep },
  kindText: { fontSize: 15, fontWeight: "600", color: c.ink },
  kindTextOn: { color: c.onAccent },
  label: { fontSize: 14, fontWeight: "600", color: c.ink },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    color: c.ink,
    backgroundColor: c.surface,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.accentDeep,
    backgroundColor: c.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  chipText: { fontSize: 14, color: c.ink },
  groupBtn: {
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  groupText: { fontSize: 16, fontWeight: "600", color: c.accentDeep },
  error: { color: c.red, fontSize: 14, textAlign: "center", padding: 8 },
  modal: { flex: 1, backgroundColor: c.bg, paddingTop: 40 },
  btnRow: { flexDirection: "row", gap: 8, padding: 16 },
  half: { flex: 1 },
  primary: {
    backgroundColor: c.accentDeep,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
  secondary: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: c.surface,
  },
  secondaryText: { color: c.ink, fontSize: 16, fontWeight: "600" },
}));

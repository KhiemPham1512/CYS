import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import { loadCatalog } from "../catalog/api";
import { compareGroups, compareItems } from "../catalog/sections";
import type { Tables } from "../lib/database.types";
import { loadMovements } from "../stock/api";
import { formatDate } from "../stock/date";
import { localDate, stockByItem, totalQty } from "../stock/ledger";
import { loadOrders, type OrderLineRow, type OrderRow } from "./api";
import {
  orderSheetRows,
  rememberOrdererName,
  stockSheetCell,
  type SheetRow,
} from "./exportSheet";
import { incomingByItem, sheetQtyByItem } from "./orders";
import { loadReceivingData } from "./receivingApi";

type Props = { branchId: string; branchName: string };
type Kind = "order" | "stock";

const NAMES_KEY = "cys.orderer-names";

// Xuáº¥t áº£nh theo máº«u tá» giáº¥y: má»—i NhÃ³m má»™t áº£nh, chia sáº» qua báº£ng chia sáº» cá»§a mÃ¡y (Zalo, ThÆ° viá»‡n...).
// shortcut: chá»‰ Android/iOS qua báº£ng chia sáº», chÆ°a táº£i PNG trÃªn web; chÆ°a ghi ngÆ°á»i xuáº¥t.
export function ExportScreen({ branchId, branchName }: Props) {
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [received, setReceived] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState<Kind>("order");
  const [orderer, setOrderer] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null); // NhÃ³m Ä‘ang má»Ÿ báº£n xem trÆ°á»›c
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shot = useRef<ComponentRef<typeof View>>(null);

  const fetchData = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [catalog, movs, ord, rec] = await Promise.all([
        loadCatalog(branchId),
        loadMovements(branchId),
        loadOrders(branchId),
        loadReceivingData(branchId),
      ]);
      setGroups([...catalog.groups].sort(compareGroups));
      setItems(catalog.items);
      setMovements(movs);
      setOrders(ord.orders);
      setLines(ord.lines);
      setReceived(rec.receivedLineIds);
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

  const lotsByItem = useMemo(() => stockByItem(movements), [movements]);
  const incoming = useMemo(
    () => incomingByItem(orders, lines, received),
    [orders, lines, received]
  );

  const group = groups.find((g) => g.id === target) ?? null;
  const groupItems = useMemo(
    () =>
      items
        .filter((i) => i.group_id === target && !i.is_hidden)
        .sort(compareItems),
    [items, target]
  );

  const today = formatDate(localDate(new Date().toISOString()));
  const { rows, date } = useMemo((): { rows: SheetRow[]; date: string } => {
    if (kind === "order") {
      const sheet = sheetQtyByItem(
        orders.filter((o) => o.group_id === target && o.placed_at !== null),
        lines,
        received
      );
      return {
        rows: orderSheetRows(groupItems, sheet.qty),
        date: sheet.placedAt ? formatDate(localDate(sheet.placedAt)) : today,
      };
    }
    const base = orderSheetRows(groupItems, new Map());
    return {
      rows: base.map((row, idx) => {
        const item = groupItems[idx];
        const lots = lotsByItem.get(item.id) ?? [];
        const dated = lots.flatMap((l) => (l.mfgDate ? [l.mfgDate] : []));
        return {
          ...row,
          qty: stockSheetCell({
            incoming: incoming.get(item.id) ?? 0,
            actual: totalQty(lots),
            lastMfg: dated.sort().at(-1) ?? null,
            trackMfg: item.track_mfg_date,
            caseSize: item.case_size,
            byPercent: item.record_by_percent,
          }),
        };
      }),
      date: today,
    };
  }, [
    kind,
    target,
    orders,
    lines,
    received,
    groupItems,
    lotsByItem,
    incoming,
    today,
  ]);

  // Chá»¥p báº£ng Ä‘ang má»Ÿ trong khung vÃ  lÆ°u vÃ o ThÆ° viá»‡n áº£nh.
  const captureAndSave = async () => {
    if (!shot.current) throw new Error("no sheet");
    const uri = await captureRef(shot, { format: "png", quality: 1 });
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

  // count = sá»‘ áº£nh cáº§n lÆ°u: má»™t NhÃ³m Ä‘ang xem, hoáº·c láº§n lÆ°á»£t má»i NhÃ³m (má»—i NhÃ³m má»™t áº£nh).
  const save = async (all: boolean) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        setMessage("Cáº§n cho phÃ©p lÆ°u áº£nh vÃ o ThÆ° viá»‡n.");
        return;
      }
      if (all) {
        for (const g of groups) {
          setTarget(g.id);
          // shortcut: chá» cá»‘ Ä‘á»‹nh Ä‘á»ƒ báº£ng cá»§a NhÃ³m má»›i váº½ xong trÆ°á»›c khi chá»¥p.
          await new Promise((r) => setTimeout(r, 500));
          await captureAndSave();
        }
      } else {
        await captureAndSave();
      }
      rememberName();
      setMessage(
        all
          ? `ÄÃ£ lÆ°u ${groups.length} áº£nh vÃ o ThÆ° viá»‡n.`
          : "ÄÃ£ lÆ°u áº£nh vÃ o ThÆ° viá»‡n."
      );
    } catch {
      setMessage("KhÃ´ng lÆ°u Ä‘Æ°á»£c áº£nh, thá»­ láº¡i.");
    } finally {
      if (all) setTarget(null);
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (error)
    return (
      <View style={styles.center}>
        <Text style={styles.error}>KhÃ´ng táº£i Ä‘Æ°á»£c dá»¯ liá»‡u.</Text>
        <Pressable style={styles.primary} onPress={() => void fetchData()}>
          <Text style={styles.primaryText}>Thá»­ láº¡i</Text>
        </Pressable>
      </View>
    );

  const title = kind === "order" ? "Äáº¶T HÃ€NG" : "Tá»’N KHO Dá»° TÃNH";
  return (
    <View style={styles.container}>
      <View style={styles.kindRow}>
        {(["order", "stock"] as const).map((k) => (
          <Pressable
            key={k}
            style={[styles.kind, kind === k && styles.kindOn]}
            onPress={() => setKind(k)}
            accessibilityRole="button"
          >
            <Text style={[styles.kindText, kind === k && styles.kindTextOn]}>
              {k === "order" ? "ÄÆ¡n Ä‘áº·t hÃ ng" : "Tá»“n kho dá»± tÃ­nh"}
            </Text>
          </Pressable>
        ))}
      </View>

      {kind === "order" ? (
        <View style={styles.pad}>
          <Text style={styles.label}>NgÆ°á»i Ä‘áº·t hÃ ng</Text>
          <TextInput
            style={styles.input}
            value={orderer}
            onChangeText={setOrderer}
            placeholder="TÃªn ngÆ°á»i Ä‘áº·t hÃ ng"
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
              ? "Äang lÆ°u..."
              : `Xuáº¥t ${groups.length} áº£nh ${kind === "order" ? "ÄÆ¡n Ä‘áº·t hÃ ng" : "Tá»“n kho dá»± tÃ­nh"} vÃ o ThÆ° viá»‡n`}
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
            <Text style={styles.groupText}>Xuáº¥t áº£nh: {g.name}</Text>
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
            <View ref={shot} collapsable={false} style={styles.paper}>
              <Text style={styles.paperBranch}>{branchName}</Text>
              <Text style={styles.paperTitle}>{title}</Text>
              <Text style={styles.paperSub}>{group?.name}</Text>
              <Text style={styles.paperMeta}>
                NgÃ y: {date}
                {kind === "order" && orderer.trim()
                  ? `    NgÆ°á»i Ä‘áº·t hÃ ng: ${orderer.trim()}`
                  : ""}
              </Text>
              <View style={[styles.tr, styles.thRow]}>
                <Text style={[styles.cell, styles.stt, styles.th]}>STT</Text>
                <Text style={[styles.cell, styles.name, styles.th]}>
                  TÃªn nguyÃªn váº­t liá»‡u
                </Text>
                <Text style={[styles.cell, styles.unit, styles.th]}>
                  ÄÆ¡n vá»‹
                </Text>
                <Text style={[styles.cell, styles.qty, styles.th]}>
                  {kind === "order" ? "Sá»‘ lÆ°á»£ng" : "Tá»“n"}
                </Text>
              </View>
              {rows.map((r) => (
                <View key={r.stt} style={styles.tr}>
                  <Text style={[styles.cell, styles.stt]}>{r.stt}</Text>
                  <Text style={[styles.cell, styles.name]}>
                    {r.name}
                    {r.name_zh ? ` (${r.name_zh})` : ""}
                  </Text>
                  <Text style={[styles.cell, styles.unit]}>{r.unit}</Text>
                  <Text style={[styles.cell, styles.qty, styles.qtyText]}>
                    {r.qty}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.secondary, styles.half]}
              onPress={() => setTarget(null)}
            >
              <Text style={styles.secondaryText}>ÄÃ³ng</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, styles.half]}
              onPress={() => void save(false)}
              disabled={busy}
            >
              <Text style={styles.primaryText}>
                {busy ? "Äang lÆ°u..." : "LÆ°u áº£nh nÃ y"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const BORDER = "#a1a1aa";
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  pad: { padding: 16, gap: 8 },
  kindRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 },
  kind: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  kindOn: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  kindText: { fontSize: 15, fontWeight: "600", color: "#18181b" },
  kindTextOn: { color: "#fff" },
  label: { fontSize: 14, fontWeight: "600", color: "#27272a" },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { fontSize: 14, color: "#18181b" },
  groupBtn: {
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 8,
    padding: 14,
    minHeight: 44,
    justifyContent: "center",
  },
  groupText: { fontSize: 16, fontWeight: "600", color: "#0f766e" },
  error: { color: "#b91c1c", fontSize: 14, textAlign: "center", padding: 8 },
  modal: { flex: 1, backgroundColor: "#f4f4f5", paddingTop: 40 },
  paper: { backgroundColor: "#fff", paddingVertical: 12 },
  paperBranch: { fontSize: 13, color: "#52525b", textAlign: "center" },
  paperTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#18181b",
    textAlign: "center",
  },
  paperSub: {
    fontSize: 15,
    color: "#52525b",
    textAlign: "center",
    marginBottom: 6,
  },
  paperMeta: { fontSize: 14, paddingHorizontal: 8, paddingBottom: 6 },
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
    paddingVertical: 8,
    paddingHorizontal: 6,
    fontSize: 14,
    color: "#18181b",
    minHeight: 40,
  },
  th: { fontWeight: "700", textAlign: "center" },
  stt: { width: 44, textAlign: "center" },
  name: { flex: 1 },
  unit: { width: 64, textAlign: "center" },
  qty: { width: 96, textAlign: "center" },
  qtyText: { fontWeight: "700", color: "#1d4ed8" },
  btnRow: { flexDirection: "row", gap: 8, padding: 16 },
  half: { flex: 1 },
  primary: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondary: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    backgroundColor: "#fff",
  },
  secondaryText: { color: "#18181b", fontSize: 16, fontWeight: "600" },
});

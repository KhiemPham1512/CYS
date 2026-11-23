import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { Tables } from "../lib/database.types";
import { useOnline } from "../lib/useOnline";
import { loadMemberEmails, loadMovements } from "../stock/api";
import {
  localDate,
  localTime,
  rollbackBatches,
  rollbackPreview,
  VN_OFFSET_MS,
} from "../stock/ledger";
import type { Palette } from "../theme/themes";
import { themedStyles } from "../theme/themedStyles";
import { confirmAction } from "../ui/confirm";
import { Loading } from "../ui/Loading";
import { Text } from "../ui/Text";
import { TextInput } from "../ui/TextInput";
import {
  parseCutoff,
  resetBranchActivity,
  restoreRollback,
  rollbackStock,
} from "./devTools";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function formatCutoffLabel(iso: string): string {
  const d = localDate(iso); // yyyy-mm-dd
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${localTime(iso)}`;
}

// 00:00 giờ Việt Nam của ngày cách nowIso dayOffset ngày, trả về ISO UTC.
function vnDayStartIso(nowIso: string, dayOffset: number): string {
  const vn = Date.parse(nowIso) + VN_OFFSET_MS;
  const vnStart = vn - (((vn % DAY_MS) + DAY_MS) % DAY_MS) + dayOffset * DAY_MS;
  return new Date(vnStart - VN_OFFSET_MS).toISOString();
}

export function DevScreen({
  branchId,
  branchName,
  onExit,
}: {
  branchId: string;
  branchName: string;
  onExit: () => void;
}) {
  const online = useOnline();
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [members, setMembers] = useState<{ id: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [cutoffText, setCutoffText] = useState(() =>
    formatCutoffLabel(new Date(Date.now() - HOUR_MS).toISOString())
  );
  const [actorId, setActorId] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    try {
      const [movs, emailMap] = await Promise.all([
        loadMovements(branchId),
        loadMemberEmails(branchId),
      ]);
      setMovements(movs);
      setMembers([...emailMap.entries()].map(([id, email]) => ({ id, email })));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    void fetchData();
  }, [fetchData]);

  const nowIso = new Date().toISOString();
  const cutoffIso = useMemo(
    () => parseCutoff(cutoffText, nowIso),
    [cutoffText, nowIso]
  );
  const cutoffLabel = cutoffIso ? formatCutoffLabel(cutoffIso) : null;

  const previewCount = useMemo(
    () => (cutoffIso ? rollbackPreview(movements, cutoffIso, actorId) : 0),
    [movements, cutoffIso, actorId]
  );

  const batches = useMemo(() => rollbackBatches(movements), [movements]);

  const applyQuickCutoff = (kind: "1h" | "today" | "yesterday") => {
    const now = new Date().toISOString();
    const iso =
      kind === "1h"
        ? new Date(Date.parse(now) - HOUR_MS).toISOString()
        : kind === "today"
          ? vnDayStartIso(now, 0)
          : vnDayStartIso(now, -1);
    setCutoffText(formatCutoffLabel(iso));
    setStatusMsg(null);
    setErrorMsg(null);
  };

  const runRollback = () => {
    if (
      !online ||
      busyRef.current ||
      !cutoffIso ||
      !cutoffLabel ||
      previewCount === 0
    )
      return;
    const countToCancel = previewCount;
    const targetIso = cutoffIso;
    const targetActor = actorId;
    confirmAction({
      title: "Quay lại sổ kho?",
      message: `Hủy ${countToCancel} dòng ghi từ ${cutoffLabel}. Khôi phục lại được.`,
      confirmText: "Quay lại",
      destructive: true,
      onConfirm: () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setStatusMsg(null);
        setErrorMsg(null);
        void (async () => {
          try {
            const res = await rollbackStock(branchId, targetIso, targetActor);
            if (res.error) {
              setErrorMsg(res.error);
            } else {
              setStatusMsg(`Đã hủy ${res.count ?? countToCancel} dòng`);
              await fetchData();
            }
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        })();
      },
    });
  };

  const runRestore = (batchId: string, label: string, count: number) => {
    if (!online || busyRef.current) return;
    confirmAction({
      title: "Khôi phục lần quay lại?",
      message: `Khôi phục ${count} dòng (${label}).`,
      confirmText: "Khôi phục",
      onConfirm: () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setStatusMsg(null);
        setErrorMsg(null);
        void (async () => {
          try {
            const res = await restoreRollback(branchId, batchId);
            if (res.error) {
              setErrorMsg(res.error);
            } else {
              setStatusMsg(`Đã khôi phục ${res.count ?? count} dòng`);
              await fetchData();
            }
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        })();
      },
    });
  };

  const canReset = online && !busy && confirmName === branchName;

  const runReset = () => {
    if (!online || busyRef.current || confirmName !== branchName) return;
    const typed = confirmName;
    confirmAction({
      title: "Xóa dữ liệu phát sinh?",
      message: `Xóa toàn bộ dữ liệu phát sinh của ${branchName}. Không hoàn tác được.`,
      confirmText: "Xóa dữ liệu phát sinh",
      destructive: true,
      onConfirm: () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setStatusMsg(null);
        setErrorMsg(null);
        void (async () => {
          try {
            const res = await resetBranchActivity(branchId, typed);
            if (res.error) {
              setErrorMsg(res.error);
            } else {
              setConfirmName("");
              setStatusMsg("Đã xóa dữ liệu phát sinh.");
              await fetchData();
            }
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        })();
      },
    });
  };

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

  const rollbackDisabled = !online || busy || !cutoffIso || previewCount === 0;

  return (
    <View style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.warnBanner}>
          <Text style={styles.warnBannerText}>
            Chế độ phát triển. Tắt app mở lại là thoát.
          </Text>
          <Pressable
            style={styles.secondary}
            onPress={onExit}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Thoát chế độ</Text>
          </Pressable>
        </View>

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        {statusMsg ? <Text style={styles.okBanner}>{statusMsg}</Text> : null}

        <Text style={styles.section}>Quay lại sổ kho</Text>
        <View style={styles.pad}>
          <View style={styles.chips}>
            <Pressable
              style={styles.chip}
              onPress={() => applyQuickCutoff("1h")}
              accessibilityRole="button"
            >
              <Text style={styles.chipText}>1 giờ trước</Text>
            </Pressable>
            <Pressable
              style={styles.chip}
              onPress={() => applyQuickCutoff("today")}
              accessibilityRole="button"
            >
              <Text style={styles.chipText}>Đầu hôm nay (0h)</Text>
            </Pressable>
            <Pressable
              style={styles.chip}
              onPress={() => applyQuickCutoff("yesterday")}
              accessibilityRole="button"
            >
              <Text style={styles.chipText}>Đầu hôm qua (0h)</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>
            Mốc thời gian{cutoffLabel ? `: ${cutoffLabel}` : ""}
          </Text>
          <TextInput
            style={styles.input}
            value={cutoffText}
            onChangeText={(t) => {
              setCutoffText(t);
              setStatusMsg(null);
              setErrorMsg(null);
            }}
            placeholder="dd/mm hh:mm"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Người thao tác</Text>
          <View style={styles.chips}>
            <Pressable
              style={[styles.chip, actorId === null && styles.chipOn]}
              onPress={() => setActorId(null)}
              accessibilityRole="button"
            >
              <Text
                style={[styles.chipText, actorId === null && styles.chipTextOn]}
              >
                Tất cả
              </Text>
            </Pressable>
            {members.map((m) => {
              const on = actorId === m.id;
              return (
                <Pressable
                  key={m.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setActorId(m.id)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {m.email}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.preview}>Sẽ hủy {previewCount} dòng</Text>
          <Pressable
            style={[styles.primary, rollbackDisabled && styles.disabled]}
            disabled={rollbackDisabled}
            onPress={runRollback}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Quay lại</Text>
          </Pressable>
          <Text style={styles.note}>Không gồm Nhận hàng và Trả hàng hư.</Text>
        </View>

        <Text style={styles.section}>Các lần quay lại</Text>
        <View style={styles.pad}>
          {batches.length === 0 ? (
            <Text style={styles.note}>Chưa có lần quay lại nào.</Text>
          ) : (
            batches.map((b) => {
              const label = formatCutoffLabel(b.at);
              return (
                <View key={b.batchId} style={styles.batchRow}>
                  <Text style={styles.batchText}>
                    {label} · {b.count} dòng
                  </Text>
                  <Pressable
                    style={[
                      styles.secondary,
                      (!online || busy) && styles.disabled,
                    ]}
                    disabled={!online || busy}
                    onPress={() => runRestore(b.batchId, label, b.count)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.secondaryText}>Khôi phục</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.dangerSection}>Xóa dữ liệu phát sinh</Text>
        <View style={styles.dangerBox}>
          <Text style={styles.dangerNote}>
            Xóa sổ kho, đơn hàng, nhận hàng, hàng thiếu, đang dùng, lượt đọc ảnh
            và nhật ký. Giữ Danh mục, Nhóm, thành viên, dữ liệu in. Không hoàn
            tác được.
          </Text>
          <Text style={styles.label}>Gõ đúng tên Chi nhánh để xác nhận</Text>
          <TextInput
            style={styles.input}
            value={confirmName}
            onChangeText={setConfirmName}
            placeholder="Gõ đúng tên Chi nhánh để xác nhận"
          />
          <Pressable
            style={[styles.dangerBtn, !canReset && styles.disabled]}
            disabled={!canReset}
            onPress={runReset}
            accessibilityRole="button"
          >
            <Text style={styles.dangerBtnText}>Xóa dữ liệu phát sinh</Text>
          </Pressable>
        </View>
      </ScrollView>
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
  warnBanner: {
    backgroundColor: c.amberSoft,
    padding: 16,
    gap: 10,
  },
  warnBannerText: {
    fontSize: 15,
    fontWeight: "700",
    color: c.amber,
  },
  okBanner: {
    fontSize: 15,
    fontWeight: "700",
    color: c.green,
    backgroundColor: c.greenSoft,
    padding: 14,
    textAlign: "center",
  },
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: c.accentDeep,
    padding: 16,
    backgroundColor: c.accentSoft,
  },
  dangerSection: {
    fontSize: 16,
    fontWeight: "700",
    color: c.red,
    padding: 16,
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.red,
  },
  pad: { padding: 16, gap: 10 },
  dangerBox: {
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: c.red,
    margin: 16,
    marginTop: 0,
    borderRadius: 14,
    backgroundColor: c.surface,
  },
  dangerNote: { fontSize: 14, color: c.red },
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
  chipText: { fontSize: 14, color: c.ink, fontWeight: "600" },
  chipTextOn: { color: c.onAccent },
  preview: { fontSize: 15, fontWeight: "700", color: c.ink },
  note: { fontSize: 13, color: c.muted },
  batchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  batchText: { fontSize: 15, fontWeight: "600", color: c.ink, flex: 1 },
  error: { color: c.red, fontSize: 14, textAlign: "center", padding: 8 },
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    backgroundColor: c.surface,
  },
  secondaryText: { color: c.ink, fontSize: 15, fontWeight: "600" },
  dangerBtn: {
    backgroundColor: c.red,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  dangerBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
}));

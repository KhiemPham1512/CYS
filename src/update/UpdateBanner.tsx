import { useEffect, useState } from "react";
import { AppState, Platform, Pressable, View } from "react-native";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import {
  checkForUpdate,
  cleanupDownloaded,
  downloadAndInstall,
} from "./updater";
import type { LatestVersion } from "./version";

// Android: có bản APK mới thì báo và cho tải + cài đè ngay trong app. Kiểm khi mở app và mỗi lần quay lại app.
export function UpdateBanner() {
  const [latest, setLatest] = useState<LatestVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const check = () =>
      void checkForUpdate().then((r) => {
        if (r === null) return; // không kiểm được: giữ nguyên thanh đang hiện (nếu có)
        if (r === "current") {
          setLatest(null);
          cleanupDownloaded(); // đã lên bản mới nhất: xóa file APK đã tải
        } else setLatest(r);
      });
    check();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    return () => sub.remove();
  }, []);

  if (!latest) return null;

  const download = async () => {
    setBusy(true);
    setError(null);
    const res = await downloadAndInstall(latest);
    setBusy(false);
    setError(res.error); // huỷ cài thì thanh vẫn còn để bấm lại
  };

  return (
    <View style={styles.bar} accessibilityRole="alert">
      <View style={styles.textCol}>
        <Text style={styles.title}>Có bản mới {latest.versionName}</Text>
        {latest.notes ? <Text style={styles.notes}>{latest.notes}</Text> : null}
        <Text style={styles.notes}>
          Lần đầu Android hỏi cho phép cài từ nguồn này: bật cho phép, quay lại
          rồi bấm Tải bản mới lần nữa.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <Pressable
        style={[styles.button, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void download()}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>
          {busy ? "Đang tải…" : "Tải bản mới"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c: Palette) => ({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: c.accentSoft,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "600", color: c.ink },
  notes: { fontSize: 13, color: c.muted },
  error: { fontSize: 13, color: c.red },
  button: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: "center",
    backgroundColor: c.accentDeep,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: c.onAccent, fontSize: 15, fontWeight: "600" },
}));

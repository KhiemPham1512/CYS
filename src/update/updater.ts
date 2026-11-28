import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import { startActivityAsync } from "expo-intent-launcher";
import { Platform } from "react-native";
import {
  apkUrl,
  isNewer,
  latestUrl,
  parseLatest,
  type LatestVersion,
} from "./version";

// Một file cố định trong cache: tải bản mới ghi đè lần trước, không dồn nhiều APK chiếm bộ nhớ.
const downloaded = () => new File(Paths.cache, "cys-update.apk");

// Chỉ Android (APK ngoài Play Store). "current" = đã là bản mới nhất; null = không biết (lỗi mạng/JSON hỏng), không làm phiền.
export async function checkForUpdate(): Promise<
  LatestVersion | "current" | null
> {
  if (Platform.OS !== "android") return null;
  try {
    const res = await fetch(latestUrl(), { cache: "no-store" });
    if (!res.ok) return null;
    const latest = parseLatest(await res.json());
    if (!latest) return null;
    return isNewer(latest, Application.nativeBuildVersion) ? latest : "current";
  } catch {
    return null;
  }
}

export async function downloadAndInstall(
  latest: LatestVersion
): Promise<{ error: string | null }> {
  let file: File;
  try {
    file = await File.downloadFileAsync(
      apkUrl(latest.versionCode),
      downloaded(),
      {
        idempotent: true,
      }
    );
  } catch {
    return { error: "Không tải được bản mới. Kiểm tra mạng rồi thử lại." };
  }
  try {
    // Cài đè lên app cũ (cùng khóa ký) nên không mất nháp; lần đầu Android hỏi cho phép cài từ nguồn này.
    await startActivityAsync("android.intent.action.VIEW", {
      data: file.contentUri,
      type: "application/vnd.android.package-archive",
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION: trình cài đọc được file trong cache của app
    });
    return { error: null };
  } catch {
    return {
      error: "Đã tải xong nhưng không mở được màn cài. Bấm lại để thử.",
    };
  }
}

// Đã lên bản mới nhất: xóa file APK đã tải để trả lại bộ nhớ.
export function cleanupDownloaded(): void {
  if (Platform.OS !== "android") return;
  try {
    const file = downloaded();
    if (file.exists) file.delete();
  } catch {
    // dọn không được thì lần tải sau vẫn ghi đè cùng file
  }
}

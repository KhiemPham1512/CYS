import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import { createDownloadResumable } from "expo-file-system/legacy";
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

// Trình cài hệ thống, gọi đích danh để không hiện hộp "Mở bằng" có app lạ (TeraBox, ASTRO...);
// máy không có bản Google thì thử bản AOSP, cuối cùng để Android tự chọn.
const INSTALLERS: (string | undefined)[] = [
  "com.google.android.packageinstaller",
  "com.android.packageinstaller",
  undefined,
];

// onProgress: 0..1 (máy chậm ~1 phút cho 24 MB, không có % thì trông như treo).
export async function downloadAndInstall(
  latest: LatestVersion,
  onProgress: (ratio: number) => void
): Promise<{ error: string | null }> {
  const file = downloaded();
  try {
    // Ghi đè cùng một file; mất mạng giữa chừng thì báo lỗi, lần bấm sau tải lại từ đầu.
    const res = await createDownloadResumable(
      apkUrl(latest.versionCode),
      file.uri,
      {},
      (p) => {
        if (p.totalBytesExpectedToWrite > 0)
          onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    ).downloadAsync();
    if (!res || res.status !== 200) throw new Error(`HTTP ${res?.status}`);
  } catch {
    cleanupDownloaded(); // file tải dở: xóa, không để chiếm bộ nhớ tới lần sau
    return { error: "Không tải được bản mới. Kiểm tra mạng rồi thử lại." };
  }
  for (const packageName of INSTALLERS) {
    try {
      // Cài đè lên app cũ (cùng khóa ký) nên không mất nháp; lần đầu Android hỏi cho phép cài từ nguồn này.
      await startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
        data: file.contentUri,
        type: "application/vnd.android.package-archive",
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION: trình cài đọc được file trong cache của app
        ...(packageName && {
          packageName,
          className: "com.android.packageinstaller.InstallStart",
        }),
      });
      return { error: null };
    } catch {
      // không có trình cài này: thử cái kế
    }
  }
  return { error: "Đã tải xong nhưng không mở được màn cài. Bấm lại để thử." };
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

// Đăng bản APK mới cho app Android tự báo cập nhật (bucket app-releases, migration 20261128120000).
// Dùng (từ gốc repo, sau scripts/build-apk.ps1):  node scripts/publish-apk.mjs "Ghi chú bản mới"
// Đọc .env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, CYS_EMAIL, CYS_PASSWORD (Quản trị cấp cao).
// Tải cys.apk TRƯỚC rồi mới latest.json: máy đang kiểm không thấy số bản mới khi file chưa lên xong.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [
      l.slice(0, l.indexOf("=")),
      l
        .slice(l.indexOf("=") + 1)
        .trim()
        .replace(/^(["'])(.*)\1$/, "$2"), // bỏ nháy bao quanh nếu có
    ])
);
const versionName = JSON.parse(readFileSync("app.json", "utf8")).expo.version;
const gradle = readFileSync("android/app/build.gradle", "utf8");
const versionCode = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
if (
  !Number.isInteger(versionCode) ||
  !/versionName\s+"([^"]+)"/.exec(gradle)?.[1]?.startsWith(versionName)
) {
  throw new Error(`build.gradle lệch app.json (versionName ${versionName})`);
}
const apkPath = `.local-artifacts/release/cys-${versionName}.apk`;
const apk = readFileSync(apkPath);
const notes = process.argv[2] ?? "";

const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: false },
  }
);
const { error: loginError } = await supabase.auth.signInWithPassword({
  email: env.CYS_EMAIL,
  password: env.CYS_PASSWORD,
});
if (loginError) throw new Error(`Đăng nhập cấp cao lỗi: ${loginError.message}`);

const bucket = supabase.storage.from("app-releases");
const up = async (path, body, contentType) => {
  const { error } = await bucket.upload(path, body, {
    contentType,
    upsert: true,
    cacheControl: "60",
  });
  if (error) throw new Error(`Tải ${path} lỗi: ${error.message}`);
};
await up("cys.apk", apk, "application/vnd.android.package-archive");
await up(
  "latest.json",
  JSON.stringify({ versionCode, versionName, notes }),
  "application/json"
);
console.log(
  `OK: ${versionName} (versionCode ${versionCode}), ${(apk.length / 1048576).toFixed(1)} MB`
);
console.log(bucket.getPublicUrl("latest.json").data.publicUrl);

export interface LatestVersion {
  versionCode: number;
  versionName: string;
  notes: string;
}

export const UPDATE_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/app-releases`;

export function latestUrl(): string {
  return `${UPDATE_BASE}/latest.json?t=${Date.now()}`;
}

// ?v= theo bản: CDN không trả cys.apk cũ còn trong cache sau khi vừa ghi đè.
export function apkUrl(versionCode: number): string {
  return `${UPDATE_BASE}/cys.apk?v=${versionCode}`;
}

export function parseLatest(json: unknown): LatestVersion | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return null;
  }
  const { versionCode, versionName, notes } = json as Record<string, unknown>;
  if (
    typeof versionCode !== "number" ||
    !Number.isInteger(versionCode) ||
    versionCode <= 0
  ) {
    return null;
  }
  if (typeof versionName !== "string" || versionName.length === 0) {
    return null;
  }
  if (notes !== undefined && typeof notes !== "string") {
    return null;
  }
  return {
    versionCode,
    versionName,
    notes: notes ?? "",
  };
}

export function isNewer(
  latest: { versionCode: number } | null,
  installed: string | null
): boolean {
  if (!latest || !installed || !/^\d+$/.test(installed)) {
    return false;
  }
  const installedCode = Number.parseInt(installed, 10);
  if (!Number.isInteger(installedCode)) {
    return false;
  }
  return latest.versionCode > installedCode;
}

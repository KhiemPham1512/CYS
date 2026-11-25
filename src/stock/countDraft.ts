import AsyncStorage from "@react-native-async-storage/async-storage";

// Nháp Kiểm kho lưu trên máy (số đang gõ, chưa bấm Lưu). Không ghi vào sổ kho: Kiểm kho là số tuyệt đối,
// ghi sớm sẽ đổi tồn và đẩy Ngày của đơn khi nhân viên chưa kiểm xong.
export const countDraftKey = (branchId: string) => `count-draft:${branchId}`;

export const DRAFT_MAX_AGE_MS = 36 * 3_600_000;

// Đọc nháp từ chuỗi đã lưu; hỏng, quá hạn hay rỗng thì trả null.
export function parseCountDraft(
  raw: string | null,
  now: number
): Record<string, string> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { at?: unknown; inputs?: unknown };
    if (typeof v.at !== "number" || now - v.at > DRAFT_MAX_AGE_MS) return null;
    if (!v.inputs || typeof v.inputs !== "object") return null;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v.inputs)) {
      if (typeof val === "string" && val.trim()) out[k] = val;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function loadCountDraft(branchId: string) {
  try {
    return parseCountDraft(
      await AsyncStorage.getItem(countDraftKey(branchId)),
      Date.now()
    );
  } catch {
    return null;
  }
}

// Rỗng thì xóa nháp. Lỗi ghi bỏ qua: nháp chỉ là lưới an toàn.
export function storeCountDraft(
  branchId: string,
  inputs: Record<string, string>
) {
  const has = Object.values(inputs).some((v) => v.trim());
  const op = has
    ? AsyncStorage.setItem(
        countDraftKey(branchId),
        JSON.stringify({ at: Date.now(), inputs })
      )
    : AsyncStorage.removeItem(countDraftKey(branchId));
  return op.catch(() => undefined);
}

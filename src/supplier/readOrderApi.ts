import type {
  ImageInput,
  RawLine,
} from "../../supabase/functions/read-supplier-order/logic.ts";
import { functionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabase";
import { nameKey } from "./orderReconcile";

export type { ImageInput };

// Gửi ảnh cho hàm server (khóa Gemini ở đó). Lỗi: lời của server (hết hạn mức, ảnh quá lớn...) hoặc báo mạng.
export async function readOrderImages(
  branchId: string,
  images: ImageInput[]
): Promise<{ lines: RawLine[] | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(
    "read-supplier-order",
    { body: { branch_id: branchId, images } }
  );
  if (error) return { lines: null, error: await functionErrorMessage(error) };
  return { lines: (data?.lines ?? []) as RawLine[], error: null };
}

export async function loadAliases(
  branchId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("supplier_aliases")
    .select("alias_key, item_id")
    .eq("branch_id", branchId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((a) => [a.alias_key, a.item_id]));
}

// Nhớ tên NCC → món (hỏi một lần). Nhớ lại tên đã có thì đổi sang món mới (sửa khớp nhầm).
export async function saveAlias(
  branchId: string,
  supplierName: string,
  itemId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("supplier_aliases").upsert(
    {
      branch_id: branchId,
      alias_key: nameKey(supplierName),
      item_id: itemId,
    },
    { onConflict: "branch_id,alias_key" }
  );
  return { error: error ? "Không lưu được. Kiểm tra mạng." : null };
}

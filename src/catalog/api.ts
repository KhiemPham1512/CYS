import { subscribeTables } from "../lib/subscribeTables";
import type { Tables, TablesInsert } from "../lib/database.types";
import { supabase } from "../lib/supabase";

export async function loadCatalog(branchId: string): Promise<{
  groups: Tables<"item_groups">[];
  items: Tables<"items">[];
}> {
  const [groupsRes, itemsRes] = await Promise.all([
    supabase.from("item_groups").select("*").eq("branch_id", branchId),
    supabase.from("items").select("*").eq("branch_id", branchId),
  ]);

  if (groupsRes.error) throw groupsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  return {
    groups: groupsRes.data ?? [],
    items: itemsRes.data ?? [],
  };
}

export async function saveItem(
  branchId: string,
  id: string | null,
  value: Omit<TablesInsert<"items">, "branch_id">
): Promise<{ error: string | null }> {
  const res = id
    ? await supabase.from("items").update(value).eq("id", id)
    : await supabase.from("items").insert({ ...value, branch_id: branchId });

  if (!res.error) return { error: null };
  if (res.error.code === "23505") {
    return { error: "Tên món đã có trong Danh mục" };
  }
  return { error: "Không lưu được món. Kiểm tra mạng." };
}

export async function setHidden(
  id: string,
  hidden: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("items")
    .update({ is_hidden: hidden })
    .eq("id", id);

  if (error) {
    return { error: "Không cập nhật được trạng thái. Kiểm tra mạng." };
  }
  return { error: null };
}

export function subscribeCatalog(
  branchId: string,
  onChange: () => void
): () => void {
  return subscribeTables(
    "catalog",
    branchId,
    ["items", "item_groups"],
    onChange
  );
}

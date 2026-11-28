import { supabase } from "../lib/supabase";
import { rpcError } from "./errors";

export type Branch = { branch_id: string; branch_name: string };

// RLS: Quản trị cấp cao đọc được mọi quán, người khác chỉ quán mình.
export async function listBranches(): Promise<{
  data: Branch[] | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("branch_settings")
    .select("branch_id, branch_name")
    .order("branch_name");
  return { data, error: error ? "Không tải được danh sách Chi nhánh." : null };
}

export async function isOwner(): Promise<{
  owner: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("is_owner");
  return {
    owner: data === true,
    error: error ? "Không kiểm tra được quyền Quản trị cấp cao." : null,
  };
}

export async function createBranch(name: string, templateId: string) {
  const { data, error } = await supabase.rpc("create_branch", {
    p_name: name,
    p_template: templateId,
  });
  return { data, error: rpcError(error) };
}

export type BranchSheet = {
  title?: string;
  order_zh?: string;
  stock_zh?: string;
};

export async function loadBranchSheet(branchId: string) {
  const { data, error } = await supabase
    .from("branch_settings")
    .select("sheet")
    .eq("branch_id", branchId)
    .maybeSingle();
  return {
    sheet: (data?.sheet ?? {}) as BranchSheet,
    error: error ? "Không tải được chữ trên tờ." : null,
  };
}

// Chữ để trống: tờ dùng mặc định (tên quán viết hoa, không chữ Trung).
export async function updateBranch(
  branchId: string,
  name: string,
  sheet: Required<BranchSheet>
) {
  const { error } = await supabase.rpc("update_branch", {
    p_branch: branchId,
    p_name: name,
    p_title: sheet.title,
    p_order_zh: sheet.order_zh,
    p_stock_zh: sheet.stock_zh,
  });
  return { error: rpcError(error) };
}

export async function moveMember(userId: string, toBranchId: string) {
  const { error } = await supabase.rpc("move_member", {
    p_user: userId,
    p_to: toBranchId,
  });
  return { error: rpcError(error) };
}

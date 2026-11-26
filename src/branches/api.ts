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

export async function moveMember(userId: string, toBranchId: string) {
  const { error } = await supabase.rpc("move_member", {
    p_user: userId,
    p_to: toBranchId,
  });
  return { error: rpcError(error) };
}

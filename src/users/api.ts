import type { AdminRequest } from "../../supabase/functions/admin-users/logic.ts";
import { functionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabase";

export type ManagedUser = {
  user_id: string;
  email: string;
  is_admin: boolean;
  is_locked: boolean;
  is_owner: boolean; // Quản trị cấp cao (có thể mang is_admin=false)
  created_at: string;
};

async function call<T>(
  body: AdminRequest
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
  });
  if (!error) return { data: (data?.data ?? null) as T | null, error: null };
  return { data: null, error: await functionErrorMessage(error) };
}

// Mọi Người dùng mọi quán (chỉ Quản trị cấp cao).
export type SystemUser = ManagedUser & { branch_id: string };
export const listAllUsers = () => call<SystemUser[]>({ action: "list_all" });

// branchId: chỉ Quản trị cấp cao dùng để chọn quán; bỏ trống = quán của mình.
export const listUsers = (branchId?: string) =>
  call<ManagedUser[]>({ action: "list", branch_id: branchId });

export const createUser = (
  email: string,
  password: string,
  isAdmin: boolean,
  branchId?: string
) =>
  call<{ user_id: string }>({
    action: "create",
    email,
    password,
    is_admin: isAdmin,
    branch_id: branchId,
  });

export const setLocked = (userId: string, locked: boolean) =>
  call<null>({ action: "set_locked", user_id: userId, locked });

export const setAdmin = (userId: string, isAdmin: boolean) =>
  call<null>({ action: "set_admin", user_id: userId, is_admin: isAdmin });

export const resetPassword = (userId: string, password: string) =>
  call<null>({ action: "set_password", user_id: userId, password });

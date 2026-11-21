import type { AdminRequest } from "../../supabase/functions/admin-users/logic.ts";
import { functionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabase";

export type ManagedUser = {
  user_id: string;
  email: string;
  is_admin: boolean;
  is_locked: boolean;
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

export const listUsers = () => call<ManagedUser[]>({ action: "list" });

export const createUser = (email: string, password: string, isAdmin: boolean) =>
  call<{ user_id: string }>({
    action: "create",
    email,
    password,
    is_admin: isAdmin,
  });

export const setLocked = (userId: string, locked: boolean) =>
  call<null>({ action: "set_locked", user_id: userId, locked });

export const setAdmin = (userId: string, isAdmin: boolean) =>
  call<null>({ action: "set_admin", user_id: userId, is_admin: isAdmin });

export const resetPassword = (userId: string, password: string) =>
  call<null>({ action: "set_password", user_id: userId, password });

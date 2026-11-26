import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { isOwner, listBranches, type Branch } from "../branches/api";
import { Loading } from "../ui/Loading";
import { AdminConsole } from "./AdminConsole";

// Cổng của web cho Quản trị (quyền quán đã đọc cùng lúc với Chi nhánh ở HomeScreen).
// Quản trị cấp cao thêm danh sách mọi quán; hỏi lỗi thì coi như Quản trị quán (máy chủ vẫn kiểm lại).
export function AdminWebGate({
  branch,
  userId,
  email,
}: {
  branch: Branch;
  userId: string;
  email: string;
}) {
  // undefined = đang hỏi; null = Quản trị quán.
  const [branches, setBranches] = useState<Branch[] | null | undefined>();

  const loadBranches = useCallback(async () => {
    if (!(await isOwner())) return setBranches(null);
    const { data } = await listBranches();
    setBranches(data ?? [branch]);
  }, [branch]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  if (branches === undefined) return <Loading />;
  return (
    <AdminConsole
      branchId={branch.branch_id}
      branchName={branch.branch_name}
      branches={branches}
      onBranchesChanged={loadBranches}
      userId={userId}
      email={email}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}

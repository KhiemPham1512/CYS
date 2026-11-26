import { supabase } from "../lib/supabase";
import { AdminConsole } from "./AdminConsole";

// Cổng của web cho Quản trị (quyền đã đọc cùng lúc với Chi nhánh ở HomeScreen).
// Nhân viên không qua cổng này (HomeScreen cho họ dùng app đầy đủ).
export function AdminWebGate({
  branch,
  userId,
  email,
}: {
  branch: { branch_id: string; branch_name: string };
  userId: string;
  email: string;
}) {
  return (
    <AdminConsole
      branchId={branch.branch_id}
      branchName={branch.branch_name}
      userId={userId}
      email={email}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}

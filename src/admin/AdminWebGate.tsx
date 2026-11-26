import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { supabase } from "../lib/supabase";
import { isOwner, listBranches, type Branch } from "../branches/api";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Loading } from "../ui/Loading";
import { Text } from "../ui/Text";
import { AdminConsole } from "./AdminConsole";

// Cổng của web cho Quản trị (quyền quán đã đọc cùng lúc với Chi nhánh ở HomeScreen).
// Quản trị cấp cao thêm danh sách mọi quán. Lỗi khi hỏi thì báo và cho thử lại,
// không lặng lẽ hạ cấp cao thành Quản trị quán.
export function AdminWebGate({
  branch,
  userId,
  email,
  onOpenApp,
}: {
  branch: Branch;
  userId: string;
  email: string;
  onOpenApp: () => void;
}) {
  // undefined = đang hỏi; null = Quản trị quán.
  const [branches, setBranches] = useState<Branch[] | null | undefined>();
  const [error, setError] = useState<string | null>(null);

  const loadBranches = useCallback(async () => {
    setError(null);
    const owner = await isOwner();
    if (owner.error) return setError(owner.error);
    if (!owner.owner) return setBranches(null);
    const { data, error: listError } = await listBranches();
    if (listError) return setError(listError);
    setBranches(data ?? []);
  }, []);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  if (error && branches === undefined)
    return (
      <View style={styles.box}>
        <Text style={styles.text}>{error} Kiểm tra mạng rồi thử lại.</Text>
        <Pressable
          style={styles.button}
          onPress={() => void loadBranches()}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Thử lại</Text>
        </Pressable>
      </View>
    );
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
      onOpenApp={onOpenApp}
    />
  );
}

const styles = themedStyles((c: Palette) => ({
  box: {
    width: "100%",
    maxWidth: 392,
    gap: 8,
    padding: 16,
    alignSelf: "center",
  },
  text: { color: c.red, textAlign: "center", fontWeight: "500" },
  button: { padding: 12, alignItems: "center", minHeight: 44 },
  buttonText: { color: c.accentDeep, fontSize: 16, fontWeight: "600" },
}));

import { Pressable, View } from "react-native";
import { supabase } from "../lib/supabase";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Loading } from "../ui/Loading";
import { Text } from "../ui/Text";
import { AdminConsole } from "./AdminConsole";

// Cổng của web cho Quản trị: chờ biết quyền → báo lỗi nếu không đọc được → bảng điều khiển.
// Nhân viên không qua cổng này (HomeScreen cho họ dùng app đầy đủ).
export function AdminWebGate({
  branch,
  roleLoaded,
  roleError,
  userId,
  email,
}: {
  branch: { branch_id: string; branch_name: string };
  roleLoaded: boolean;
  roleError: boolean;
  userId: string;
  email: string;
}) {
  if (!roleLoaded) return <Loading />;
  if (roleError)
    return (
      <Blocked text="Không kiểm tra được quyền. Tải lại trang hoặc kiểm tra mạng." />
    );
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

function Blocked({ text }: { text: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{text}</Text>
      <Pressable
        style={styles.button}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Đăng xuất</Text>
      </Pressable>
    </View>
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
  buttonText: { color: c.accentDeep, fontSize: 16, fontWeight: "500" },
}));

import { useRef, type ComponentRef } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";
import type { SheetModel } from "./exportSheet";
import { PaperSheet } from "./PaperSheet";

// Đơn đang đặt của một Nhóm, vẽ đúng mẫu tờ "ĐẶT HÀNG" của Xuất ảnh. Đặt xong thì nháp trống nên tờ cũng trống;
// đơn đã đặt xem ở Xuất ảnh.
export function DraftSheet({
  visible,
  onClose,
  model,
  date,
}: {
  visible: boolean;
  onClose: () => void;
  model: SheetModel | null;
  date: string;
}) {
  const { width } = useWindowDimensions();
  const shot = useRef<ComponentRef<typeof View>>(null);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.paper}>
          {model ? (
            <PaperSheet
              shotRef={shot}
              model={model}
              date={date}
              orderer=""
              width={Math.min(width - 24, 560)}
            />
          ) : null}
        </ScrollView>
        <Pressable
          style={styles.close}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.closeText}>Đóng</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c: Palette) => ({
  container: { flex: 1, backgroundColor: c.bg },
  paper: { alignItems: "center", paddingVertical: 12 },
  close: {
    margin: 16,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.accentDeep,
  },
  closeText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
}));

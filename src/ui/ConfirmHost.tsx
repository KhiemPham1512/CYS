import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { registerConfirmHost, type ConfirmRequest } from "./confirm";
import { SCRIM } from "./overlay";
import { Text } from "./Text";

// Hộp xác nhận theo giao diện app (thay hộp trắng mặc định của hệ thống). Gắn một lần ở App.
export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  useEffect(() => registerConfirmHost(setRequest), []);

  const close = () => setRequest(null);
  return (
    <Modal
      visible={request !== null}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>{request?.title}</Text>
          {request?.message ? (
            <Text style={styles.message}>{request.message}</Text>
          ) : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.btn, styles.cancel]}
              onPress={close}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Hủy</Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                request?.destructive ? styles.danger : styles.ok,
              ]}
              onPress={() => {
                const run = request?.onConfirm;
                close();
                run?.();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.okText}>{request?.confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c: Palette) => ({
  backdrop: {
    flex: 1,
    backgroundColor: SCRIM,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 20,
    gap: 10,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 18, fontWeight: "700", color: c.ink },
  message: { fontSize: 15, color: c.muted, lineHeight: 22 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancel: { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  ok: { backgroundColor: c.accentDeep },
  danger: { backgroundColor: c.red },
  cancelText: { fontSize: 16, fontWeight: "600", color: c.ink },
  okText: { fontSize: 16, fontWeight: "700", color: c.onAccent },
}));

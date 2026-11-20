import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { Text } from "../ui/Text";

type Props = {
  visible: boolean;
  title: string;
  info?: string[];
  label: string;
  placeholder?: string;
  value: string;
  error?: string | null;
  preview?: string | null;
  onChangeText: (text: string) => void;
  onDone: () => void;
  onReset: () => void;
};

export function ItemQtyModal({
  visible,
  title,
  info,
  label,
  placeholder,
  value,
  error,
  preview,
  onChangeText,
  onDone,
  onReset,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDone}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{title}</Text>
              {info?.map((line, idx) => (
                <Text key={idx} style={styles.infoText}>
                  {line}
                </Text>
              ))}

              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                autoFocus
                placeholder={placeholder}
                value={value}
                onChangeText={onChangeText}
              />
              {error ? (
                <Text style={styles.fieldError}>{error}</Text>
              ) : preview ? (
                <Text style={styles.previewText}>{preview}</Text>
              ) : null}

              <View style={styles.btnRow}>
                <Pressable
                  style={[styles.secondary, styles.btnHalf]}
                  onPress={onReset}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryText}>Đặt lại</Text>
                </Pressable>
                <Pressable
                  style={[styles.primary, styles.btnHalf]}
                  onPress={onDone}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>Xong</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c: Palette) => ({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    maxHeight: "85%",
    padding: 16,
  },
  modalContent: { gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: c.ink },
  infoText: { fontSize: 13, color: c.muted },
  label: { fontSize: 14, fontWeight: "600", color: c.ink, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: c.surface,
  },
  fieldError: { color: c.red, fontSize: 14 },
  previewText: { color: c.accentDeep, fontSize: 14, fontWeight: "600" },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  btnHalf: { flex: 1 },
  primary: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  secondary: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    backgroundColor: c.surface,
  },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },
  secondaryText: { color: c.ink, fontSize: 16, fontWeight: "600" },
}));

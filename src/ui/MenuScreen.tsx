import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { cleanDisplayName, initialsOf } from "../profile/name";
import { loadProfile, pickAvatar, saveProfile } from "../profile/api";
import { useTheme } from "../theme/ThemeContext";
import { PALETTES, type ThemeName } from "../theme/themes";
import { Bow, Glyph, Logo } from "./icons";
import { TextInput } from "./TextInput";
import { fontFamily } from "./motion";

// Menu ≡: tài khoản, chi nhánh, kết nối, chủ đề, đăng xuất.
export function MenuScreen({
  userId,
  email,
  isAdmin,
  branchName,
  online,
  onSignOut,
}: {
  userId: string;
  email: string;
  isAdmin: boolean;
  branchName: string;
  online: boolean;
  onSignOut: () => void;
}) {
  const { theme, palette, setTheme } = useTheme();
  const [name, setName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadProfile(userId).then(
      (p) => {
        setName(p.display_name);
        setAvatar(p.avatar);
      },
      () => {}
    );
  }, [userId]);
  const initials = initialsOf(name, email);

  function startEdit() {
    setDraftName(name ?? "");
    setDraftAvatar(avatar);
    setError(null);
    setEditing(true);
  }
  async function choosePhoto() {
    try {
      const picked = await pickAvatar();
      if (picked) setDraftAvatar(picked);
    } catch {
      setError("Không chọn được ảnh.");
    }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    const next = {
      display_name: cleanDisplayName(draftName),
      avatar: draftAvatar,
    };
    const { error: err } = await saveProfile(userId, next);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setName(next.display_name);
    setAvatar(next.avatar);
    setEditing(false);
  }
  const card = [
    styles.card,
    { backgroundColor: palette.surface, borderColor: palette.line },
  ];
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[card, styles.profile]}>
        <Avatar uri={avatar} initials={initials} />
        <View style={styles.grow}>
          <Text
            style={[styles.email, { color: palette.ink }]}
            numberOfLines={1}
          >
            {name ?? email}
          </Text>
          {name && (
            <Text
              style={[styles.sub, { color: palette.muted }]}
              numberOfLines={1}
            >
              {email}
            </Text>
          )}
          <Text style={[styles.sub, { color: palette.muted }]}>
            {isAdmin ? "Quản trị" : "Nhân viên"}
          </Text>
        </View>
        <Logo theme={theme} size={34} />
      </View>

      {editing ? (
        <View style={[card, styles.edit]}>
          <View style={styles.editPhoto}>
            <Avatar
              uri={draftAvatar}
              initials={initialsOf(cleanDisplayName(draftName), email)}
            />
            <Pressable
              onPress={choosePhoto}
              accessibilityRole="button"
              accessibilityLabel="Chọn ảnh đại diện"
            >
              <Text style={[styles.link, { color: palette.accent }]}>
                Chọn ảnh
              </Text>
            </Pressable>
            {draftAvatar && (
              <Pressable
                onPress={() => setDraftAvatar(null)}
                accessibilityRole="button"
                accessibilityLabel="Xóa ảnh đại diện"
              >
                <Text style={[styles.link, { color: palette.red }]}>
                  Xóa ảnh
                </Text>
              </Pressable>
            )}
          </View>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Tên hiển thị (để trống thì hiện email)"
            maxLength={40}
            accessibilityLabel="Tên hiển thị"
          />
          {error && <Text style={{ color: palette.red }}>{error}</Text>}
          <View style={styles.editButtons}>
            <Pressable
              style={[styles.btn, { borderColor: palette.line }]}
              onPress={() => setEditing(false)}
              accessibilityRole="button"
            >
              <Text style={{ color: palette.ink }}>Hủy</Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                {
                  backgroundColor: palette.accent,
                  borderColor: palette.accent,
                },
                busy && { opacity: 0.6 },
              ]}
              onPress={save}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Lưu tài khoản"
            >
              <Text style={{ color: "#fff", fontFamily: fontFamily.semi }}>
                {busy ? "Đang lưu…" : "Lưu"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={startEdit}
          accessibilityRole="button"
          accessibilityLabel="Sửa tài khoản"
        >
          <Text style={[styles.link, { color: palette.accent }]}>
            Sửa tên và ảnh đại diện
          </Text>
        </Pressable>
      )}

      <Text style={[styles.group, { color: palette.muted }]}>CHI NHÁNH</Text>
      <View style={card}>
        <Row icon="building" label="Chi nhánh" value={branchName} />
        <Row
          icon="wifi"
          label="Kết nối"
          value={online ? "Trực tuyến" : "Mất mạng"}
          divider
        />
      </View>

      <Text style={[styles.group, { color: palette.muted }]}>CHỦ ĐỀ</Text>
      <View style={styles.themes}>
        <ThemeCard
          name="pink"
          label="Hồng nơ"
          current={theme}
          onPick={setTheme}
        />
        <ThemeCard
          name="blue"
          label="Xanh trắng"
          current={theme}
          onPick={setTheme}
        />
      </View>

      <Pressable
        style={({ pressed }) => [
          card,
          styles.logout,
          pressed && { opacity: 0.7 },
        ]}
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Đăng xuất"
      >
        <Glyph name="logout" color={palette.red} size={20} />
        <Text style={[styles.logoutText, { color: palette.red }]}>
          Đăng xuất
        </Text>
      </Pressable>
      <Text style={[styles.version, { color: palette.muted }]}>
        CYS · phiên bản 1.0
      </Text>
    </ScrollView>
  );

  function Avatar({
    uri,
    initials: ini,
  }: {
    uri: string | null;
    initials: string;
  }) {
    return uri ? (
      <Image
        source={{ uri }}
        style={styles.avatar}
        accessibilityLabel="Ảnh đại diện"
      />
    ) : (
      <View style={[styles.avatar, { backgroundColor: palette.accent }]}>
        <Text style={styles.avatarText}>{ini}</Text>
      </View>
    );
  }

  function Row({
    icon,
    label,
    value,
    divider,
  }: {
    icon: "building" | "wifi";
    label: string;
    value: string;
    divider?: boolean;
  }) {
    return (
      <View
        style={[
          styles.row,
          divider && { borderTopWidth: 1, borderTopColor: palette.line },
        ]}
      >
        <Glyph name={icon} color={palette.accent} size={20} />
        <Text style={[styles.rowLabel, { color: palette.ink }]}>{label}</Text>
        <Text
          style={[styles.rowValue, { color: palette.muted }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    );
  }
}

function ThemeCard({
  name,
  label,
  current,
  onPick,
}: {
  name: ThemeName;
  label: string;
  current: ThemeName;
  onPick: (t: ThemeName) => void;
}) {
  const { palette } = useTheme();
  const on = current === name;
  const swatch = [PALETTES[name].gradFrom, PALETTES[name].gradTo];
  return (
    <Pressable
      style={({ pressed }) => [
        styles.themeCard,
        {
          backgroundColor: palette.surface,
          borderColor: on ? palette.accent : palette.line,
          borderWidth: on ? 2 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
      onPress={() => onPick(name)}
      accessibilityRole="button"
      accessibilityLabel={`Chủ đề ${label}`}
      accessibilityState={{ selected: on }}
    >
      <View
        style={[
          styles.swatch,
          { backgroundColor: swatch[1], borderColor: swatch[0] },
        ]}
      />
      <Text style={[styles.themeText, { color: palette.ink }]}>{label}</Text>
      {name === "pink" && <Bow color={swatch[1]} width={20} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 130 },
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  profile: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  grow: { flex: 1 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontFamily: fontFamily.bold },
  edit: { padding: 14, gap: 12 },
  editPhoto: { flexDirection: "row", alignItems: "center", gap: 16 },
  editButtons: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  btn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 18,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  link: { fontSize: 14, fontFamily: fontFamily.semi },
  email: { fontSize: 15, fontFamily: fontFamily.semi },
  sub: { fontSize: 12, fontFamily: fontFamily.regular },
  group: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: fontFamily.semi,
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    minHeight: 48,
  },
  rowLabel: { flex: 1, fontSize: 14, fontFamily: fontFamily.medium },
  rowValue: { fontSize: 13, fontFamily: fontFamily.regular, maxWidth: "50%" },
  themes: { flexDirection: "row", gap: 10 },
  themeCard: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 10,
  },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  themeText: { fontSize: 14, fontFamily: fontFamily.semi },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    minHeight: 48,
  },
  logoutText: { fontSize: 14, fontFamily: fontFamily.medium },
  version: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: fontFamily.regular,
    marginTop: 4,
  },
});

import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";

export type Profile = { display_name: string | null; avatar: string | null };

export async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, avatar")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? { display_name: null, avatar: null };
}

export async function saveProfile(
  userId: string,
  profile: Profile
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, ...profile });
  return { error: error ? "Không lưu được. Kiểm tra mạng." : null };
}

// Chọn ảnh, cắt vuông, thu về 128px JPEG (vài KB) để lưu thẳng trong bảng; null nếu huỷ.
export async function pickAvatar(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (res.canceled || !res.assets[0]) return null;
  const out = await ImageManipulator.manipulateAsync(
    res.assets[0].uri,
    [{ resize: { width: 128, height: 128 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}

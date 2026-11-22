// Xuất ảnh trên web (iPhone Safari không có "Thư viện" như app): ảnh chụp tờ giấy là data URI,
// đổi thành file rồi cho người dùng chia sẻ (iPhone: "Lưu ảnh" → Ảnh) hoặc tải về.
import { normalizeVi } from "../catalog/search";

export function dataUriToFile(uri: string, name: string): File {
  const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(uri);
  if (!m) throw new Error("Ảnh chụp không hợp lệ");
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: m[1] });
}

const slug = (s: string) =>
  normalizeVi(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function imageFileName(kind: string, group: string, date: string) {
  return `${[kind, group, date].map(slug).join("-")}.png`;
}

// Mở bảng chia sẻ của hệ điều hành (iPhone: có "Lưu ảnh"); máy không hỗ trợ thì tải file về.
// shortcut: không tách riêng trường hợp người dùng bấm Hủy ở bảng chia sẻ (coi như xong, không báo lỗi).
export async function shareOrDownload(file: File): Promise<void> {
  const nav = navigator;
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

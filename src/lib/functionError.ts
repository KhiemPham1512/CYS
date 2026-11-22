const NET_ERROR = "Không kết nối được. Kiểm tra mạng.";

// Lỗi từ supabase.functions.invoke: ưu tiên lời của hàm server (`{error}`), có mã HTTP thì báo lỗi máy chủ, không thì báo mạng.
export async function functionErrorMessage(error: unknown): Promise<string> {
  const context = (
    error as
      { context?: { status?: unknown; text?: unknown } } | null | undefined
  )?.context;
  if (
    !context ||
    typeof context !== "object" ||
    typeof context.status !== "number" ||
    typeof context.text !== "function"
  ) {
    return NET_ERROR;
  }
  try {
    const body = await Promise.resolve(context.text()).catch(() => "");
    const payload = JSON.parse(body);
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // Nội dung không phải JSON (như HTML của cổng trung gian) hoặc không đọc được.
  }
  return `Máy chủ báo lỗi (${context.status}). Thử lại sau.`;
}

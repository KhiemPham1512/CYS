const NET_ERROR = "Không kết nối được. Kiểm tra mạng.";

// Lỗi từ supabase.functions.invoke: lấy lời của hàm server (`{error}`) nếu có, không thì báo mạng.
export async function functionErrorMessage(error: unknown): Promise<string> {
  const context: unknown = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    const payload = await context.json().catch(() => null);
    if (typeof payload?.error === "string") return payload.error;
  }
  return NET_ERROR;
}

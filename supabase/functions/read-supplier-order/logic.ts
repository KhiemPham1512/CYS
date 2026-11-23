// Logic thuần của Edge Function đọc ảnh đơn nhà cung cấp bằng Gemini (không gọi mạng, có test).

export type ImageInput = { mime: string; data: string }; // data = base64

export type RawLine = {
  name: string;
  qty: number;
  unit: string;
  pack: string | null;
  orderCode: string | null;
};

const MAX_IMAGES = 6;
const MAX_BASE64 = 8_000_000; // ~6 MB mỗi ảnh
const MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateImages(
  images: ImageInput[]
): { ok: true } | { ok: false; error: string } {
  if (images.length === 0) return { ok: false, error: "Chưa chọn ảnh" };
  if (images.length > MAX_IMAGES)
    return { ok: false, error: `Tối đa ${MAX_IMAGES} ảnh mỗi lần` };
  for (const img of images) {
    if (!MIMES.has(img.mime))
      return { ok: false, error: "Chỉ nhận ảnh PNG, JPEG hoặc WebP" };
    if (typeof img.data !== "string" || img.data.length > MAX_BASE64)
      return { ok: false, error: "Ảnh quá lớn" };
  }
  return { ok: true };
}

// Chỉ đọc bảng sản phẩm; dặn bỏ thông tin cá nhân của người mua (giảm dữ liệu nhạy cảm đi qua mô hình).
// shortcut: lời dặn không thay được việc ảnh vẫn gửi nguyên cho Gemini; muốn chặt hơn thì cắt ảnh ở máy trước khi gửi.
export function buildPrompt(): string {
  return [
    "Đây là ảnh chụp màn hình đơn đặt hàng của một nhà cung cấp (tiếng Việt).",
    "Chỉ đọc bảng sản phẩm. Với mỗi dòng trả về: name (tên sản phẩm đúng như hiển thị, giữ cả tên tiếng Trung nếu có),",
    "qty (số lượng, là số), unit (đơn vị), description (dòng Mô tả về quy cách nếu có trong ảnh, không có thì null),",
    "order_code (mã đơn nếu thấy trong ảnh, không thì null).",
    "Bỏ qua số điện thoại, địa chỉ, tên người, giá, thành tiền và mọi thông tin khác; không trả về chúng.",
    "Chỉ chép những gì đọc được trong ảnh. Ảnh không có bảng sản phẩm thì trả lines rỗng. Không bịa dòng; không đọc được thì bỏ qua dòng đó. Trả JSON đúng schema.",
  ].join(" ");
}

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    lines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          qty: { type: "NUMBER" },
          unit: { type: "STRING" },
          description: { type: "STRING", nullable: true },
          order_code: { type: "STRING", nullable: true },
        },
        required: ["name", "qty", "unit"],
      },
    },
  },
  required: ["lines"],
};

export function buildGeminiRequest(images: ImageInput[]) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildPrompt() },
          ...images.map((i) => ({
            inline_data: { mime_type: i.mime, data: i.data },
          })),
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  };
}

const QUOTA_MESSAGE =
  "Hết hạn mức đọc ảnh. Thử lại sau hoặc chọn 'Đã đặt đúng như đơn'.";
const READ_FAIL_MESSAGE =
  "Không đọc được ảnh. Thử ảnh rõ hơn hoặc chọn 'Đã đặt đúng như đơn'.";

export function parseGeminiResponse(
  body: unknown
): { ok: true; lines: RawLine[] } | { ok: false; error: string } {
  const b = body as {
    error?: { code?: number; status?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (b?.error) {
    const quota =
      b.error.code === 429 || b.error.status === "RESOURCE_EXHAUSTED";
    return { ok: false, error: quota ? QUOTA_MESSAGE : READ_FAIL_MESSAGE };
  }
  const text = b?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return { ok: false, error: READ_FAIL_MESSAGE };
  let parsed: { lines?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: READ_FAIL_MESSAGE };
  }
  if (!Array.isArray(parsed.lines))
    return { ok: false, error: READ_FAIL_MESSAGE };

  const lines: RawLine[] = [];
  for (const l of parsed.lines as Record<string, unknown>[]) {
    const name = typeof l.name === "string" ? l.name.trim() : "";
    const qty = typeof l.qty === "number" ? l.qty : NaN;
    const unit = typeof l.unit === "string" ? l.unit.trim() : "";
    if (!name || !Number.isFinite(qty) || qty <= 0) continue; // bỏ dòng hỏng, giữ các dòng tốt
    lines.push({
      name,
      qty,
      unit,
      pack:
        typeof l.description === "string" && l.description.trim()
          ? l.description.trim()
          : null,
      orderCode:
        typeof l.order_code === "string" && l.order_code.trim()
          ? l.order_code.trim()
          : null,
    });
  }
  return { ok: true, lines };
}

export type ParsedRead = ReturnType<typeof parseGeminiResponse>;
export type GeminiCall = (
  model: string,
  timeoutMs: number
) => Promise<{ status: number; body: () => Promise<unknown> }>;

// Model chính hay quá tải, đứng hình hoặc lỗi lạ: thử lần lượt các model, đọc được là dừng (model chính lỗi 4-5s mà không thử dự phòng từng làm người dùng phải bấm đọc lại).
// reached=false khi không model nào trả lời được (để báo 502 "không kết nối").
// errors: tóm tắt lỗi từng model (mã HTTP, mã lỗi, thông báo ngắn) để ghi log chẩn đoán; không chứa ảnh hay dòng đơn.
export async function readWithFallback(
  call: GeminiCall,
  models: readonly (readonly [string, number])[]
): Promise<{ reached: boolean; parsed: ParsedRead; errors: string[] }> {
  let parsed = parseGeminiResponse(null);
  let reached = false;
  const errors: string[] = [];
  for (const [model, timeoutMs] of models) {
    try {
      const res = await call(model, timeoutMs);
      reached = true;
      const body = await res.body();
      parsed = parseGeminiResponse(body);
      if (parsed.ok) break;
      errors.push(
        `${model}: HTTP ${res.status} ${describeGeminiFailure(body)}`
      );
    } catch (e) {
      // hết giờ hoặc lỗi mạng: thử model kế
      errors.push(`${model}: ${e instanceof Error ? e.name : "lỗi mạng"}`);
    }
  }
  return { reached, parsed, errors };
}

function describeGeminiFailure(body: unknown): string {
  const b = body as {
    error?: { status?: string; message?: unknown };
    candidates?: { finishReason?: string }[];
  } | null;
  if (b?.error)
    return `${b.error.status ?? ""} ${String(b.error.message ?? "").slice(0, 200)}`.trim();
  const reason = b?.candidates?.[0]?.finishReason;
  return reason ? `finishReason ${reason}` : "không đọc được nội dung trả về";
}

// Edge Function: đọc ảnh chụp màn hình đơn nhà cung cấp bằng Gemini, trả các dòng thô.
// Khóa GEMINI_API_KEY chỉ nằm ở secret của Edge Function, không có trong app hay repo.
// Chỉ thành viên đang hoạt động của Chi nhánh gọi được (kiểm bằng token của người gọi).
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildGeminiRequest,
  parseGeminiResponse,
  validateImages,
  type ImageInput,
} from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
const fail = (status: number, error: string) => json(status, { error });

const url = Deno.env.get("SUPABASE_URL")!;
const publishableKey = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!)[
  "default"
];
const geminiKey = Deno.env.get("GEMINI_API_KEY");
const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "Chỉ nhận POST");

  const authorization = req.headers.get("Authorization");
  if (!authorization) return fail(401, "Chưa đăng nhập");
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return fail(401, "Chưa đăng nhập");

  const body = (await req.json().catch(() => null)) as {
    branch_id?: string;
    images?: ImageInput[];
  } | null;
  if (
    !body ||
    typeof body.branch_id !== "string" ||
    !Array.isArray(body.images)
  )
    return fail(400, "Yêu cầu không hợp lệ");

  // is_active_member chạy với quyền của người gọi: không phải thành viên đang hoạt động thì false.
  const { data: member } = await userClient.rpc("is_active_member", {
    p_branch_id: body.branch_id,
  });
  if (member !== true) return fail(403, "Không có quyền");

  const valid = validateImages(body.images);
  if (!valid.ok) return fail(400, valid.error);
  if (!geminiKey)
    return fail(
      503,
      "Chưa cấu hình đọc ảnh. Chọn 'Đã đặt đúng như đơn' hoặc báo Quản trị."
    );

  let geminiBody: unknown;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify(buildGeminiRequest(body.images)),
      }
    );
    geminiBody = await res.json();
  } catch {
    return fail(502, "Không kết nối được dịch vụ đọc ảnh. Thử lại sau.");
  }

  const parsed = parseGeminiResponse(geminiBody);
  if (!parsed.ok) return fail(502, parsed.error);
  return json(200, { lines: parsed.lines });
});

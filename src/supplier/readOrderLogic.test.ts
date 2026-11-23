import { describe, expect, it, vi } from "vitest";
import {
  buildGeminiRequest,
  buildPrompt,
  parseGeminiResponse,
  readWithFallback,
  validateImages,
} from "../../supabase/functions/read-supplier-order/logic.ts";

// Câu trả lời Gemini ghi sẵn (fixture chung chung, không dữ liệu thật); không gọi Gemini thật.
const gemini = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
});

describe("parseGeminiResponse", () => {
  it("đọc JSON dòng thô: tên, số lượng, đơn vị, mô tả quy cách, mã đơn", () => {
    const body = gemini(
      JSON.stringify({
        lines: [
          {
            name: "Sản phẩm A - 甲",
            qty: 5,
            unit: "Lon",
            description: "12 lon/thùng",
            order_code: "#S1",
          },
          {
            name: "Sản phẩm B",
            qty: 2,
            unit: "Hộp",
            description: null,
            order_code: "#S1",
          },
        ],
      })
    );
    expect(parseGeminiResponse(body)).toEqual({
      ok: true,
      lines: [
        {
          name: "Sản phẩm A - 甲",
          qty: 5,
          unit: "Lon",
          pack: "12 lon/thùng",
          orderCode: "#S1",
        },
        {
          name: "Sản phẩm B",
          qty: 2,
          unit: "Hộp",
          pack: null,
          orderCode: "#S1",
        },
      ],
    });
  });

  it("bỏ dòng thiếu tên hoặc số lượng không hợp lệ, không làm hỏng cả loạt", () => {
    const body = gemini(
      JSON.stringify({
        lines: [
          { name: "", qty: 1, unit: "Hộp" },
          { name: "A", qty: "abc", unit: "Hộp" },
          { name: "A", qty: 0, unit: "Hộp" },
          { name: "B", qty: 3, unit: "Hộp" },
        ],
      })
    );
    const r = parseGeminiResponse(body);
    expect(r.ok && r.lines.map((l) => l.name)).toEqual(["B"]);
  });

  it("câu trả lời bị chặn hoặc hết hạn mức thì báo lỗi rõ", () => {
    expect(
      parseGeminiResponse({ error: { code: 429, message: "quota" } })
    ).toEqual({
      ok: false,
      error:
        "Hết hạn mức đọc ảnh. Thử lại sau hoặc chọn 'Đã đặt đúng như đơn'.",
    });
    expect(parseGeminiResponse({ candidates: [] })).toMatchObject({
      ok: false,
    });
    expect(parseGeminiResponse(gemini("không phải json"))).toMatchObject({
      ok: false,
    });
  });
});

describe("validateImages", () => {
  const png = "aGVsbG8="; // base64 ngắn
  it("nhận 1..6 ảnh png/jpeg base64", () => {
    expect(validateImages([{ mime: "image/jpeg", data: png }])).toEqual({
      ok: true,
    });
  });
  it("chặn không có ảnh, quá nhiều ảnh, sai kiểu, quá lớn", () => {
    expect(validateImages([]).ok).toBe(false);
    expect(
      validateImages(Array(7).fill({ mime: "image/png", data: png })).ok
    ).toBe(false);
    expect(validateImages([{ mime: "application/pdf", data: png }]).ok).toBe(
      false
    );
    expect(
      validateImages([{ mime: "image/png", data: "A".repeat(8_000_001) }]).ok
    ).toBe(false);
  });
});

describe("buildPrompt", () => {
  it("dặn chỉ đọc bảng sản phẩm, bỏ thông tin cá nhân", () => {
    const p = buildPrompt();
    expect(p).toContain("số điện thoại");
    expect(p).toContain("order_code");
  });
});

describe("buildGeminiRequest", () => {
  it("gửi lời dặn rồi từng ảnh, đòi JSON theo schema, nhiệt độ 0", () => {
    const req = buildGeminiRequest([
      { mime: "image/png", data: "AAA" },
      { mime: "image/jpeg", data: "BBB" },
    ]);
    const parts = req.contents[0].parts;
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ text: buildPrompt() });
    expect(parts[1]).toEqual({
      inline_data: { mime_type: "image/png", data: "AAA" },
    });
    expect(req.generationConfig.response_mime_type).toBe("application/json");
    expect(req.generationConfig.temperature).toBe(0);
  });
});

describe("readWithFallback", () => {
  const ok = gemini(
    JSON.stringify({ lines: [{ name: "A", qty: 1, unit: "x" }] })
  );
  const reply = (status: number, body: unknown) => ({
    status,
    body: async () => body,
  });
  const models = [
    ["chinh", 20_000],
    ["du-phong", 40_000],
  ] as const;

  it("model chính đọc được thì không gọi model dự phòng", async () => {
    const call = vi.fn(async () => reply(200, ok));
    const r = await readWithFallback(call, models);
    expect(r.reached).toBe(true);
    expect(r.parsed.ok).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("chinh", 20_000);
  });

  it("model chính quá tải 503 thì thử model dự phòng", async () => {
    const call = vi.fn(async (m: string) =>
      m === "chinh" ? reply(503, { error: { code: 503 } }) : reply(200, ok)
    );
    const r = await readWithFallback(call, models);
    expect(r.parsed.ok).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenLastCalledWith("du-phong", 40_000);
  });

  it("model chính hết giờ hoặc lỗi mạng thì thử model dự phòng", async () => {
    const call = vi.fn(async (m: string) => {
      if (m === "chinh") throw new Error("timeout");
      return reply(200, ok);
    });
    const r = await readWithFallback(call, models);
    expect(r.reached).toBe(true);
    expect(r.parsed.ok).toBe(true);
  });

  it("lỗi khác 503 (hết hạn mức 429) thì dừng, không đốt thêm lượt model dự phòng", async () => {
    const call = vi.fn(async () =>
      reply(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED" } })
    );
    const r = await readWithFallback(call, models);
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.reached).toBe(true);
    expect(r.parsed.ok).toBe(false);
  });

  it("không model nào trả lời được thì reached=false (báo không kết nối)", async () => {
    const call = vi.fn(async () => {
      throw new Error("mạng");
    });
    const r = await readWithFallback(call, models);
    expect(r.reached).toBe(false);
    expect(r.parsed.ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("cả hai model đều 503 thì báo lỗi đọc, vẫn là đã kết nối", async () => {
    const call = vi.fn(async () => reply(503, { error: { code: 503 } }));
    const r = await readWithFallback(call, models);
    expect(r.reached).toBe(true);
    expect(r.parsed.ok).toBe(false);
  });
});

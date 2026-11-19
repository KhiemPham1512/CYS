import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  parseGeminiResponse,
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

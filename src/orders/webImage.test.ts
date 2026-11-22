import { describe, expect, it } from "vitest";
import { dataUriToFile, imageFileName } from "./webImage";

// 1x1 PNG trong suốt (dữ liệu giả, không phải ảnh thật của quán).
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("dataUriToFile (ảnh chụp tờ trên web → file để chia sẻ/tải)", () => {
  it("giữ đúng loại ảnh, tên và nội dung", async () => {
    const file = dataUriToFile(`data:image/png;base64,${PNG_1PX}`, "to-1.png");
    expect(file.name).toBe("to-1.png");
    expect(file.type).toBe("image/png");
    const bytes = new Uint8Array(await file.arrayBuffer());
    // chữ ký PNG
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(file.size).toBe(Buffer.from(PNG_1PX, "base64").length);
  });

  it("chuỗi không phải data URI ảnh thì báo lỗi, không tạo file hỏng", () => {
    expect(() => dataUriToFile("https://example.com/a.png", "a.png")).toThrow();
    expect(() =>
      dataUriToFile("data:text/plain;base64,QQ==", "a.png")
    ).toThrow();
  });
});

describe("imageFileName", () => {
  it("bỏ dấu, chữ thường, nối bằng gạch ngang", () => {
    expect(imageFileName("Đơn đặt hàng", "Nhóm Trà", "23/11/2026")).toBe(
      "don-dat-hang-nhom-tra-23-11-2026.png"
    );
  });
});

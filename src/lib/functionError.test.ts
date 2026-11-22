import { describe, expect, it } from "vitest";
import { functionErrorMessage } from "./functionError";

describe("functionErrorMessage", () => {
  it("trả nguyên lời của server từ Response thật có JSON {error}", async () => {
    const context = new Response(JSON.stringify({ error: "Ảnh quá lớn." }), {
      status: 502,
    });
    expect(await functionErrorMessage({ context })).toBe("Ảnh quá lớn.");
  });

  // Fetch trên một số môi trường dùng lớp Response riêng (không cùng instanceof).
  it("trả lời của server từ đối tượng thường có status và text()", async () => {
    const context = {
      status: 502,
      text: async () => JSON.stringify({ error: "Hết lượt đọc hôm nay." }),
    };
    expect(await functionErrorMessage({ context })).toBe(
      "Hết lượt đọc hôm nay."
    );
  });

  it("cổng trung gian trả HTML (không phải JSON) thì báo mã lỗi máy chủ", async () => {
    const context = new Response("<html>Bad Gateway</html>", { status: 502 });
    expect(await functionErrorMessage({ context })).toBe(
      "Máy chủ báo lỗi (502). Thử lại sau."
    );
  });

  it("JSON không có trường error thì báo mã lỗi máy chủ", async () => {
    const context = new Response(JSON.stringify({ message: "x" }), {
      status: 500,
    });
    expect(await functionErrorMessage({ context })).toBe(
      "Máy chủ báo lỗi (500). Thử lại sau."
    );
  });

  it("JSON có error rỗng thì báo mã lỗi máy chủ", async () => {
    const context = new Response(JSON.stringify({ error: "   " }), {
      status: 403,
    });
    expect(await functionErrorMessage({ context })).toBe(
      "Máy chủ báo lỗi (403). Thử lại sau."
    );
  });

  it("text() bị từ chối vẫn báo mã lỗi máy chủ", async () => {
    const context = {
      status: 502,
      text: () => Promise.reject(new Error("read failed")),
    };
    expect(await functionErrorMessage({ context })).toBe(
      "Máy chủ báo lỗi (502). Thử lại sau."
    );
  });

  it("context là TypeError khi fetch đứt mạng thì nhắc kiểm tra mạng", async () => {
    const context = new TypeError("Network request failed");
    expect(await functionErrorMessage({ context })).toBe(
      "Không kết nối được. Kiểm tra mạng."
    );
  });

  it("lỗi không có context hoặc null thì nhắc kiểm tra mạng", async () => {
    expect(await functionErrorMessage(new Error("failed"))).toBe(
      "Không kết nối được. Kiểm tra mạng."
    );
    expect(await functionErrorMessage(null)).toBe(
      "Không kết nối được. Kiểm tra mạng."
    );
  });
});

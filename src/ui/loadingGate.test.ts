import { afterEach, describe, expect, it, vi } from "vitest";
import { loadingStarted, whenIdle } from "./loadingGate";

afterEach(() => vi.useRealTimers());

describe("whenIdle", () => {
  it("không có màn nào đang tải: gọi sau khoảng chờ ngắn", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    whenIdle(done, 8000);
    vi.advanceTimersByTime(200);
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("chờ màn đang tải xong, kể cả khi màn này tắt rồi màn khác bật liền", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const stopA = loadingStarted();
    whenIdle(done, 8000);
    vi.advanceTimersByTime(1000);
    stopA();
    const stopB = loadingStarted(); // đổi màn trong cùng một lần vẽ
    vi.advanceTimersByTime(1000);
    expect(done).not.toHaveBeenCalled();
    stopB();
    vi.advanceTimersByTime(200);
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("tải quá lâu thì vẫn gọi sau hạn tối đa, chỉ một lần", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const stop = loadingStarted();
    whenIdle(done, 8000);
    vi.advanceTimersByTime(8000);
    expect(done).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(500);
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("đã hủy (màn chờ đóng giữa chừng) thì không gọi nữa", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const cancel = whenIdle(done, 8000);
    cancel();
    vi.advanceTimersByTime(9000);
    expect(done).not.toHaveBeenCalled();
  });
});

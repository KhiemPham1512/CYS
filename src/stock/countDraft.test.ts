import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));

import { DRAFT_MAX_AGE_MS, parseCountDraft } from "./countDraft";

const NOW = 1_000_000_000_000;
const raw = (at: unknown, inputs: unknown) => JSON.stringify({ at, inputs });

describe("parseCountDraft", () => {
  it("trả lại số đã gõ, bỏ ô trống", () => {
    expect(
      parseCountDraft(raw(NOW - 1000, { a: "5", b: "  ", c: "2+1" }), NOW)
    ).toEqual({
      a: "5",
      c: "2+1",
    });
  });
  it("quá hạn thì bỏ", () => {
    expect(
      parseCountDraft(raw(NOW - DRAFT_MAX_AGE_MS - 1, { a: "5" }), NOW)
    ).toBeNull();
  });
  it("hỏng, rỗng hay sai kiểu thì null", () => {
    expect(parseCountDraft(null, NOW)).toBeNull();
    expect(parseCountDraft("{không phải json", NOW)).toBeNull();
    expect(parseCountDraft(raw(NOW, {}), NOW)).toBeNull();
    expect(parseCountDraft(raw(NOW, { a: 5 }), NOW)).toBeNull();
    expect(parseCountDraft(raw("x", { a: "5" }), NOW)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { isNewer, parseLatest } from "./version";

describe("parseLatest", () => {
  it("parses valid latest JSON with notes", () => {
    expect(
      parseLatest({
        versionCode: 14,
        versionName: "1.4.0",
        notes: "Sửa lỗi đăng nhập",
      })
    ).toEqual({
      versionCode: 14,
      versionName: "1.4.0",
      notes: "Sửa lỗi đăng nhập",
    });
  });

  it("defaults optional notes to empty string", () => {
    expect(parseLatest({ versionCode: 1, versionName: "1.0.0" })).toEqual({
      versionCode: 1,
      versionName: "1.0.0",
      notes: "",
    });
  });

  it("returns null for invalid JSON shapes", () => {
    expect(parseLatest(null)).toBeNull();
    expect(parseLatest(undefined)).toBeNull();
    expect(parseLatest("invalid")).toBeNull();
    expect(parseLatest(123)).toBeNull();
    expect(parseLatest([])).toBeNull();
    expect(parseLatest({})).toBeNull();
    expect(parseLatest({ versionCode: 0, versionName: "1.0.0" })).toBeNull();
    expect(parseLatest({ versionCode: -1, versionName: "1.0.0" })).toBeNull();
    expect(parseLatest({ versionCode: 1.5, versionName: "1.0.0" })).toBeNull();
    expect(parseLatest({ versionCode: NaN, versionName: "1.0.0" })).toBeNull();
    expect(parseLatest({ versionCode: "14", versionName: "1.4.0" })).toBeNull();
    expect(parseLatest({ versionCode: 14, versionName: "" })).toBeNull();
    expect(parseLatest({ versionCode: 14, versionName: 140 })).toBeNull();
    expect(
      parseLatest({ versionCode: 14, versionName: "1.4.0", notes: 123 })
    ).toBeNull();
  });
});

describe("isNewer", () => {
  it("returns true when latest versionCode is greater than installed (13 vs 14)", () => {
    expect(isNewer({ versionCode: 14 }, "13")).toBe(true);
  });

  it("returns false when latest versionCode equals installed (14 vs 14)", () => {
    expect(isNewer({ versionCode: 14 }, "14")).toBe(false);
  });

  it("returns false when installed is newer than latest (15 vs 14)", () => {
    expect(isNewer({ versionCode: 14 }, "15")).toBe(false);
  });

  it("returns false when installed is null or unparsable", () => {
    expect(isNewer({ versionCode: 14 }, null)).toBe(false);
    expect(isNewer({ versionCode: 14 }, "")).toBe(false);
    expect(isNewer({ versionCode: 14 }, "abc")).toBe(false);
  });

  it("returns false when latest is null", () => {
    expect(isNewer(null, "13")).toBe(false);
  });
});

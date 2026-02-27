import { describe, expect, it } from "vitest";

import { getBaudrateOptions, normalizeBaudrate } from "@/lib/uart";

describe("uart helpers", () => {
  it("normalizes empty and invalid baudrate to default", () => {
    expect(normalizeBaudrate(undefined)).toBe("115200");
    expect(normalizeBaudrate(null)).toBe("115200");
    expect(normalizeBaudrate("")).toBe("115200");
    expect(normalizeBaudrate("   ")).toBe("115200");
    expect(normalizeBaudrate("abc")).toBe("115200");
  });

  it("keeps numeric baudrate values", () => {
    expect(normalizeBaudrate("9600")).toBe("9600");
    expect(normalizeBaudrate(" 230400 ")).toBe("230400");
  });

  it("returns sorted options and includes current value", () => {
    expect(getBaudrateOptions("9600")).toEqual(["9600", "19200", "38400", "57600", "115200"]);
    expect(getBaudrateOptions("230400")).toEqual([
      "9600",
      "19200",
      "38400",
      "57600",
      "115200",
      "230400",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { termsForSuffix } from "../prisma/seed/lib/sections.js";

describe("termsForSuffix", () => {
  it("maps A to Fall only", () => {
    expect(termsForSuffix("1001A")).toEqual(["FALL"]);
  });
  it("maps B to Winter only", () => {
    expect(termsForSuffix("1002B")).toEqual(["WINTER"]);
  });
  it("maps A/B to both terms", () => {
    expect(termsForSuffix("2210A/B")).toEqual(["FALL", "WINTER"]);
  });
  it("maps F to Fall and G to Winter", () => {
    expect(termsForSuffix("2290F/G")).toEqual(["FALL", "WINTER"]);
  });
  it("maps a bare full-course number (no suffix) to both terms", () => {
    expect(termsForSuffix("1000")).toEqual(["FALL", "WINTER"]);
  });
  it("maps Y/Z (other-session, no A/B/F/G) to both terms", () => {
    expect(termsForSuffix("4490Z")).toEqual(["FALL", "WINTER"]);
  });
  it("maps a multi-letter A/B/Y suffix to Fall and Winter", () => {
    expect(termsForSuffix("2212A/B/Y")).toEqual(["FALL", "WINTER"]);
  });
});

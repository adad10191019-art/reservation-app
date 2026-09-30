import { describe, expect, it } from "vitest";
import { productionTargets } from "./db-target";

const PROD = "postgresql://u:p@ep-orange-pond-b3d859bd-pooler.ap-southeast-1.aws.neon.tech/neondb";
const DEV = "postgresql://u:p@ep-calm-truth-b3uxvk62-pooler.ap-southeast-1.aws.neon.tech/neondb";

describe("productionTargets", () => {
  it("開発用のホストだけなら空", () => {
    expect(productionTargets({ DATABASE_URL: DEV, DIRECT_URL: DEV })).toEqual([]);
  });

  it("DATABASE_URL が本番なら見つける", () => {
    expect(productionTargets({ DATABASE_URL: PROD, DIRECT_URL: DEV })).toEqual([
      { name: "DATABASE_URL", host: "ep-orange-pond-b3d859bd-pooler.ap-southeast-1.aws.neon.tech" },
    ]);
  });

  it("DIRECT_URL だけ本番でも見つける", () => {
    expect(productionTargets({ DATABASE_URL: DEV, DIRECT_URL: PROD })).toHaveLength(1);
  });

  it("未設定や壊れた値は無視する", () => {
    expect(productionTargets({ DATABASE_URL: "not a url" })).toEqual([]);
    expect(productionTargets({})).toEqual([]);
  });
});

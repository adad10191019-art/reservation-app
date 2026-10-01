import { describe, expect, it } from "vitest";
import { type TenantStaff, planEmployeeTenants } from "./employee-tenants";

const takeuchi = { id: "e1", name: "竹内" };

function staff(id: string, name: string, employeeId: string | null = null, isActive = true): TenantStaff {
  return { id, name, isActive, employeeId };
}

describe("planEmployeeTenants", () => {
  it("チェックした部署に同じ名前の在籍スタッフがいれば、作らずにひも付ける", () => {
    const plans = planEmployeeTenants(takeuchi, new Set(["iroha"]), [
      { id: "iroha", staffs: [staff("s1", "竹内"), staff("s2", "担当者A")] },
    ]);
    expect(plans).toEqual([{ kind: "link", tenantId: "iroha", staffId: "s1", movedFromOther: false }]);
  });

  it("同じ名前のスタッフがいなければ作る（無効のスタッフは数えない）", () => {
    const plans = planEmployeeTenants(takeuchi, new Set(["fudosan"]), [
      { id: "fudosan", staffs: [staff("s3", "竹内", null, false)] },
    ]);
    expect(plans).toEqual([{ kind: "create", tenantId: "fudosan" }]);
  });

  it("重複して作った別の名簿の行にひも付いていれば、こちらへ付け替える", () => {
    const plans = planEmployeeTenants(takeuchi, new Set(["hikari"]), [
      { id: "hikari", staffs: [staff("s4", "竹内", "e2")] },
    ]);
    expect(plans).toEqual([{ kind: "link", tenantId: "hikari", staffId: "s4", movedFromOther: true }]);
  });

  it("すでにひも付いている部署は何もせず、チェックを外した部署はひも付けだけ外す", () => {
    const plans = planEmployeeTenants(takeuchi, new Set(["iroha"]), [
      { id: "iroha", staffs: [staff("s1", "竹内", "e1")] },
      { id: "hikari", staffs: [staff("s4", "竹内", "e1")] },
      { id: "fudosan", staffs: [staff("s5", "竹内")] },
    ]);
    expect(plans).toEqual([{ kind: "unlink", tenantId: "hikari", staffId: "s4" }]);
  });
});

import { describe, expect, it } from "vitest";
import {
  type AccessUser,
  canResetPassword,
  pickLoginTenant,
  resolveDeptSession,
  resolveMemberSession,
} from "./account-access";

function user(overrides: Partial<AccessUser> = {}): AccessUser {
  return {
    id: "u1",
    email: "u1@example.com",
    isGroupAdmin: false,
    lastTenantId: null,
    employee: null,
    memberships: [],
    ...overrides,
  };
}

const iroha = { tenantId: "iroha", role: "owner", staffId: "s-iroha", staff: { name: "竹内" } };
const fudosan = { tenantId: "fudosan", role: "staff", staffId: "s-fudosan", staff: { name: "竹内 誠" } };

describe("resolveDeptSession", () => {
  it("兼任の人は、部署ごとの役割とスタッフになる", () => {
    const u = user({ memberships: [iroha, fudosan] });
    expect(resolveDeptSession(u, "iroha", true)).toMatchObject({ role: "owner", staffId: "s-iroha", name: "竹内" });
    expect(resolveDeptSession(u, "fudosan", true)).toMatchObject({
      role: "staff",
      staffId: "s-fudosan",
      name: "竹内 誠",
    });
  });

  it("担当していない部署は使えない", () => {
    expect(resolveDeptSession(user({ memberships: [iroha] }), "fudosan", true)).toBeNull();
  });

  it("全社管理者はどの部署も使え、担当している部署ではスタッフも持つ", () => {
    const admin = user({ isGroupAdmin: true, memberships: [fudosan], employee: { name: "社長", isActive: true } });
    expect(resolveDeptSession(admin, "iroha", true)).toMatchObject({
      role: "group_admin",
      staffId: null,
      name: "社長",
    });
    expect(resolveDeptSession(admin, "fudosan", true)).toMatchObject({ role: "group_admin", staffId: "s-fudosan" });
    expect(resolveDeptSession(admin, "gone", false)).toBeNull();
  });

  it("名前はスタッフ名、無ければ名簿の名前、無ければメール", () => {
    const owner = { tenantId: "iroha", role: "owner", staffId: null, staff: null };
    expect(resolveDeptSession(user({ memberships: [owner] }), "iroha", true)?.name).toBe("u1@example.com");
    expect(
      resolveDeptSession(user({ memberships: [owner], employee: { name: "店長", isActive: true } }), "iroha", true)
        ?.name,
    ).toBe("店長");
  });
});

describe("resolveMemberSession", () => {
  it("担当部署が無く、名簿で在籍中の人だけ「全体スケジュール」を使える", () => {
    expect(resolveMemberSession(user({ employee: { name: "事務", isActive: true } }))).toMatchObject({
      role: "member",
      tenantId: null,
      name: "事務",
    });
    expect(resolveMemberSession(user({ employee: { name: "事務", isActive: false } }))).toBeNull();
    expect(resolveMemberSession(user())).toBeNull();
    expect(resolveMemberSession(user({ memberships: [iroha], employee: { name: "竹内", isActive: true } }))).toBeNull();
    expect(resolveMemberSession(user({ isGroupAdmin: true, employee: { name: "社長", isActive: true } }))).toBeNull();
  });
});

describe("pickLoginTenant", () => {
  it("前回の部署がまだ担当ならそこ、無ければ最初の担当部署", () => {
    expect(pickLoginTenant(user({ memberships: [iroha, fudosan], lastTenantId: "fudosan" }), [])).toBe("fudosan");
    expect(pickLoginTenant(user({ memberships: [iroha, fudosan], lastTenantId: "gone" }), [])).toBe("iroha");
    expect(pickLoginTenant(user(), [])).toBeNull();
  });

  it("全社管理者は前回の部署、無ければ担当部署、それも無ければ一番古い部署", () => {
    const all = ["old", "iroha", "fudosan"];
    expect(pickLoginTenant(user({ isGroupAdmin: true, lastTenantId: "iroha" }), all)).toBe("iroha");
    expect(pickLoginTenant(user({ isGroupAdmin: true, memberships: [fudosan] }), all)).toBe("fudosan");
    expect(pickLoginTenant(user({ isGroupAdmin: true }), all)).toBe("old");
  });
});

describe("canResetPassword", () => {
  const onlyIroha = { isGroupAdmin: false, memberships: [{ tenantId: "iroha" }] };
  const both = { isGroupAdmin: false, memberships: [{ tenantId: "iroha" }, { tenantId: "fudosan" }] };

  it("オーナーは、今の部署だけを担当している人だけ戻せる", () => {
    const owner = { role: "owner", tenantId: "iroha" };
    expect(canResetPassword(owner, onlyIroha)).toBe(true);
    expect(canResetPassword(owner, both)).toBe(false);
    expect(canResetPassword(owner, { isGroupAdmin: true, memberships: [{ tenantId: "iroha" }] })).toBe(false);
    expect(canResetPassword({ role: "staff", tenantId: "iroha" }, onlyIroha)).toBe(false);
  });

  it("全社管理者は誰でも戻せる", () => {
    expect(canResetPassword({ role: "group_admin", tenantId: "iroha" }, both)).toBe(true);
  });
});

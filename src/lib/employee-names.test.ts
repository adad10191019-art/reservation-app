import { describe, expect, it } from "vitest";
import { employeeOptionLabel, findSameNameEmployee, normalizeEmployeeName } from "./employee-names";

describe("normalizeEmployeeName", () => {
  it("空白の有無と全角・半角の違いを無視する", () => {
    expect(normalizeEmployeeName("竹内 太郎")).toBe("竹内太郎");
    expect(normalizeEmployeeName("竹内　太郎")).toBe("竹内太郎");
    expect(normalizeEmployeeName(" ＡＢＣ ")).toBe("ABC");
  });
});

describe("findSameNameEmployee", () => {
  const list = [
    { id: "1", name: "竹内", isActive: true },
    { id: "2", name: "事務 花子", isActive: true },
    { id: "3", name: "退職 一郎", isActive: false },
  ];

  it("在籍中の同じ名前の人を見つける", () => {
    expect(findSameNameEmployee(list, "竹内")?.id).toBe("1");
    expect(findSameNameEmployee(list, "事務　花子")?.id).toBe("2");
  });

  it("在籍していない人と、自分自身は対象にしない", () => {
    expect(findSameNameEmployee(list, "退職一郎")).toBeUndefined();
    expect(findSameNameEmployee(list, "竹内", "1")).toBeUndefined();
  });
});

describe("employeeOptionLabel", () => {
  it("所属部署を添え、同じ部署は1回だけ出す", () => {
    expect(employeeOptionLabel("竹内", ["就活のイロハ", "youth光回線案内"])).toBe(
      "竹内（就活のイロハ・youth光回線案内）",
    );
    expect(employeeOptionLabel("竹内", ["A", "A"])).toBe("竹内（A）");
  });

  it("どの部署にもひも付いていなければ「部署なし」", () => {
    expect(employeeOptionLabel("事務 花子", [])).toBe("事務 花子（部署なし）");
  });
});

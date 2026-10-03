import { describe, expect, it } from "vitest";
import { orderByLoad, parseStaffSelection } from "./staff-assignment";

/** 渡した順に値を返す、決まった「くじ」 */
function lots(...values: number[]) {
  let i = 0;
  return () => values[i++];
}

describe("orderByLoad", () => {
  it("その日の予約が少ない人から試す", () => {
    const counts = new Map([
      ["a", 3],
      ["b", 0],
      ["c", 1],
    ]);
    expect(orderByLoad(["a", "b", "c"], counts, lots(0.1, 0.2, 0.3))).toEqual(["b", "c", "a"]);
  });

  it("予約が無い人は0件として扱う", () => {
    expect(orderByLoad(["a", "b"], new Map([["a", 1]]), lots(0.1, 0.9))).toEqual(["b", "a"]);
  });

  it("件数が同じなら並び順ではなく、くじで決める", () => {
    const counts = new Map([
      ["a", 2],
      ["b", 2],
    ]);
    expect(orderByLoad(["a", "b"], counts, lots(0.8, 0.3))).toEqual(["b", "a"]);
    expect(orderByLoad(["a", "b"], counts, lots(0.3, 0.8))).toEqual(["a", "b"]);
  });

  it("空いている人がいなければ空", () => {
    expect(orderByLoad([], new Map())).toEqual([]);
  });
});

describe("parseStaffSelection", () => {
  it("none のときだけ選ばせない。それ以外は選べる（今までの動き）", () => {
    expect(parseStaffSelection("none")).toBe("none");
    expect(parseStaffSelection("choose")).toBe("choose");
    expect(parseStaffSelection(null)).toBe("choose");
    expect(parseStaffSelection("おかしな値")).toBe("choose");
  });
});

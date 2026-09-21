import { describe, expect, it } from "vitest";
import { checkBookingWindow, filterBookableStarts, slotDateTime } from "./booking-window";
import { hm } from "./time";

/** 2026-09-21(月) 10:00 を「今」とする */
const NOW = new Date(2026, 8, 21, 10, 0, 0, 0);

const BASE = { windowDays: 30, leadMinutes: 120, now: NOW };

describe("枠の時刻", () => {
  it("日付と経過分から Date を作れる", () => {
    const d = slotDateTime("2026-09-21", hm("14:30"));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // 0始まり
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});

describe("受付できるかの判定", () => {
  it("十分先なら受けられる", () => {
    expect(checkBookingWindow({ ...BASE, date: "2026-09-22", startMinutes: hm("10:00") }).ok).toBe(
      true,
    );
  });

  it("締め切りちょうどは受けられる", () => {
    // 今が10:00、締め切りは2時間前なので 12:00 開始はぎりぎり可
    expect(checkBookingWindow({ ...BASE, date: "2026-09-21", startMinutes: hm("12:00") }).ok).toBe(
      true,
    );
  });

  it("締め切りを過ぎていれば受けない", () => {
    const r = checkBookingWindow({ ...BASE, date: "2026-09-21", startMinutes: hm("11:45") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("2時間前");
  });

  it("過ぎた時間は別の理由を返す", () => {
    const r = checkBookingWindow({ ...BASE, date: "2026-09-21", startMinutes: hm("09:00") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("過ぎた時間");
  });

  it("受付の上限より先は受けない", () => {
    // 30日先（10月21日）までは可、それ以降は不可
    expect(checkBookingWindow({ ...BASE, date: "2026-10-21", startMinutes: hm("10:00") }).ok).toBe(
      true,
    );
    const r = checkBookingWindow({ ...BASE, date: "2026-10-22", startMinutes: hm("10:00") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("30日先");
  });

  it("締め切りが0分なら開始時刻まで受けられる", () => {
    const r = checkBookingWindow({
      ...BASE,
      leadMinutes: 0,
      date: "2026-09-21",
      startMinutes: hm("10:00"),
    });
    expect(r.ok).toBe(true);
  });
});

describe("選べる枠だけを残す", () => {
  it("当日は締め切りより後の枠だけ残る", () => {
    const starts = [hm("09:00"), hm("11:00"), hm("12:00"), hm("15:00")];
    const left = filterBookableStarts(starts, { ...BASE, date: "2026-09-21" });
    expect(left).toEqual([hm("12:00"), hm("15:00")]);
  });

  it("翌日以降はそのまま残る", () => {
    const starts = [hm("09:00"), hm("11:00")];
    const left = filterBookableStarts(starts, { ...BASE, date: "2026-09-22" });
    expect(left).toEqual(starts);
  });
});

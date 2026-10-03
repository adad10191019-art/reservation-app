import { describe, expect, it } from "vitest";
import { type TeamSource, buildTeamColumns, layoutLanes, teamViewRange } from "./team-view";

const source: TeamSource = {
  employees: [
    { id: "e1", name: "竹内" },
    { id: "e2", name: "事務の人" },
  ],
  staffs: [
    { id: "s1", employeeId: "e1", tenantName: "イロハ" },
    { id: "s2", employeeId: "e1", tenantName: "就活支援" },
  ],
  events: [
    { id: "ev1", employeeId: "e1", startMinutes: 600, endMinutes: 660, title: "通院", isPrivate: true },
    { id: "ev2", employeeId: "e2", startMinutes: 540, endMinutes: 600, title: "銀行", isPrivate: false },
  ],
  reservations: [{ id: "r1", staffId: "s2", startMinutes: 780, endMinutes: 840 }],
  blocks: [{ id: "b1", staffId: "s1", startMinutes: 900, endMinutes: 960, reason: "部署会議" }],
  googleEvents: [],
};

describe("buildTeamColumns", () => {
  it("私用の予定は、本人以外には件名を隠す", () => {
    const [takeuchi] = buildTeamColumns(source, { employeeId: "e2", isAdmin: false });
    const event = takeuchi.items.find((i) => i.kind === "event")!;
    expect(event.label).toBe("予定あり");
    expect(JSON.stringify(takeuchi)).not.toContain("通院");
    expect(event.deletableEventId).toBeNull();
  });

  it("全社管理者にも私用の件名は見せないが、代わりに消すことはできる", () => {
    const [takeuchi] = buildTeamColumns(source, { employeeId: null, isAdmin: true });
    const event = takeuchi.items.find((i) => i.kind === "event")!;
    expect(event.label).toBe("予定あり");
    expect(event.deletableEventId).toBe("ev1");
  });

  it("本人には件名を見せ、消せる", () => {
    const [takeuchi] = buildTeamColumns(source, { employeeId: "e1", isAdmin: false });
    expect(takeuchi.isMe).toBe(true);
    const event = takeuchi.items.find((i) => i.kind === "event")!;
    expect(event.label).toBe("通院");
    expect(event.deletableEventId).toBe("ev1");
  });

  it("予約は部署名だけを出し、ブロック枠は件名と部署名を出す。兼任の部署はまとめて並ぶ", () => {
    const [takeuchi, jimu] = buildTeamColumns(source, { employeeId: "e2", isAdmin: false });
    expect(takeuchi.departments).toEqual(["イロハ", "就活支援"]);
    expect(takeuchi.items.map((i) => [i.kind, i.label, i.note])).toEqual([
      ["event", "予定あり", null],
      ["reservation", "予約", "就活支援"],
      ["block", "部署会議", "イロハ"],
    ]);
    expect(jimu.departments).toEqual([]);
    expect(jimu.items.map((i) => i.label)).toEqual(["銀行"]);
  });
});

describe("layoutLanes", () => {
  it("重なる項目は横に並べ、重ならない項目は幅いっぱいにする", () => {
    const items = [
      { id: "a", startMinutes: 600, endMinutes: 660 },
      { id: "b", startMinutes: 630, endMinutes: 690 },
      { id: "c", startMinutes: 700, endMinutes: 760 },
    ];
    const out = layoutLanes(items).map((o) => [o.item.id, o.lane, o.lanes]);
    expect(out).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ]);
  });
});

describe("teamViewRange", () => {
  it("予定が無ければ 9:00〜19:00、はみ出す予定があれば広げる", () => {
    expect(teamViewRange([])).toEqual({ start: 540, end: 1140 });
    const columns = buildTeamColumns(
      { ...source, events: [{ ...source.events[1], startMinutes: 450, endMinutes: 1230 }] },
      { employeeId: null, isAdmin: false },
    );
    expect(teamViewRange(columns)).toEqual({ start: 420, end: 1260 });
  });
});

describe("Google カレンダーの予定", () => {
  const withGoogle: TeamSource = {
    ...source,
    googleEvents: [
      { employeeId: "e1", startMinutes: 600, endMinutes: 660, title: null },
      { employeeId: "e2", startMinutes: 780, endMinutes: 840, title: "来客対応" },
      { employeeId: "e2", startMinutes: 0, endMinutes: 24 * 60, title: null },
    ],
  };

  it("件名を出さない人は「予定あり」、出す人は件名。どちらも消せない", () => {
    const [takeuchi, jimu] = buildTeamColumns(withGoogle, { employeeId: "e1", isAdmin: true });
    const mine = takeuchi.items.filter((i) => i.kind === "google");
    expect(mine.map((i) => i.label)).toEqual(["予定あり"]);
    const theirs = jimu.items.filter((i) => i.kind === "google");
    expect(theirs.map((i) => i.label)).toEqual(["予定あり", "来客対応"]);
    expect(theirs.every((i) => i.deletableEventId === null)).toBe(true);
  });

  it("終日の予定は印を付け、表示の範囲を広げない", () => {
    const columns = buildTeamColumns(withGoogle, { employeeId: null, isAdmin: false });
    const allDay = columns[1].items.find((i) => i.kind === "google" && i.startMinutes === 0)!;
    expect(allDay.note).toBe("終日（Googleカレンダー）");
    expect(teamViewRange(columns)).toEqual(teamViewRange(buildTeamColumns(source, { employeeId: null, isAdmin: false })));
  });
});

import { describe, expect, it } from "vitest";
import {
  type BusinessHourRow,
  type DateOverrideRow,
  computeStarts,
  resolveWorkingIntervals,
} from "./availability-core";
import { hm } from "./time";

const SATO = "sato";
const TANAKA = "tanaka";

/** 店舗全体：10:00-13:00 / 14:00-19:00（昼休憩あり） */
const SHOP_HOURS: BusinessHourRow[] = [
  { staffId: null, startMinutes: hm("10:00"), endMinutes: hm("13:00") },
  { staffId: null, startMinutes: hm("14:00"), endMinutes: hm("19:00") },
];

/** 田中だけ時短：10:00-16:00 通し */
const TANAKA_HOURS: BusinessHourRow[] = [
  { staffId: TANAKA, startMinutes: hm("10:00"), endMinutes: hm("16:00") },
];

const NO_OVERRIDE: DateOverrideRow[] = [];

describe("勤務できる時間帯", () => {
  it("個別設定がなければ店舗全体の営業時間を使う", () => {
    const working = resolveWorkingIntervals({
      staffId: SATO,
      businessHours: SHOP_HOURS,
      dateOverrides: NO_OVERRIDE,
    });
    expect(working).toEqual([
      { start: hm("10:00"), end: hm("13:00") },
      { start: hm("14:00"), end: hm("19:00") },
    ]);
  });

  it("スタッフ個別の営業時間があればそちらが優先される", () => {
    const working = resolveWorkingIntervals({
      staffId: TANAKA,
      businessHours: [...SHOP_HOURS, ...TANAKA_HOURS],
      dateOverrides: NO_OVERRIDE,
    });
    expect(working).toEqual([{ start: hm("10:00"), end: hm("16:00") }]);
  });

  it("スタッフ個別の終日休みは空になる", () => {
    const working = resolveWorkingIntervals({
      staffId: SATO,
      businessHours: SHOP_HOURS,
      dateOverrides: [
        { staffId: SATO, isClosed: true, startMinutes: null, endMinutes: null },
      ],
    });
    expect(working).toEqual([]);
  });

  it("スタッフ個別の例外日は、その日の勤務時間を置き換える", () => {
    const working = resolveWorkingIntervals({
      staffId: SATO,
      businessHours: SHOP_HOURS,
      dateOverrides: [
        {
          staffId: SATO,
          isClosed: false,
          startMinutes: hm("13:00"),
          endMinutes: hm("17:00"),
        },
      ],
    });
    expect(working).toEqual([{ start: hm("13:00"), end: hm("17:00") }]);
  });

  it("店舗全体の短縮営業は全員に掛かる（重なりを取る）", () => {
    const working = resolveWorkingIntervals({
      staffId: SATO,
      businessHours: SHOP_HOURS,
      dateOverrides: [
        {
          staffId: null,
          isClosed: false,
          startMinutes: hm("10:00"),
          endMinutes: hm("15:00"),
        },
      ],
    });
    expect(working).toEqual([
      { start: hm("10:00"), end: hm("13:00") },
      { start: hm("14:00"), end: hm("15:00") },
    ]);
  });

  it("店舗全体の休業は、スタッフ個別の設定より強い", () => {
    const working = resolveWorkingIntervals({
      staffId: TANAKA,
      businessHours: [...SHOP_HOURS, ...TANAKA_HOURS],
      dateOverrides: [
        { staffId: null, isClosed: true, startMinutes: null, endMinutes: null },
        {
          staffId: TANAKA,
          isClosed: false,
          startMinutes: hm("10:00"),
          endMinutes: hm("16:00"),
        },
      ],
    });
    expect(working).toEqual([]);
  });
});

describe("開始できる時刻", () => {
  const working = [
    { start: hm("10:00"), end: hm("13:00") },
    { start: hm("14:00"), end: hm("19:00") },
  ];

  it("昼休憩をまたぐ予約は出ない", () => {
    // カット60分 + 片付け10分 = 70分
    const starts = computeStarts({
      working,
      busy: [],
      requiredMinutes: 70,
      slotMinutes: 15,
    });
    expect(starts).toContain(hm("11:45")); // 11:45 + 70分 = 12:55 → 収まる
    expect(starts).not.toContain(hm("12:00")); // 12:00 + 70分 = 13:10 → 昼休憩に食い込む
    expect(starts).toContain(hm("14:00"));
  });

  it("営業時間をまたぐ予約は出ない", () => {
    const starts = computeStarts({
      working,
      busy: [],
      requiredMinutes: 70,
      slotMinutes: 15,
    });
    expect(starts.at(-1)).toBe(hm("17:45")); // 17:45 + 70分 = 18:55 → 19:00 に収まる
    expect(starts).not.toContain(hm("18:00"));
  });

  it("予約済みの時間帯は塞がれ、次は刻みに揃った時刻から", () => {
    // 10:30-11:05 が埋まっている（ヘッドスパ30分 + 片付け5分）
    const starts = computeStarts({
      working: [{ start: hm("10:00"), end: hm("16:00") }],
      busy: [{ start: hm("10:30"), end: hm("11:05") }],
      requiredMinutes: 35,
      slotMinutes: 15,
    });
    expect(starts).not.toContain(hm("10:00")); // 10:00 開始だと 10:35 で予約に重なる
    expect(starts[0]).toBe(hm("11:15")); // 11:05 の次に刻みへ乗るのは 11:15
  });

  it("予約がちょうど接している場合は詰めて入る", () => {
    const starts = computeStarts({
      working: [{ start: hm("10:00"), end: hm("12:00") }],
      busy: [{ start: hm("10:00"), end: hm("11:00") }],
      requiredMinutes: 60,
      slotMinutes: 15,
    });
    expect(starts).toEqual([hm("11:00")]);
  });

  it("休みの日は空になる", () => {
    expect(
      computeStarts({ working: [], busy: [], requiredMinutes: 70, slotMinutes: 15 }),
    ).toEqual([]);
  });
});

describe("分割シフト（例外日を複数行で表す）", () => {
  it("スタッフの分割シフトが両方とも反映される", () => {
    // その日だけ 10:00-13:00 と 16:00-20:00 に入る
    const working = resolveWorkingIntervals({
      staffId: SATO,
      businessHours: SHOP_HOURS,
      dateOverrides: [
        {
          staffId: SATO,
          isClosed: false,
          startMinutes: hm("10:00"),
          endMinutes: hm("13:00"),
        },
        {
          staffId: SATO,
          isClosed: false,
          startMinutes: hm("16:00"),
          endMinutes: hm("20:00"),
        },
      ],
    });
    expect(working).toEqual([
      { start: hm("10:00"), end: hm("13:00") },
      { start: hm("16:00"), end: hm("20:00") },
    ]);
  });

  it("分割シフトの切れ目をまたぐ予約は出ない", () => {
    const working = resolveWorkingIntervals({
      staffId: SATO,
      businessHours: SHOP_HOURS,
      dateOverrides: [
        {
          staffId: SATO,
          isClosed: false,
          startMinutes: hm("10:00"),
          endMinutes: hm("13:00"),
        },
        {
          staffId: SATO,
          isClosed: false,
          startMinutes: hm("16:00"),
          endMinutes: hm("20:00"),
        },
      ],
    });
    const starts = computeStarts({
      working,
      busy: [],
      requiredMinutes: 70,
      slotMinutes: 15,
    });
    expect(starts).toContain(hm("11:45")); // 午前の最終
    expect(starts).not.toContain(hm("12:00")); // 13:00 を越えるので出ない
    expect(starts).not.toContain(hm("14:00")); // 勤務外
    expect(starts).toContain(hm("16:00")); // 夜の最初
    expect(starts.at(-1)).toBe(hm("18:45")); // 18:45 + 70分 = 19:55
  });

  it("店舗全体の分割営業も全スタッフに掛かる", () => {
    // 店舗が 10:00-12:00 と 15:00-18:00 のみ営業する日
    const working = resolveWorkingIntervals({
      staffId: TANAKA,
      businessHours: [...SHOP_HOURS, ...TANAKA_HOURS], // 田中は 10:00-16:00 通し
      dateOverrides: [
        {
          staffId: null,
          isClosed: false,
          startMinutes: hm("10:00"),
          endMinutes: hm("12:00"),
        },
        {
          staffId: null,
          isClosed: false,
          startMinutes: hm("15:00"),
          endMinutes: hm("18:00"),
        },
      ],
    });
    // 田中の勤務（10:00-16:00）と店舗の営業（10-12, 15-18）の重なり
    expect(working).toEqual([
      { start: hm("10:00"), end: hm("12:00") },
      { start: hm("15:00"), end: hm("16:00") },
    ]);
  });

  it("複数行のうち1行でも終日休みなら、その日は休み", () => {
    const working = resolveWorkingIntervals({
      staffId: SATO,
      businessHours: SHOP_HOURS,
      dateOverrides: [
        {
          staffId: SATO,
          isClosed: false,
          startMinutes: hm("10:00"),
          endMinutes: hm("13:00"),
        },
        { staffId: SATO, isClosed: true, startMinutes: null, endMinutes: null },
      ],
    });
    expect(working).toEqual([]);
  });

  it("例外日がなければ、これまでどおり曜日パターンが使われる", () => {
    const working = resolveWorkingIntervals({
      staffId: SATO,
      businessHours: SHOP_HOURS,
      dateOverrides: NO_OVERRIDE,
    });
    expect(working).toEqual([
      { start: hm("10:00"), end: hm("13:00") },
      { start: hm("14:00"), end: hm("19:00") },
    ]);
  });
});

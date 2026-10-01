import { describe, expect, it } from "vitest";
import {
  type ReservationSummary,
  reservationCanceledSubject,
  reservationCanceledText,
  reservationCreatedSubject,
  reservationCreatedText,
  reservationReminderSubject,
  reservationReminderText,
  staffCanceledSubject,
  staffNewReservationSubject,
  withSendOnlyNotice,
} from "./notify-text";
import { hm } from "./time";

const BASE: ReservationSummary = {
  shopName: "サンプルヘアサロン",
  customerName: "山田 花子",
  staffName: "佐藤",
  menuName: "カット",
  date: "2026-09-24",
  startMinutes: hm("11:00"),
  price: 4400,
};

describe("予約完了の文面", () => {
  it("日時・メニュー・担当・料金が入る", () => {
    const text = reservationCreatedText(BASE);
    expect(text).toContain("山田 花子 様");
    expect(text).toContain("サンプルヘアサロン");
    expect(text).toContain("9月24日(木) 11:00");
    expect(text).toContain("カット（4,400円）");
    expect(text).toContain("担当：佐藤");
  });

  it("URLがあれば案内を添える", () => {
    const text = reservationCreatedText({
      ...BASE,
      myPageUrl: "https://example.com/book/sample-salon/mine",
    });
    expect(text).toContain("https://example.com/book/sample-salon/mine");
  });

  it("URLがなければ案内を省く", () => {
    expect(reservationCreatedText(BASE)).not.toContain("こちら");
  });
});

describe("リマインドの文面", () => {
  it("明日の予約であることが分かる", () => {
    const text = reservationReminderText(BASE);
    expect(text).toContain("明日");
    expect(text).toContain("9月24日(木) 11:00");
  });
});

describe("キャンセルの文面", () => {
  it("キャンセルした旨が入る", () => {
    const text = reservationCanceledText(BASE);
    expect(text).toContain("キャンセルしました");
    expect(text).toContain("9月24日(木) 11:00");
  });

  it("キャンセル後は確認URLを載せない", () => {
    const text = reservationCanceledText({
      ...BASE,
      myPageUrl: "https://example.com/book/sample-salon/mine",
    });
    expect(text).not.toContain("https://example.com");
  });
});

describe("店舗側への通知メールの件名", () => {
  it("新規予約は店舗名・日時が入る", () => {
    const subject = staffNewReservationSubject(BASE);
    expect(subject).toContain("サンプルヘアサロン");
    expect(subject).toContain("9月24日(木) 11:00");
    expect(subject).toContain("ネット予約が入りました");
  });

  it("キャンセルは店舗名・日時が入る", () => {
    const subject = staffCanceledSubject(BASE);
    expect(subject).toContain("サンプルヘアサロン");
    expect(subject).toContain("9月24日(木) 11:00");
    expect(subject).toContain("キャンセル");
  });
});

describe("お客様へのメールの件名と末尾", () => {
  it("件名に店舗名・日時と、何の知らせかが入る", () => {
    expect(reservationCreatedSubject(BASE)).toBe(
      "【サンプルヘアサロン】ご予約を承りました（9月24日(木) 11:00）",
    );
    expect(reservationReminderSubject(BASE)).toContain("明日のご予約");
    expect(reservationCanceledSubject(BASE)).toContain("キャンセル");
  });

  it("本文の後ろに、送信専用であることと問い合わせ先を足す", () => {
    const text = withSendOnlyNotice("本文", "サンプルヘアサロン");
    expect(text.startsWith("本文\n")).toBe(true);
    expect(text).toContain("このメールは送信専用です");
    expect(text).toContain("サンプルヘアサロン へ直接ご連絡ください");
  });
});

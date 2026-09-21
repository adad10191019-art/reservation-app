/**
 * LINEに送る文面の組み立て。
 *
 * 送信そのものとは切り離してある。文面はDBもネットワークも触らない純粋な処理なので、
 * そのままテストできる。
 */
import { formatDateLabel, toHm } from "./time";

export type ReservationSummary = {
  shopName: string;
  customerName: string;
  staffName: string;
  menuName: string;
  date: string; // "YYYY-MM-DD"
  startMinutes: number;
  price: number;
  /** ご自分の予約を確認できるURL。未設定なら案内文を省く */
  myPageUrl?: string;
};

function baseLines(r: ReservationSummary): string[] {
  return [
    `${formatDateLabel(r.date)} ${toHm(r.startMinutes)}`,
    `${r.menuName}（${r.price.toLocaleString()}円）`,
    `担当：${r.staffName}`,
  ];
}

function withMyPage(lines: string[], url?: string): string {
  if (!url) return lines.join("\n");
  return [...lines, "", `ご確認・キャンセルはこちら`, url].join("\n");
}

/** 予約を受け付けたとき */
export function reservationCreatedText(r: ReservationSummary): string {
  return withMyPage(
    [
      `${r.customerName} 様`,
      "",
      `${r.shopName} のご予約を承りました。`,
      "",
      ...baseLines(r),
    ],
    r.myPageUrl,
  );
}

/** 前日のリマインド */
export function reservationReminderText(r: ReservationSummary): string {
  return withMyPage(
    [
      `${r.customerName} 様`,
      "",
      `明日 ${r.shopName} のご予約です。お待ちしております。`,
      "",
      ...baseLines(r),
    ],
    r.myPageUrl,
  );
}

/** キャンセルを受け付けたとき */
export function reservationCanceledText(r: ReservationSummary): string {
  return [
    `${r.customerName} 様`,
    "",
    `${r.shopName} の下記ご予約をキャンセルしました。`,
    "",
    ...baseLines(r),
  ].join("\n");
}

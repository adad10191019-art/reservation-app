/**
 * LINE・メールで送る文面の組み立て。
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

// ── 店舗側への通知 ────────────────────────

/** ネット予約が入ったことをお店に知らせる */
export function staffNewReservationText(r: ReservationSummary): string {
  return [
    "【ネット予約が入りました】",
    "",
    ...baseLines(r),
    `お客様：${r.customerName} 様`,
  ].join("\n");
}

/** お客様がキャンセルしたことをお店に知らせる */
export function staffCanceledText(r: ReservationSummary): string {
  return [
    "【お客様がキャンセルしました】",
    "",
    ...baseLines(r),
    `お客様：${r.customerName} 様`,
  ].join("\n");
}

// ── 店舗側への通知（メールの件名） ────────

export function staffNewReservationSubject(r: ReservationSummary): string {
  return `【${r.shopName}】ネット予約が入りました（${formatDateLabel(r.date)} ${toHm(r.startMinutes)}）`;
}

export function staffCanceledSubject(r: ReservationSummary): string {
  return `【${r.shopName}】予約がキャンセルされました（${formatDateLabel(r.date)} ${toHm(r.startMinutes)}）`;
}

// ── お客様へのメール（件名・末尾の一文） ────

function whenLabel(r: ReservationSummary): string {
  return `${formatDateLabel(r.date)} ${toHm(r.startMinutes)}`;
}

export function reservationCreatedSubject(r: ReservationSummary): string {
  return `【${r.shopName}】ご予約を承りました（${whenLabel(r)}）`;
}

export function reservationReminderSubject(r: ReservationSummary): string {
  return `【${r.shopName}】明日のご予約のお知らせ（${whenLabel(r)}）`;
}

export function reservationCanceledSubject(r: ReservationSummary): string {
  return `【${r.shopName}】ご予約のキャンセルを承りました（${whenLabel(r)}）`;
}

/**
 * メールの末尾に足す一文。送信用のアドレスには受信箱が無く、
 * 返信しても店舗には届かないため、その旨を書いておく。
 */
export function withSendOnlyNotice(text: string, shopName: string): string {
  return [
    text,
    "",
    "――――",
    "このメールは送信専用です。ご返信いただいてもお返事できません。",
    `お問い合わせは ${shopName} へ直接ご連絡ください。`,
  ].join("\n");
}

// ── イベント（定員つきの集まり）のお客様向け ──

export type EventSummary = {
  shopName: string;
  customerName: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  startMinutes: number;
  endMinutes: number;
  venue: string;
  /** ご自分の申し込みを確認できるURL。未設定なら案内文を省く */
  myPageUrl?: string;
};

function eventLines(e: EventSummary): string[] {
  return [
    e.title,
    `${formatDateLabel(e.date)} ${toHm(e.startMinutes)}〜${toHm(e.endMinutes)}`,
    ...(e.venue ? [`会場：${e.venue}`] : []),
  ];
}

export function eventEntryCreatedText(e: EventSummary): string {
  return withMyPage(
    [`${e.customerName} 様`, "", `${e.shopName} へのお申し込みを承りました。`, "", ...eventLines(e)],
    e.myPageUrl,
  );
}

export function eventReminderText(e: EventSummary): string {
  return withMyPage(
    [`${e.customerName} 様`, "", `明日は ${e.shopName} のイベントです。お待ちしております。`, "", ...eventLines(e)],
    e.myPageUrl,
  );
}

export function eventEntryCanceledText(e: EventSummary): string {
  return [`${e.customerName} 様`, "", `${e.shopName} の下記のお申し込みをキャンセルしました。`, "", ...eventLines(e)].join(
    "\n",
  );
}

function eventWhen(e: EventSummary): string {
  return `${formatDateLabel(e.date)} ${toHm(e.startMinutes)}`;
}

export function eventEntryCreatedSubject(e: EventSummary): string {
  return `【${e.shopName}】お申し込みを承りました（${e.title} ${eventWhen(e)}）`;
}

export function eventReminderSubject(e: EventSummary): string {
  return `【${e.shopName}】明日のイベントのお知らせ（${e.title} ${eventWhen(e)}）`;
}

export function eventEntryCanceledSubject(e: EventSummary): string {
  return `【${e.shopName}】お申し込みのキャンセルを承りました（${e.title} ${eventWhen(e)}）`;
}

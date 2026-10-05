/**
 * 変更履歴。
 *
 * ブロック枠・日付ごとの勤務時間は、本人（スタッフ）も自分の分だけ
 * 作成・削除できる。間違って消してしまったときに追えるよう、
 * 誰が・いつ・何をしたかをここに残す。
 *
 * 記録が主目的の補助的な処理なので、失敗しても本来の操作
 * （ブロック枠の作成など）を止めない。
 */
import { prisma } from "./prisma";
import { formatDateLabel, toHm } from "./time";

export type ChangeEntity = "block" | "dateOverride" | "reservation";
export type ChangeAction = "created" | "deleted" | "moved" | "updated";

export async function logChange(params: {
  tenantId: string;
  actorName: string;
  entity: ChangeEntity;
  action: ChangeAction;
  summary: string;
}): Promise<void> {
  try {
    await prisma.changeLog.create({
      data: {
        tenantId: params.tenantId,
        actorName: params.actorName,
        entity: params.entity,
        action: params.action,
        summary: params.summary,
      },
    });
  } catch (e) {
    // 記録に失敗しても、本来の操作（予定の作成・削除）は成立させる
    console.error("変更履歴の記録に失敗しました", e);
  }
}

/**
 * 予約の移動（日時・担当の変更）を履歴に残す。
 * カレンダーのドラッグでも、予約詳細のフォームでも、同じ書き方で残す。
 *
 * 移動前の状態は、呼び出し側が移動の前に読んでおいて渡す。
 */
export async function logReservationMoved(params: {
  tenantId: string;
  actorName: string;
  before: {
    date: string;
    startMinutes: number;
    staffId: string;
    menuNameSnapshot: string;
    staff: { name: string };
    customer: { name: string };
  };
  after: { date: string; startMinutes: number; staffId: string };
}): Promise<void> {
  const { before, after } = params;

  const newStaffName =
    before.staffId === after.staffId
      ? before.staff.name
      : ((
          await prisma.staff.findFirst({
            where: { id: after.staffId, tenantId: params.tenantId },
          })
        )?.name ?? "不明");

  const fromText = `${formatDateLabel(before.date)} ${toHm(before.startMinutes)}（${before.staff.name}）`;
  const toText = `${formatDateLabel(after.date)} ${toHm(after.startMinutes)}（${newStaffName}）`;

  await logChange({
    tenantId: params.tenantId,
    actorName: params.actorName,
    entity: "reservation",
    action: "moved",
    summary: `${before.menuNameSnapshot}（${before.customer.name} 様）を ${fromText} → ${toText} に移動`,
  });
}

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

export type ChangeEntity = "block" | "dateOverride";
export type ChangeAction = "created" | "deleted";

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

import { saveEvent } from "@/lib/event-actions";
import { toHm } from "@/lib/time";

const INPUT = "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

/** イベントを作る・直す欄。event が null なら新しく作る */
export function EventForm({
  event,
}: {
  event: {
    id: string;
    title: string;
    description: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    capacity: number;
    venue: string;
    isOpen: boolean;
  } | null;
}) {
  return (
    <form action={saveEvent} className="grid gap-3 sm:grid-cols-12">
      {event && <input type="hidden" name="id" value={event.id} />}

      <label className="block sm:col-span-12">
        <span className="mb-1 block text-xs font-medium text-neutral-600">イベント名</span>
        <input
          type="text"
          name="title"
          required
          maxLength={100}
          defaultValue={event?.title ?? ""}
          placeholder="就活支援説明会"
          className={INPUT}
        />
      </label>

      <label className="block sm:col-span-4">
        <span className="mb-1 block text-xs font-medium text-neutral-600">開催日</span>
        <input type="date" name="date" required defaultValue={event?.date ?? ""} className={INPUT} />
      </label>
      <label className="block sm:col-span-3">
        <span className="mb-1 block text-xs font-medium text-neutral-600">開始</span>
        <input
          type="time"
          name="start"
          required
          step={300}
          defaultValue={event ? toHm(event.startMinutes) : "19:00"}
          className={INPUT}
        />
      </label>
      <label className="block sm:col-span-3">
        <span className="mb-1 block text-xs font-medium text-neutral-600">終了</span>
        <input
          type="time"
          name="end"
          required
          step={300}
          defaultValue={event ? toHm(event.endMinutes) : "20:30"}
          className={INPUT}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-neutral-600">定員（名）</span>
        <input
          type="number"
          name="capacity"
          required
          min={1}
          max={10000}
          defaultValue={event?.capacity ?? 20}
          className={INPUT}
        />
      </label>

      <label className="block sm:col-span-12">
        <span className="mb-1 block text-xs font-medium text-neutral-600">会場（会場名・住所）</span>
        <input
          type="text"
          name="venue"
          maxLength={200}
          defaultValue={event?.venue ?? ""}
          placeholder="〇〇ビル 3階 会議室A（東京都〇〇区…）"
          className={INPUT}
        />
      </label>

      <label className="block sm:col-span-12">
        <span className="mb-1 block text-xs font-medium text-neutral-600">
          説明（内容・持ち物・注意事項など。お客様の画面に出ます）
        </span>
        <textarea
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={event?.description ?? ""}
          className={INPUT}
        />
      </label>

      <div className="flex flex-wrap items-center gap-4 sm:col-span-12">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="isOpen" defaultChecked={event?.isOpen ?? true} className="size-4" />
          受付中（お客様の画面に出して、申し込みを受ける）
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {event ? "更新する" : "作成する"}
        </button>
      </div>
    </form>
  );
}

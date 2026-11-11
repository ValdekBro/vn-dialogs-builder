import { randomUUID } from "node:crypto";
import type { ApprovalRequest } from "../../shared/api";

export type ApprovalStatus = "approved" | "rejected" | "timeout";
export type ApprovalInput = Omit<ApprovalRequest, "id" | "expiresAt">;

type Options = {
  /** Чи питати людину взагалі («Підтверджувати видалення агентом»). */
  enabled: () => boolean;
  timeoutSec: () => number;
  /** Показати запит у вікні (`null` — сховати). */
  onShow: (request: ApprovalRequest | null) => void;
};

type Pending = { request: ApprovalInput; resolve: (s: ApprovalStatus) => void };

/**
 * Черга підтверджень видалень агентом (MCP.md, 5.9). Показується один запит за раз,
 * решта чекають у черзі. Таймер кожного запиту стартує, коли його показали людині.
 */
export class Approvals {
  #options: Options;
  #queue: Pending[] = [];
  #current: { request: ApprovalRequest; resolve: (s: ApprovalStatus) => void; timer: NodeJS.Timeout } | null = null;

  constructor(options: Options) {
    this.#options = options;
  }

  get current(): ApprovalRequest | null {
    return this.#current?.request ?? null;
  }

  request(input: ApprovalInput): Promise<ApprovalStatus> {
    if (!this.#options.enabled()) return Promise.resolve("approved");
    return new Promise((resolve) => {
      this.#queue.push({ request: input, resolve });
      this.#next();
    });
  }

  respond(id: string, approved: boolean) {
    if (this.#current?.request.id !== id) return;
    this.#finish(approved ? "approved" : "rejected");
  }

  /** Скасувати все (вихід із застосунку, закриття проєкту). */
  cancelAll() {
    for (const p of this.#queue.splice(0)) p.resolve("rejected");
    if (this.#current) this.#finish("rejected");
  }

  #next() {
    if (this.#current || this.#queue.length === 0) return;
    const { request, resolve } = this.#queue.shift()!;
    const ms = this.#options.timeoutSec() * 1000;
    const full: ApprovalRequest = { ...request, id: randomUUID(), expiresAt: Date.now() + ms };
    const timer = setTimeout(() => this.#finish("timeout"), ms);
    this.#current = { request: full, resolve, timer };
    this.#options.onShow(full);
  }

  #finish(status: ApprovalStatus) {
    const cur = this.#current;
    if (!cur) return;
    clearTimeout(cur.timer);
    this.#current = null;
    this.#options.onShow(null);
    cur.resolve(status);
    this.#next();
  }
}

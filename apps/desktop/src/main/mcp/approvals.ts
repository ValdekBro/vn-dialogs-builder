import { randomUUID } from "node:crypto";
import type { ApprovalRequest } from "../../shared/api";

export type ApprovalStatus = "approved" | "rejected" | "timeout";
export type ApprovalInput = Omit<ApprovalRequest, "id" | "expiresAt">;

type Options = {
  /** Whether to ask the human at all ("Confirm agent deletions" setting). */
  enabled: () => boolean;
  timeoutSec: () => number;
  /** Show the request in the window (`null` hides it). */
  onShow: (request: ApprovalRequest | null) => void;
};

type Pending = { request: ApprovalInput; resolve: (s: ApprovalStatus) => void };

/**
 * Queue of agent deletion approvals (MCP.md, 5.9). One request is shown at a time,
 * the rest wait in the queue. Each request's timer starts when it is shown to the human.
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

  /** Cancel everything (app quit, project close). */
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

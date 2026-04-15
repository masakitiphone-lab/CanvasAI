import type { ConversationAttachment } from "@/lib/canvas-types";

type WorkerSuccess<T> = { id: number; ok: true; data: T };
type WorkerFailure = { id: number; ok: false; error?: { message?: string } };

type PyodideArtifact = {
  name: string;
  path: string;
  mimeType: string;
  bytesBase64: string;
};

type PyodideStagedInput = {
  name: string;
  path: string | null;
  kind: ConversationAttachment["kind"];
  url: string;
};

export type PyodideRunResult = {
  success: boolean;
  errorMessage: string | null;
  stdout: string;
  stderr: string;
  detectedPackages: string[];
  installedPackages: string[];
  failedPackages: Array<{ name: string; error: string }>;
  files: PyodideArtifact[];
  stagedInputs: PyodideStagedInput[];
};

class PyodideClient {
  private worker: Worker | null = null;

  private nextMessageId = 1;

  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void; timeoutId: number }>();

  private getWorker() {
    if (!this.worker) {
      this.worker = new Worker("/pyodide-worker.js");
      this.worker.addEventListener("message", (event: MessageEvent<WorkerSuccess<unknown> | WorkerFailure>) => {
        const payload = event.data;
        const pending = this.pending.get(payload.id);
        if (!pending) {
          return;
        }

        window.clearTimeout(pending.timeoutId);
        this.pending.delete(payload.id);

        if (payload.ok) {
          pending.resolve(payload.data);
        } else {
          pending.reject(new Error(payload.error?.message ?? "Pyodide worker request failed."));
        }
      });

      this.worker.addEventListener("error", (event) => {
        const pendingEntries = Array.from(this.pending.values());
        this.pending.clear();
        pendingEntries.forEach((entry) => {
          window.clearTimeout(entry.timeoutId);
          entry.reject(event.error ?? new Error(event.message || "Pyodide worker crashed."));
        });
        this.worker?.terminate();
        this.worker = null;
      });
    }

    return this.worker;
  }

  private call<T>(type: string, payload: unknown, timeoutMs: number) {
    const id = this.nextMessageId++;
    const worker = this.getWorker();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Pyodide request timed out after ${Math.round(timeoutMs / 1000)}s.`));
      }, timeoutMs);

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timeoutId });
      worker.postMessage({ id, type, payload });
    });
  }

  async ensureReady() {
    return this.call<{ ready: boolean; version: string }>("init", {}, 45_000);
  }

  async runCode(params: {
    code: string;
    attachments: ConversationAttachment[];
    contextText?: string;
  }) {
    return this.call<PyodideRunResult>("run", params, 120_000);
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach((entry) => {
      window.clearTimeout(entry.timeoutId);
      entry.reject(new Error("Pyodide worker disposed."));
    });
    this.pending.clear();
  }
}

export const pyodideClient = new PyodideClient();

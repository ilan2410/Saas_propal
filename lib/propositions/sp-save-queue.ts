'use client';

let pending: (() => Promise<void>) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;

/** Serialize saves; keep a failed save available for retry before navigation/export. */
export function scheduleSpSave(task: () => Promise<void>) {
  pending = task;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flushSpSaves().catch(() => {}); }, 500);
}

export function flushSpSaves(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  if (running) return running;
  running = (async () => {
    while (pending) {
      const task = pending;
      pending = null;
      try { await task(); }
      catch (error) { pending ??= task; throw error; }
    }
  })().finally(() => { running = null; });
  return running;
}

export function hasPendingSpSave() { return !!pending || !!running; }

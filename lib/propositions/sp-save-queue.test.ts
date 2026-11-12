import { afterEach, expect, it, vi } from 'vitest';
import { flushSpSaves, hasPendingSpSave, scheduleSpSave } from './sp-save-queue';

afterEach(async () => { await flushSpSaves(); vi.useRealTimers(); });

it('flushes a debounced correction before a copy or export', async () => {
  vi.useFakeTimers();
  const stale = vi.fn(async () => {}), latest = vi.fn(async () => {});
  scheduleSpSave(stale); scheduleSpSave(latest);
  expect(hasPendingSpSave()).toBe(true);
  await flushSpSaves();
  expect(stale).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce();
  expect(hasPendingSpSave()).toBe(false);
});

it('serializes in-flight saves and concurrent flush requests', async () => {
  let finish!: () => void;
  scheduleSpSave(() => new Promise<void>(resolve => { finish = resolve; }));
  const first = flushSpSaves();
  const next = vi.fn(async () => {});
  scheduleSpSave(next);
  const second = flushSpSaves();
  expect(next).not.toHaveBeenCalled();
  finish(); await Promise.all([first, second]);
  expect(next).toHaveBeenCalledOnce(); expect(hasPendingSpSave()).toBe(false);
});

it('blocks navigation on failure and allows retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  scheduleSpSave(save);
  await expect(flushSpSaves()).rejects.toThrow('offline');
  expect(hasPendingSpSave()).toBe(true);
  await flushSpSaves(); expect(save).toHaveBeenCalledTimes(2);
});

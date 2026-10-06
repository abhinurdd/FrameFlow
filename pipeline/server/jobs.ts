/** In-process job queue: one job runs at a time, the rest wait their turn. */

import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { OUT_DIR, TMP_DIR } from './media.ts';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export type Job = {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  error?: string;
  result?: object;
  /** File served by GET /jobs/:id/file. */
  file?: string;
  filename?: string;
};

export type JobContext = {
  id: string;
  /** Scratch directory, removed when the job ends. */
  tmp: string;
  progress: (p: number) => void;
};

export type JobOutput = { result?: object; file?: string; filename?: string; /** Delete `file` when the job is forgotten. */ ownsFile?: boolean };

const jobs = new Map<string, Job & { ownsFile?: boolean }>();
let queue: Promise<void> = Promise.resolve();
/** Finished jobs kept around so their status and file stay available. */
const KEEP = 40;

export function getJob(id: string) {
  return jobs.get(id);
}

async function forgetOld() {
  const finished = [...jobs.values()].filter((j) => j.status === 'done' || j.status === 'error');
  for (const job of finished.slice(0, Math.max(0, finished.length - KEEP))) {
    jobs.delete(job.id);
    if (job.ownsFile && job.file) await rm(job.file, { force: true });
  }
}

export function enqueue(kind: string, work: (ctx: JobContext) => Promise<JobOutput>): Job {
  const job: Job & { ownsFile?: boolean } = { id: randomBytes(8).toString('hex'), kind, status: 'queued', progress: 0 };
  jobs.set(job.id, job);
  queue = queue.then(async () => {
    const tmp = join(TMP_DIR, job.id);
    job.status = 'running';
    try {
      await mkdir(tmp, { recursive: true });
      await mkdir(OUT_DIR, { recursive: true });
      const out = await work({ id: job.id, tmp, progress: (p) => { job.progress = Math.min(1, Math.max(job.progress, p)); } });
      Object.assign(job, { result: out.result ?? {}, file: out.file, filename: out.filename, ownsFile: out.ownsFile, progress: 1, status: 'done' });
    } catch (e) {
      job.error = e instanceof Error ? e.message : String(e);
      job.status = 'error';
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
      await forgetOld().catch(() => {});
    }
  });
  return job;
}

/** Leftovers from a previous run: scratch directories and rendered files nobody can ask for any more. */
export async function clearStale() {
  await rm(TMP_DIR, { recursive: true, force: true });
  await rm(OUT_DIR, { recursive: true, force: true });
}

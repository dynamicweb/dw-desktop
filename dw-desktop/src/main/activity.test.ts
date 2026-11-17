import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { TransferJob } from '../shared/types'
import {
  INTERRUPTED,
  MAX_AGE_MS,
  MAX_JOBS,
  loadActivity,
  markInterrupted,
  pruneActivity,
  saveActivity
} from './activity'

const holder: { tmpDir: string } = { tmpDir: '' }

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => holder.tmpDir
  }
}))

const NOW = 1_800_000_000_000

function job(id: string, batchId: string, over: Partial<TransferJob> = {}): TransferJob {
  return {
    id,
    batchId,
    envName: 'Staging',
    direction: 'upload',
    label: id,
    remotePath: '/Files',
    localPath: `C:\\site\\${id}`,
    status: 'done',
    transferred: 1,
    total: 1,
    startedAt: NOW,
    ...over
  }
}

describe('pruneActivity', () => {
  it('drops batches older than 30 days', () => {
    const jobs = [job('a', 'new'), job('b', 'old', { startedAt: NOW - MAX_AGE_MS - 1 })]
    expect(pruneActivity(jobs, NOW).map((j) => j.id)).toEqual(['a'])
  })

  it('keeps whole batches and stops before the cap would split one', () => {
    const first = Array.from({ length: MAX_JOBS - 1 }, (_, i) => job(`f${i}`, 'first'))
    const second = [job('s1', 'second'), job('s2', 'second')]
    const kept = pruneActivity([...first, ...second], NOW)
    expect(kept).toHaveLength(MAX_JOBS - 1)
    expect(kept.some((j) => j.batchId === 'second')).toBe(false)
  })

  it('always keeps the newest batch, even when it is over the cap', () => {
    const big = Array.from({ length: MAX_JOBS + 10 }, (_, i) => job(`j${i}`, 'big'))
    expect(pruneActivity([...big, job('x', 'older')], NOW)).toHaveLength(MAX_JOBS + 10)
  })
})

describe('markInterrupted', () => {
  it('turns queued and running jobs into retryable failures', () => {
    const out = markInterrupted([
      job('q', 'b', { status: 'queued' }),
      job('a', 'b', { status: 'active' }),
      job('d', 'b')
    ])
    expect(out.map((j) => [j.status, j.error])).toEqual([
      ['error', INTERRUPTED],
      ['error', INTERRUPTED],
      ['done', undefined]
    ])
  })
})

describe('activity file', () => {
  beforeEach(async () => {
    holder.tmpDir = await mkdtemp(join(tmpdir(), 'dw-desktop-activity-'))
  })

  afterEach(async () => {
    await rm(holder.tmpDir, { recursive: true, force: true })
  })

  it('round-trips the history and marks unfinished jobs as interrupted', () => {
    const recent = Date.now()
    saveActivity([
      job('a', 'b', { status: 'active', startedAt: recent }),
      job('c', 'b', { startedAt: recent })
    ])
    const loaded = loadActivity()
    expect(loaded.map((j) => j.status)).toEqual(['error', 'done'])
  })

  it('returns an empty history when the file is missing or corrupt', async () => {
    expect(loadActivity()).toEqual([])
    await writeFile(join(holder.tmpDir, 'activity.json'), '{not json', 'utf8')
    expect(loadActivity()).toEqual([])
  })
})

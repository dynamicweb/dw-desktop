import { app } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { StoredEnv } from '../shared/types'

/**
 * What the app last saw on a site, so a sync can tell "changed on the server since
 * your last sync" from "just different". Mirrors the CLI v2 transfer state
 * (bin/transfer/state.js), kept in userData/transfer-state.json, keyed by
 * `protocol://host`:
 *
 *   files:  { "<remote api path, lower case>": { eTag, sha256, size, localMtimeMs } }
 *                                                                        — the baseline
 *   hashes: { "<remote api path, lower case>": { eTag, sha256 } }        — checksum cache
 *   roots:  { "<remote api dir, lower case>": syncedAt }                 — synced folders
 *
 * Only versions the app wrote or verified equal to local content become the
 * baseline; anything else would let an unreviewed server change become "known".
 */

export interface BaselineEntry {
  eTag: string
  /** Content hash when verified; null when the version was accepted by size and date only. */
  sha256: string | null
  size: number | null
  /**
   * Modified time of the local file when it last matched this version (the app wrote
   * it, or checked it equal by content). Lets a sync by date tell a file the app just
   * wrote from one edited since. Absent in entries from older versions.
   */
  localMtimeMs?: number
}

interface HostState {
  files: Record<string, BaselineEntry>
  hashes: Record<string, { eTag: string; sha256: string }>
  roots: Record<string, string>
}

type StateFile = Record<string, HostState>

let cache: StateFile | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'transfer-state.json')
}

function load(): StateFile {
  if (cache) return cache
  try {
    cache = JSON.parse(readFileSync(filePath(), 'utf8')) as StateFile
  } catch {
    cache = {}
  }
  return cache
}

function key(apiPath: string): string {
  return apiPath.toLowerCase()
}

function isUnder(candidate: string, root: string): boolean {
  return !root || candidate === root || candidate.startsWith(`${root}/`)
}

export interface TransferState {
  getFile(apiPath: string): BaselineEntry | null
  recordFile(apiPath: string, entry: BaselineEntry): void
  forget(apiPath: string): void
  /** SHA-256 of the file at `eTag`, from the baseline or the checksum cache. */
  knownHash(apiPath: string, eTag: string | null | undefined): string | null
  cacheHash(apiPath: string, eTag: string, sha256: string): void
  /** Whether this folder, or one containing it, was synced before. */
  isTracked(apiDir: string): boolean
  markRootSynced(apiDir: string): void
  save(): void
}

export function createTransferState(env: Pick<StoredEnv, 'protocol' | 'host'>): TransferState {
  const hostKey = `${env.protocol}://${env.host}`.toLowerCase()

  function host(): HostState {
    const state = load()
    state[hostKey] ??= { files: {}, hashes: {}, roots: {} }
    return state[hostKey]
  }

  return {
    getFile: (apiPath) => host().files[key(apiPath)] ?? null,
    recordFile: (apiPath, entry) => {
      if (entry.eTag) host().files[key(apiPath)] = entry
    },
    forget: (apiPath) => {
      const prefix = key(apiPath)
      const h = host()
      for (const table of [h.files, h.hashes]) {
        for (const name of Object.keys(table)) {
          if (isUnder(name, prefix)) delete table[name]
        }
      }
    },
    knownHash: (apiPath, eTag) => {
      if (!eTag) return null
      const h = host()
      for (const entry of [h.files[key(apiPath)], h.hashes[key(apiPath)]]) {
        if (entry?.sha256 && entry.eTag === eTag) return entry.sha256
      }
      return null
    },
    cacheHash: (apiPath, eTag, sha256) => {
      host().hashes[key(apiPath)] = { eTag, sha256 }
    },
    isTracked: (apiDir) => {
      const target = key(apiDir)
      return Object.keys(host().roots).some((root) => isUnder(target, root))
    },
    markRootSynced: (apiDir) => {
      host().roots[key(apiDir)] = new Date().toISOString()
    },
    save: () => {
      const tmp = `${filePath()}.tmp`
      writeFileSync(tmp, JSON.stringify(load(), null, 2), 'utf8')
      renameSync(tmp, filePath())
    }
  }
}

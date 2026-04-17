import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

// Hold the temp dir so the hoisted mock can reference it
const holder: { tmpDir: string } = { tmpDir: '' }

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => holder.tmpDir
  }
}))

describe('config', () => {
  beforeEach(async () => {
    holder.tmpDir = await mkdtemp(join(tmpdir(), 'dw-desktop-test-'))
    vi.resetModules()
  })

  afterEach(async () => {
    vi.resetModules()
    await rm(holder.tmpDir, { recursive: true, force: true })
  })

  async function loadModule(): Promise<typeof import('./config')> {
    return import('./config')
  }

  it('returns default config when file missing', async () => {
    const { loadConfig, initializeConfig } = await loadModule()
    await initializeConfig()
    const config = loadConfig()
    expect(config.version).toBe(1)
    expect(config.environments).toEqual([])
    expect(config.activeEnv).toBeNull()
  })

  it('add env → save → reload → env present', async () => {
    const { addEnv, initializeConfig } = await loadModule()
    await initializeConfig()
    addEnv({ name: 'prod', host: 'dw.example.com', protocol: 'https', authType: 'apiKey' })

    // Reload: fresh module reads from disk
    vi.resetModules()
    const fresh = await loadModule()
    await fresh.initializeConfig()
    expect(fresh.getEnvs()).toEqual([
      { name: 'prod', host: 'dw.example.com', protocol: 'https', authType: 'apiKey' }
    ])
  })

  it('remove env → save → reload → env absent', async () => {
    const { addEnv, removeEnv, initializeConfig } = await loadModule()
    await initializeConfig()
    addEnv({ name: 'prod', host: 'dw.example.com', protocol: 'https', authType: 'apiKey' })
    removeEnv('prod')

    vi.resetModules()
    const fresh = await loadModule()
    await fresh.initializeConfig()
    expect(fresh.getEnvs()).toEqual([])
  })

  it('atomic write: tmp file does not persist after save', async () => {
    const { addEnv, initializeConfig } = await loadModule()
    await initializeConfig()
    addEnv({ name: 'dev', host: 'localhost', protocol: 'http', authType: 'apiKey' })

    const { readdir } = await import('fs/promises')
    const files = await readdir(holder.tmpDir)
    expect(files).not.toContain('config.json.tmp')
    expect(files).toContain('config.json')
  })
})

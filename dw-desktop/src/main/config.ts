import { app } from 'electron'
import { renameSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { AppConfig, PaneState, StoredEnv, ThemeMode } from '../shared/types'

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function tmpPath(): string {
  return join(app.getPath('userData'), 'config.json.tmp')
}

const defaultConfig: AppConfig = {
  version: 1,
  environments: [],
  activeEnv: null,
  theme: 'auto',
  paneState: {}
}

let state: AppConfig = { ...defaultConfig }

export function loadConfig(): AppConfig {
  return state
}

export function saveConfig(config: AppConfig): void {
  const tmp = tmpPath()
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  renameSync(tmp, configPath())
  state = config
}

async function initConfig(): Promise<void> {
  try {
    const raw = await readFile(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    state = {
      version: 1,
      environments: parsed.environments ?? [],
      activeEnv: parsed.activeEnv ?? null,
      theme: parsed.theme ?? 'auto',
      paneState: parsed.paneState ?? {}
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      state = { ...defaultConfig }
    } else {
      throw err
    }
  }
}

// Called once on app startup before window is created
export async function initializeConfig(): Promise<void> {
  await initConfig()
}

export function getEnvs(): StoredEnv[] {
  return state.environments
}

export function getActiveEnv(): StoredEnv | null {
  if (!state.activeEnv) return null
  return state.environments.find((e) => e.name === state.activeEnv) ?? null
}

export function addEnv(env: StoredEnv): void {
  state = { ...state, environments: [...state.environments, env] }
  saveConfig(state)
}

export function removeEnv(name: string): void {
  const { [name]: _removed, ...remainingPanes } = state.paneState
  state = {
    ...state,
    environments: state.environments.filter((e) => e.name !== name),
    activeEnv: state.activeEnv === name ? null : state.activeEnv,
    paneState: remainingPanes
  }
  saveConfig(state)
}

export function setActiveEnv(name: string): void {
  state = { ...state, activeEnv: name }
  saveConfig(state)
}

export function updateEnv(env: StoredEnv): void {
  state = {
    ...state,
    environments: state.environments.map((e) => (e.name === env.name ? env : e))
  }
  saveConfig(state)
}

export function getTheme(): ThemeMode {
  return state.theme ?? 'auto'
}

export function setTheme(theme: ThemeMode): void {
  state = { ...state, theme }
  saveConfig(state)
}

export function getPaneState(envName: string): PaneState {
  return state.paneState[envName] ?? {}
}

export function setPaneState(envName: string, patch: PaneState): void {
  const existing = state.paneState[envName] ?? {}
  state = {
    ...state,
    paneState: { ...state.paneState, [envName]: { ...existing, ...patch } }
  }
  saveConfig(state)
}

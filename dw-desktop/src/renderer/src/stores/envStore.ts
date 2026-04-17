import { create } from 'zustand'
import type { StoredEnv } from '../../../shared/types'

interface EnvState {
  envs: StoredEnv[]
  activeEnv: StoredEnv | null
  loadEnvs: () => Promise<void>
  addEnv: (env: StoredEnv) => Promise<void>
  removeEnv: (name: string) => Promise<void>
  setActiveEnv: (name: string) => Promise<void>
}

export const useEnvStore = create<EnvState>((set) => ({
  envs: [],
  activeEnv: null,

  loadEnvs: async () => {
    const [listResult, activeResult] = await Promise.all([
      window.dw.env.list(),
      window.dw.env.getActive()
    ])
    set({
      envs: listResult.data ?? [],
      activeEnv: activeResult.data ?? null
    })
  },

  addEnv: async (env) => {
    await window.dw.env.add(env)
    set((state) => ({ envs: [...state.envs, env] }))
  },

  removeEnv: async (name) => {
    await window.dw.env.remove(name)
    set((state) => ({
      envs: state.envs.filter((e) => e.name !== name),
      activeEnv: state.activeEnv?.name === name ? null : state.activeEnv
    }))
  },

  setActiveEnv: async (name) => {
    await window.dw.env.setActive(name)
    set((state) => ({
      activeEnv: state.envs.find((e) => e.name === name) ?? null
    }))
  }
}))

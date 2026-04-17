import { create } from 'zustand'

export type ToastTone = 'info' | 'warning' | 'error' | 'success'

export interface Toast {
  id: string
  message: string
  tone: ToastTone
  ttlMs: number
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, tone?: ToastTone, ttlMs?: number) => void
  dismiss: (id: string) => void
}

let counter = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  show: (message, tone = 'info', ttlMs = 5000) => {
    const id = `t${Date.now()}-${++counter}`
    set((state) => ({ toasts: [...state.toasts, { id, message, tone, ttlMs }] }))
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, ttlMs)
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))

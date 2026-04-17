/// <reference types="vite/client" />

import type { DWDesktopAPI } from '../../preload/index.d'

declare global {
  interface Window {
    dw: DWDesktopAPI
  }
}

import type { PhotoPresenterApi } from '../shared/ipc'

declare global {
  interface Window {
    api: PhotoPresenterApi
  }
}

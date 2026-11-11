import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PhotoPresenterApi } from '@shared/ipc'
import type { Settings } from '@shared/settings'

const api: PhotoPresenterApi = {
  startShow: () => ipcRenderer.invoke(IPC.startShow),
  stopShow: () => ipcRenderer.invoke(IPC.stopShow),
  appVersion: () => ipcRenderer.invoke(IPC.appVersion),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  onSettingsChanged: (callback) => {
    const listener = (_e: IpcRendererEvent, s: Settings): void => callback(s)
    ipcRenderer.on(IPC.settingsChanged, listener)
    return () => ipcRenderer.removeListener(IPC.settingsChanged, listener)
  },
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  listPhotos: () => ipcRenderer.invoke(IPC.listPhotos)
}

contextBridge.exposeInMainWorld('api', api)

import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type PhotoPresenterApi } from '@shared/ipc'

const api: PhotoPresenterApi = {
  startShow: () => ipcRenderer.invoke(IPC.startShow),
  stopShow: () => ipcRenderer.invoke(IPC.stopShow),
  appVersion: () => ipcRenderer.invoke(IPC.appVersion)
}

contextBridge.exposeInMainWorld('api', api)

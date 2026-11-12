import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { FaceIndexStatus } from '@shared/faces'
import { IPC, type EmbedRequest, type PhotoPresenterApi } from '@shared/ipc'
import type { ShowCommand } from '@shared/remote'
import type { Settings } from '@shared/settings'

/** Abonniert ein Ereignis aus dem Main-Prozess; liefert eine Abmeldefunktion. */
function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PhotoPresenterApi = {
  startShow: (options) => ipcRenderer.invoke(IPC.startShow, options),
  stopShow: () => ipcRenderer.invoke(IPC.stopShow),
  appVersion: () => ipcRenderer.invoke(IPC.appVersion),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  onSettingsChanged: (callback) => subscribe<Settings>(IPC.settingsChanged, callback),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  listPhotos: () => ipcRenderer.invoke(IPC.listPhotos),

  faceModel: (model) => ipcRenderer.invoke(IPC.faceModel, model),
  faceJob: () => ipcRenderer.invoke(IPC.faceJob),
  faceResult: (name, result, error) => ipcRenderer.invoke(IPC.faceResult, name, result, error),
  onFaceWake: (callback) => subscribe<void>(IPC.faceWake, callback),
  onEmbedRequest: (callback) => subscribe<EmbedRequest>(IPC.embedRequest, callback),
  embedResult: (requestId, result, error) =>
    ipcRenderer.invoke(IPC.embedResult, requestId, result, error),

  faceStatus: () => ipcRenderer.invoke(IPC.faceStatus),
  onFaceStatus: (callback) => subscribe<FaceIndexStatus>(IPC.faceStatusChanged, callback),
  getFaces: (name) => ipcRenderer.invoke(IPC.getFaces, name),
  listFaces: (personId, photo) => ipcRenderer.invoke(IPC.listFaces, personId, photo),
  toggleSample: (personId, photo, face) =>
    ipcRenderer.invoke(IPC.toggleSample, personId, photo, face),
  toggleNegative: (personId, photo, face) =>
    ipcRenderer.invoke(IPC.toggleNegative, personId, photo, face),
  markFace: (personId, photo, box, negative) =>
    ipcRenderer.invoke(IPC.markFace, personId, photo, box, negative),
  focusPhotos: () => ipcRenderer.invoke(IPC.focusPhotos),
  reindexFaces: () => ipcRenderer.invoke(IPC.reindexFaces),

  onShowCommand: (callback) => subscribe<ShowCommand>(IPC.showCommand, callback),
  reportShowStatus: (status) => ipcRenderer.send(IPC.showStatus, status),
  remoteInfo: () => ipcRenderer.invoke(IPC.remoteInfo)
}

contextBridge.exposeInMainWorld('api', api)

// src/utils/ipc.js
const electron = window.require ? window.require('electron') : null;

export const ipcRenderer = electron ? electron.ipcRenderer : { 
  invoke: () => Promise.resolve({total:0, detailList:[]}),
  on: () => {},
  removeAllListeners: () => {},
  send: () => {}
};

export const isElectron = !!electron;
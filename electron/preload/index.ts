
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onPicoPortsChanged: (callback) => {
    ipcRenderer.on('pico-ports-changed', (event, portPaths) => callback(portPaths));
  },
editCommand: () => ipcRenderer.invoke('edit-command'),
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  receive: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  
  listDevices: () => ipcRenderer.send('listDevices'),
  on: (channel, callback) => {
    ipcRenderer.on(channel, (_, ...args) => callback(...args));
  },
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
  getDeviceIP: (deviceName) => ipcRenderer.send('get-device-ip', deviceName),
  onDeviceIP: (deviceName, callback) => {
    const channel = `device-ip-${deviceName}`; // 為每個設備創建唯一的通道名
    ipcRenderer.removeAllListeners(channel); // 移除之前的所有監聽器
    ipcRenderer.once(channel, (_, ip) => callback(ip, null)); // 使用once確保監聽器只被調用一次
    ipcRenderer.removeAllListeners(`${channel}-error`); // 移除之前的所有錯誤監聽器
    ipcRenderer.once(`${channel}-error`, (_, error) => callback(null, error)); // 處理錯誤
  },
  setTcpip: (deviceName) => ipcRenderer.send('setTcpip', deviceName),
  onSetTcpipResponse: (callback) => ipcRenderer.on('setTcpip-response', (event, response) => callback(response)),
  disconnectAllWifiDevices : () => ipcRenderer.send('disconnect-all-wifi-devices'),
  onDisconnectAllWifiDevicesResponse: (callback) => ipcRenderer.on('disconnect-all-wifi-devices-response', (_, message) => callback(message)),

  onSensorDataUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('serial-data', (event, data) => callback(data));
  },
  getDeviceData: async () => {
    return ipcRenderer.invoke('get-device-data');
  },
  onLogMessage: (callback) => ipcRenderer.on('log-message', (event, message) => callback(message)),
  onLogError: (callback) => ipcRenderer.on('log-error', (event, error) => callback(error)),
  // 提供感測器資料的 Promise 接口
  getSensorData: async () => {
    return await ipcRenderer.invoke('get-latest-sensor-data');
  },
  startRecording: () => ipcRenderer.send('start-recording'),
  stopRecording: () => ipcRenderer.send('stop-recording'),
  getHistoryData: (query) => ipcRenderer.invoke('get-history-data', query),
  getStudentList: () => ipcRenderer.invoke('get-student-list'),
  deleteStudentData: (uid) => ipcRenderer.invoke('delete-student-data', uid),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  setDeviceUid: (path, uid) => ipcRenderer.send('set-device-uid', { path, uid }),
  restartPicoW: () => ipcRenderer.send('restart-pico-w'),
  // Exam DB APIs
  getExamStudentList: () => ipcRenderer.invoke('get-exam-student-list'),
  getExamStudentData: (studentNumber) => ipcRenderer.invoke('get-exam-student-data', studentNumber),
  // DB config APIs
  getDbConfig: () => ipcRenderer.invoke('get-db-config'),
  saveDbConfig: (config) => ipcRenderer.invoke('save-db-config', config),
});



// `exposeInMainWorld` can't detect attributes and methods of `prototype`, manually patching it.
function withPrototype(obj: Record<string, any>) {
  const protos = Object.getPrototypeOf(obj)

  for (const [key, value] of Object.entries(protos)) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) continue

    if (typeof value === 'function') {
      // Some native APIs, like `NodeJS.EventEmitter['on']`, don't work in the Renderer process. Wrapping them into a function.
      obj[key] = function (...args: any) {
        return value.call(obj, ...args)
      }
    } else {
      obj[key] = value
    }
  }
  return obj
}

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)

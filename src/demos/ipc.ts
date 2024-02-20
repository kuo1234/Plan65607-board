
// window.ipcRenderer.on('main-process-message', (_event, ...args) => {
//   console.log('[Receive Main-process message]:', ...args)
// })


// 在 Vue 组件的 setup 函数或其他适当的地方
window.electronAPI.on('main-process-message', (message) => {
  console.log('[Receive Main-process message]:', message);
});

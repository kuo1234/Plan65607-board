import { createApp } from 'vue'
import App from './App.vue'
import router from '../router'

import './style.css'

import './demos/ipc'
// If you want use Node.js, the`nodeIntegration` needs to be enabled in the Main process.
// import './demos/node'

import Vue3Toastify, { type ToastContainerOptions } from 'vue3-toastify';




createApp(App)
  .use(router)
  .use(Vue3Toastify, {
    autoClose: 300,
  } as ToastContainerOptions)
  .mount('#app')
  .$nextTick(() => {
    postMessage({ payload: 'removeLoading' }, '*')
  })
  

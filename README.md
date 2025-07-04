65607 陸航計畫整合介面
原先框架使用 vue + electron 
後來有加上 vue router + vue3Toastify

# Plan65607

> Electron + Vite + Vue3 桌面應用，支援 META Quest3 眼鏡畫面投射、裁切與旋轉

> 生理量測功能
---

## 🛠️ 環境需求

- **Node.js** v20.11.1  
- **npm** v10.5.0  


---

## 🚀 安裝


# 1. Clone 專案

# 2. 安裝依賴
npm install


# 啟動 Vite 開發伺服器
npm run dev

npm run build


輸出目錄：release/28.0.0/


## 其他

UI 與事件邏輯寫在 Vue 組件中（例如：components/HelloWorld.vue、views/StudentPage.vue、views/BiosignalPage.vue）。

若需要呼叫系統層級的功能（如執行 ADB 指令、啟動 scrcpy、使用 child_process），則需透過 Electron 的 IPC 模型溝通：

- Vue 呼叫前端暴露的 API（window.electronAPI）

- Preload（electron/preload/index.ts） 透過 contextBridge 將允許的方法注入 window

- Main（electron/main/index.ts） 實際處理業務邏輯（包含 child_process 等 Node.js 模組）

---
scrcpy整合在src/externals/
這邊不要動到
不然學員畫面投影功能會有錯誤


生理量測開發紀錄 : 
```
https://hackmd.io/@fTxqhAHpTFupDjUmk0d4vQ/rkQ4uHBlex
```
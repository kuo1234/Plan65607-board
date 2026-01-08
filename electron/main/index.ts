import { app, BrowserWindow, shell, ipcMain, desktopCapturer } from "electron";
import WebSocket, { WebSocketServer } from 'ws';
import { release } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, exec } from "child_process";
import path from "path";
import { SerialPort } from "serialport"; // 新增 Serial Port 支援
import { ReadlineParser } from '@serialport/parser-readline'; // 用來解析 Serial 資料
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scrcpyDirPath = path.join(__dirname, "../../src/externals");


import isDev from 'electron-is-dev';

ipcMain.handle('edit-command', () => {
  return new Promise((resolve, reject) => {
    exec('"..\\Technical Order Editor\\Technical Order Editor.exe"', (err) => {
      if (err) {
        console.error(`Error executing file: ${err}`);
        reject('找不到教官台位置.');
      } else {
        resolve('教官台開啟成功');
      }
    });
  });
});

ipcMain.handle('get-window-source-id', async (_, windowTitle) => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] });
    
    // Log available windows for debugging
    const windowList = sources.map(s => `"${s.name}"`).join(', ');
    console.log(`[Main] Available windows for capture: ${windowList}`);

    const target = sources.find(s => s.name === windowTitle);
    
    if (target) {
      return target.id;
    } else {
      console.warn(`[Main] Target window "${windowTitle}" not found.`);
      return null;
    }
  } catch (error) {
    console.error("[Main] Error getting desktop sources:", error);
    return null;
  }
});

ipcMain.on('renderer-log', (event, message) => {
  console.log(`[Renderer] ${message}`);
});

const externalsPath = isDev 
  ? path.join(__dirname, "../../src/externals/") 
  : path.join(process.resourcesPath, "externals");

const adbPath = path.join(externalsPath, "adb.exe");
const scrcpyPath = path.join(externalsPath, "scrcpy.exe");
import fs from 'fs';
import { time } from "node:console";
if (!fs.existsSync(adbPath)) {
  console.error("adb.exe not found at path:", adbPath);
}

process.env.DIST_ELECTRON = join(__dirname, "..");
process.env.DIST = join(process.env.DIST_ELECTRON, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, "../public")
  : process.env.DIST;

if (release().startsWith("6.1")) app.disableHardwareAcceleration();
if (process.platform === "win32") app.setAppUserModelId(app.getName());

let win: BrowserWindow | null = null;
const preload = join(__dirname, "../preload/index.mjs");
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = join(process.env.DIST, "index.html");
const devices: Map<string, DeviceConnection> = new Map();

// MongoDB setup
mongoose.connect('mongodb://127.0.0.1:27017/plan65607')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

const SensorDataSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  uid: String,
  data: Object
});

const SensorData = mongoose.model('SensorData', SensorDataSchema);

let isRecording = false;
let recordBuffer: any[] = [];
const FLUSH_INTERVAL = 5000; // 5 seconds
const deviceUidMap = new Map<string, string>();

ipcMain.on('set-device-uid', (event, { path, uid }) => {
  deviceUidMap.set(path, uid);
  console.log(`Set UID for ${path}: ${uid}`);
});

// Flush buffer to MongoDB
const flushData = async () => {
  if (recordBuffer.length > 0) {
    const chunk = [...recordBuffer];
    recordBuffer = []; // Clear buffer
    try {
      await SensorData.insertMany(chunk);
      console.log(`Saved ${chunk.length} records to MongoDB`);
    } catch (e) {
      console.error('Error saving to MongoDB', e);
      // Optional: Restore buffer if needed, or log error
    }
  }
};

// Set interval to flush data
setInterval(flushData, FLUSH_INTERVAL);

ipcMain.on('start-recording', () => {
  isRecording = true;
  console.log('Recording started');
});

ipcMain.on('stop-recording', () => {
  isRecording = false;
  flushData(); // Flush remaining data
  console.log('Recording stopped');
});

ipcMain.handle('get-history-data', async (_, { uid, startTime, endTime }) => {
  try {
    const query: any = {};
    if (uid) query.uid = uid;
    if (startTime || endTime) {
      query.timestamp = {};
      if (startTime) query.timestamp.$gte = new Date(startTime);
      if (endTime) query.timestamp.$lte = new Date(endTime);
    }
    
    // Limit to 5000 points to prevent UI freeze, or implement downsampling
    const results = await SensorData.find(query).sort({ timestamp: 1 }).lean();
    return results;
  } catch (err) {
    console.error('Error fetching history:', err);
    return [];
  }
});

ipcMain.handle('clear-all-data', async () => {
  try {
    await SensorData.deleteMany({});
    console.log('All data cleared from MongoDB');
    return true;
  } catch (err) {
    console.error('Error clearing data:', err);
    return false;
  }
});

interface DeviceConnection {
  ipAddress: string;
  data: any[];
}


async function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 880,
    title: "Main window",
    icon: join(process.env.VITE_PUBLIC, "favicon.ico"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"), // 指向您的 preload 脚本
      contextIsolation: true, // 启用 context isolation 以提高安全性
      nodeIntegration: false, // 禁用 nodeIntegration 以提高安全性
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    // electron-vite-vue#298
    win.loadURL(url);
    // Open devTool if the app is not packaged
  } else {
    win.loadFile(indexHtml);
  }

  // 設置 Serial Port 並開始監聽
  setupSerialPorts();

  // Test actively push message to the Electron-Renderer
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });
  // win.webContents.on('will-navigate', (event, url) => { }) #344

  try {
    const wss = new WebSocketServer({ port: 8080 });
    // WebSocket 服务器的其它代码
    const clients: WebSocket[] = [];
    const deviceData: { [key: string]: any[] } = {};
    wss.on('connection', (ws, req) => {
      const ip = req.socket.remoteAddress;
      console.log(`New connection from ${ip}`);
      clients.push(ws);

      ws.on('message', (message) => {
          const data = JSON.parse(message.toString());
          console.log('Received data:', data);
          if (!deviceData[ip]) {
              deviceData[ip] = [];
          }
          deviceData[ip].push(data);
          if (deviceData[ip].length > 30) {
              deviceData[ip].shift();
          }

          // 通知前端更新数据
          win.webContents.send('update-data', { ip, data: deviceData[ip] });
      });

      ws.on('close', () => {
          console.log(`Connection closed: ${ip}`);
          clients.splice(clients.indexOf(ws), 1);
          delete deviceData[ip];
      });
    });

    ipcMain.handle('get-device-data', () => deviceData);
  } catch (error) {
    console.error('Failed to create WebSocket server:', error);
  }
}


let latestData = {};
let buffer = ''; // 暫存未完成的 JSON 資料
let port; // 將 SerialPort 變數移到外部，方便重新初始化
let picoPorts = {}; // Pico W SerialPort 實例集合

async function listAvailablePorts() : Promise<string[]>{
  try {
    const ports = await SerialPort.list(); // 列出所有可用 Serial Port
    // console.log('Available Serial Ports:', ports);

    if (ports.length === 0) {
      console.error('No serial ports found.');
      return retryListPorts(); // 若無可用 Serial Port，自動重試
    }

    // 嘗試找到 MicroPython 裝置
    const picoPorts = ports.filter((p) =>
      p.vendorId && (p.vendorId.includes('2E8A') || p.vendorId.includes('2e8a'))
    );
    

    if (picoPorts.length > 0) {
      // console.log(`Pico W 設備數量：${picoPorts.length} \n ${picoPorts}`);
      return picoPorts.map(p => p.path); // 找到符合的 Port，回傳路徑
    } else {
      // console.warn('MicroPython device not detected. Retrying...');
      return retryListPorts(); // 若未找到符合的 Port，自動重試
    }
  } catch (error) {
    console.error('Failed to list serial ports:', error);
    return retryListPorts(); // 若發生錯誤，自動重試
  }
}

// 定義重試機制，每秒重試一次
function retryListPorts() : Promise<string[]>{
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(listAvailablePorts()); // 每秒重試一次
    }, 1000); // 重試間隔 1 秒
  });
}

// 初始化 Serial Port
async function setupSerialPorts() {
  const portPaths = await listAvailablePorts();
  // 關閉已移除的 Pico W port
  let changed = false;
  for (const oldPath of Object.keys(picoPorts)) {
    if (!portPaths.includes(oldPath)) {
      try { picoPorts[oldPath].close(); } catch {}
      delete picoPorts[oldPath];
      changed = true;
    }
  }
  // 新增新插入的 Pico W port
  portPaths.forEach((path) => {
    if (picoPorts[path]) return;
    const deviceId = `device ${path}`;
    try {
      const port = new SerialPort({ path, baudRate: 115200 });
      picoPorts[path] = port;
      const parser = port.pipe(new ReadlineParser({ delimiter: '\r' }));
      parser.on('data', (chunk) => {
        const cleanLine = chunk.trim();
        if (cleanLine.startsWith('{') && cleanLine.endsWith('}')) {
          try {
            const jsonData = JSON.parse(cleanLine);
            latestData[path] = jsonData;

            if (isRecording) {
              const { board, ...rest } = jsonData;
              const userUid = deviceUidMap.get(path);
              recordBuffer.push({
                timestamp: new Date(),
                uid: userUid || board || path,
                data: rest
              });
            }

            if (win) {
              win.webContents.send('serial-data', { deviceId: path, ...jsonData });
            }
          } catch (err) {}
        }
      });
      port.on('error', (err) => {
        console.error(`[${deviceId}] Serial Port 錯誤:`, err);
      });
      port.on('close', () => {
        console.warn(`[${deviceId}] Serial Port closed.`);
        delete picoPorts[path];
        if (win) win.webContents.send('pico-ports-changed', Object.keys(picoPorts));
      });
      changed = true;
    } catch (error) {
      console.error(`[${deviceId}] 初始化失敗:`, error);
    }
  });
  // 僅在有變化時才通知前端
  if (changed && win) win.webContents.send('pico-ports-changed', Object.keys(picoPorts));
}
setInterval(setupSerialPorts, 2000);


// 定義自動重試的函數
function retrySetupSerialPort() {
  console.log('1 秒後重試 Serial Port 連接...');
  setTimeout(() => {
    setupSerialPorts(); // 每秒重試一次連接
  }, 1000);
}

// 處理重新執行 Pico W 程式的指令
ipcMain.on('restart-pico-w', () => {
  if (port && port.isOpen) {
    console.log('Restarting main.py on Pico W...');
    port.write('\x03'); // Ctrl+C 停止目前程式
    setTimeout(() => port.write('import machine; machine.reset()\r'), 500); // 重啟
  } else {
    console.error('Serial port is not open.');
  }
});



// 在 IPC 中提供獲取最新資料的 Promise 接口
ipcMain.handle('get-latest-sensor-data', async () => {
  // console.log('######################################');
  // console.log(latestData);
  // console.log(Date.now());
  // console.log('*************************************');
  return latestData; // 返回最新的感測器資料
});


app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

// New window example arg: new windows url
ipcMain.handle("open-win", (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${url}#${arg}`);
  } else {
    childWindow.loadFile(indexHtml, { hash: arg });
  }
});
function logToRenderer(message) {
  if (win) {
    win.webContents.send('log-message', message);
  }
}

ipcMain.on("listDevices", (event) => {
  console.log("Received listDevices event");
  logToRenderer("Received listDevices event");

  // 检查 adb.exe 是否存在
  if (!fs.existsSync(adbPath)) {
    const errorMessage = `adb.exe not found at path: ${adbPath}`;
    logToRenderer(errorMessage);
    console.error(errorMessage);
    event.reply("device-list-error", errorMessage);
    return;
  }

  exec(`"${adbPath}" devices`, (error, stdout, stderr) => {
    console.log("adb devices output:", stdout);
    if (error) {
      const execError = `Error executing adb devices: ${error.message}`;
      logToRenderer(execError);
      logToRenderer(`stderr: ${stderr}`);
      console.error(execError);
      event.reply("device-list-error", execError);
      return;
    }
    event.reply("device-list", stdout);
  });
});
ipcMain.on("get-device-ip", (event, deviceName) => {
  const command = `"${adbPath}" -s ${deviceName} shell ip route`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`獲取設備${deviceName}的IP地址時出錯: ${error}`);
      event.reply("device-ip-error", `獲取${deviceName}的IP地址失敗`);
      return;
    }

    const channel = `device-ip-${deviceName}`;
    const ipMatch = stdout.match(/src (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (ipMatch && ipMatch.length > 1) {
      const deviceIP = ipMatch[1];
      event.reply(channel, deviceIP); // 使用唯一通道名回復IP
    } else {
      event.reply(`${channel}-error`, "無法獲取IP地址"); // 使用唯一通道名回復錯誤
    }
  });
});

ipcMain.on("setTcpip", (event, deviceName) => {

  exec(
    `"${adbPath}" -s ${deviceName} tcpip 5555`,
    (error, stdout, stderr) => {
      if (error) {
        console.error(`設定 TCP/IP 端口出錯: ${error.message}`);
        event.reply("setTcpip-response", {
          success: false,
          message: "設定 TCP/IP 端口失敗",
        });
      } else {
        console.log("成功設定 TCP/IP 端口: 5555");
        event.reply("setTcpip-response", {
          success: true,
          message: "成功設定 TCP PORT: 5555",
        });
      }
    }
  );
});

ipcMain.on("adb-connect", (event, deviceAddress) => {
  const command = `"${adbPath}" connect ${deviceAddress}`;
  console.log({ deviceAddress });
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`執行 adb connect 時出錯: ${error}`);
      event.reply("adb-connect-response", "連接失敗");
      return;
    }
    console.log("connectsuccess");
    exec(`"${adbPath}" devices`, (error, stdout, stderr) => {
      if (error) {
        console.error(`獲取設備列表時出錯: ${error.message}`);
        return;
      }
      event.reply("device-list", stdout);
    });
  });
});

let scrcpyWindowOffset = 0;

// USB-only scrcpy mirror: use ADB device ID (serial), no IP / tcpip 5555
ipcMain.on("start-scrcpy", (event, deviceId) => {
  const x = 100 + (scrcpyWindowOffset * 50);
  const y = 100 + (scrcpyWindowOffset * 50);
  scrcpyWindowOffset = (scrcpyWindowOffset + 1) % 15;

  // 使用 spawn 而不是 exec 啟動新的進程
  const scrcpyProcess = spawn(
    scrcpyPath,
    [
      "-s", deviceId, // ADB device ID (USB serial)
      "--video-bit-rate", "4M", // 降低比特率以減輕傳輸壓力
      "--max-fps", "30", // 30 FPS：同時多台裝置時較穩定
      "--no-audio",
      "--video-codec=h264", // 改回 h264，兼容性最好
      "--stay-awake",
      "--render-driver=software", // 改用軟體渲染，解決可能的 GPU 兼容性閃爍問題
      "--max-size", "1024",

      // 啟動時鎖定視窗大小
      "--window-width", "1000",
      "--window-height", "800",
    
      // 視窗屬性（可選）
      "--window-x", x.toString(),
      "--window-y", y.toString(),
      "--window-title", `Quest3 - ${deviceId}`,
      
    ]
  );

  // 準備日誌路徑
  const logPath = path.join(app.getPath("userData"), "scrcpy-debug.log");
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const logToFile = (msg: string) => {
    const time = new Date().toISOString();
    logStream.write(`[${time}] ${msg}\n`);
  };

  logToFile(`Starting scrcpy for device ${deviceId} (USB mode)`);

  // 監聽 stdout 和 stderr
  scrcpyProcess.stdout.on("data", (data) => {
    const msg = data.toString();
    console.log(`stdout: ${msg}`);
    logToFile(`STDOUT: ${msg.trim()}`);
  });

  scrcpyProcess.stderr.on("data", (data) => {
    const msg = data.toString();
    console.error(`stderr: ${msg}`);
    logToFile(`STDERR: ${msg.trim()}`);
  });

  scrcpyProcess.on("close", (code) => {
    console.log(`scrcpy 子進程退出碼：${code}`);
    logToFile(`EXIT: scrcpy exited with code ${code}`);
    logStream.end();

    // 根據退出碼決定是否成功，並通知渲染進程
    if (code !== 0) {
      event.reply("scrcpy-response", "影像投射失敗");
    }
  });

  // 無需移除監聽器，因為每個 scrcpyProcess 是獨立的
});

ipcMain.on("disconnect-all-wifi-devices", (event) => {
  exec(`"${adbPath}" disconnect`, (error, stdout, stderr) => {
    if (error) {
      console.error(`斷開無線設備時出錯: ${error}`);
      event.reply("disconnect-all-wifi-devices-response", "斷開失敗");
      return;
    }
    console.log("所有無線設備已斷開");
    event.reply("disconnect-all-wifi-devices-response", "所有無線設備已斷開");
    exec(`"${adbPath}" devices`, (error, stdout, stderr) => {
      if (error) {
        console.error(`獲取設備列表時出錯: ${error.message}`);
        return;
      }
      event.reply("device-list", stdout);
    });
  });
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

import { app, BrowserWindow, shell, ipcMain } from "electron";
import WebSocket, { WebSocketServer } from 'ws';
import { release } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, exec } from "child_process";
import path from "path";
import { SerialPort } from "serialport"; // 新增 Serial Port 支援
import { ReadlineParser } from '@serialport/parser-readline'; // 用來解析 Serial 資料

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

const externalsPath = isDev 
  ? path.join(__dirname, "../../src/externals/") 
  : path.join(process.resourcesPath, "externals");

const adbPath = path.join(externalsPath, "adb.exe");
const scrcpyPath = path.join(externalsPath, "scrcpy.exe");
import fs from 'fs';
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
  setupSerialPort();

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

async function listAvailablePorts() {
  try {
    const ports = await SerialPort.list(); // 列出所有可用 Serial Port
    console.log('Available Serial Ports:', ports);

    if (ports.length === 0) {
      console.error('No serial ports found.');
      return retryListPorts(); // 若無可用 Serial Port，自動重試
    }

    // 嘗試找到 MicroPython 裝置
    const picoPort = ports.find((p) => 
      p.vendorId && p.vendorId.includes('2E8A') // MicroPython Vendor ID
    );

    if (picoPort) {
      console.log(`Pico W detected at ${picoPort.path}`);
      return picoPort.path; // 找到符合的 Port，回傳路徑
    } else {
      console.warn('MicroPython device not detected. Retrying...');
      return retryListPorts(); // 若未找到符合的 Port，自動重試
    }
  } catch (error) {
    console.error('Failed to list serial ports:', error);
    return retryListPorts(); // 若發生錯誤，自動重試
  }
}

// 定義重試機制，每秒重試一次
function retryListPorts() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(listAvailablePorts()); // 每秒重試一次
    }, 1000); // 重試間隔 1 秒
  });
}

// 初始化 Serial Port
async function setupSerialPort() {
  latestData = null;
  const portPath = await listAvailablePorts();
  if (!portPath) {
    console.error('No available serial port to open.');
    return;
  }

  try {
    port = new SerialPort({ path: portPath, baudRate: 115200 });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', (chunk) => {
      buffer += chunk; // 累加收到的資料

      try {
        const jsonData = JSON.parse(buffer); // 嘗試解析 JSON
        latestData = jsonData; // 更新最新的感測器資料
        console.log('Received Data:', jsonData);

        // 傳遞資料給前端
        if (win) {
          console.log('--------------');
          win.webContents.send('serial-data', jsonData);
        }

        buffer = ''; // 清空 buffer，準備下一筆資料
      } catch (error) {
        if (!error.message.includes('Unexpected end of JSON input')) {
          console.error('JSON 解析錯誤:', error, 'Received:', buffer);
          buffer = ''; // 若資料格式錯誤則清空 buffer
        }
      }
    });

    port.on('error', (err) => {
      console.error('Serial Port 錯誤:', err);
      retrySetupSerialPort(); // 發生錯誤時重新嘗試連接
    });

    port.on('close', () => {
      console.warn('Serial Port closed. Retrying connection...');
      retrySetupSerialPort(); // 若連線中斷，自動重試
    });

  } catch (error) {
    console.error('初始化 Serial Port 失敗:', error);
    retrySetupSerialPort(); // 初始化失敗時也進行重試
  }
}

// 定義自動重試的函數
function retrySetupSerialPort() {
  console.log('1 秒後重試 Serial Port 連接...');
  setTimeout(() => {
    setupSerialPort(); // 每秒重試一次連接
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

  exec(`${adbPath} devices`, (error, stdout, stderr) => {
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
  const command = `${adbPath} -s ${deviceName} shell ip route`;

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
    `${adbPath} -s ${deviceName} tcpip 5555`,
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
  const command = `${adbPath} connect ${deviceAddress}`;
  console.log({ deviceAddress });
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`執行 adb connect 時出錯: ${error}`);
      event.reply("adb-connect-response", "連接失敗");
      return;
    }
    console.log("connectsuccess");
    exec(`${adbPath} devices`, (error, stdout, stderr) => {
      if (error) {
        console.error(`獲取設備列表時出錯: ${error.message}`);
        return;
      }
      event.reply("device-list", stdout);
    });
  });
});

ipcMain.on("start-scrcpy", (event, deviceIP) => {

  // 使用 spawn 而不是 exec 啟動新的進程
  const scrcpyProcess = spawn(
    scrcpyPath,
    [
      "-s",
      deviceIP,
      "--video-bit-rate",
      "2M",
      "--max-fps",
      "15",
      "--no-audio",
      "--crop",
      "2744:1544:20:350",
      "--rotation-offset",
      "22",
      "--scale",
      "159",
      "--position-x-offset",
      "-170",
      "--position-y-offset",
      "-190",
    ],
    { shell: true }
  ); // 在 Windows 上運行時，可能需要設置 shell: true

  // 監聽 stdout 和 stderr
  scrcpyProcess.stdout.on("data", (data) => {
    console.log(`stdout: ${data}`);
  });

  scrcpyProcess.stderr.on("data", (data) => {
    console.error(`stderr: ${data}`);
  });

  scrcpyProcess.on("close", (code) => {
    console.log(`scrcpy 子進程退出碼：${code}`);
    // 根據退出碼決定是否成功，並通知渲染進程
    if (code !== 0) {
      event.reply("scrcpy-response", "影像投射失敗");
    }
  });

  // 無需移除監聽器，因為每個 scrcpyProcess 是獨立的
});

ipcMain.on("disconnect-all-wifi-devices", (event) => {
  exec(`${adbPath} disconnect`, (error, stdout, stderr) => {
    if (error) {
      console.error(`斷開無線設備時出錯: ${error}`);
      event.reply("disconnect-all-wifi-devices-response", "斷開失敗");
      return;
    }
    console.log("所有無線設備已斷開");
    event.reply("disconnect-all-wifi-devices-response", "所有無線設備已斷開");
    exec(`${adbPath} devices`, (error, stdout, stderr) => {
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

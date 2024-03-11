import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { release } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn,exec } from 'child_process';
import path from 'path';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scrcpyDirPath = path.join(__dirname, '../../src/externals');

process.env.DIST_ELECTRON = join(__dirname, '..');
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist');
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST;

if (release().startsWith('6.1')) app.disableHardwareAcceleration();
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

let win: BrowserWindow | null = null;
const preload = join(__dirname, '../preload/index.mjs');
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = join(process.env.DIST, 'index.html');

async function createWindow() {
  win = new BrowserWindow({
    width: 1100, 
    height: 880, 
    title: 'Main window',
    icon: join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'), // 指向您的 preload 脚本
      contextIsolation: true, // 启用 context isolation 以提高安全性
      nodeIntegration: false, // 禁用 nodeIntegration 以提高安全性
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) { // electron-vite-vue#298
    win.loadURL(url)
      // Open devTool if the app is not packaged
    
  } else {
    win.loadFile(indexHtml)
  }

// Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

// Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
    })
    // win.webContents.on('will-navigate', (event, url) => { }) #344
  }


  app.on('window-all-closed', () => {
    win = null
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('second-instance', () => {
    if (win) {
      // Focus on the main window if the user tried to open another
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.on('activate', () => {
    const allWindows = BrowserWindow.getAllWindows()
    if (allWindows.length) {
      allWindows[0].focus()
    } else {
      createWindow()
    }
  })

  // New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
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



ipcMain.on('listDevices', (event) => {
  console.log('Received listDevices event'); 

  const adbPath = path.join(__dirname, '../../src/externals/adb.exe'); 
  exec(`${adbPath} devices`, (error, stdout, stderr) => {
    console.log('adb devices output:', stdout);
    if (error) {
      console.error(`take devices wrong: ${error.message}`);
      event.reply('device-list-error', 'device-list-error');
      return;
    }
    event.reply('device-list', stdout);
  });
});



ipcMain.on('get-device-ip', (event, deviceName) => {
  const adbCommandPath = path.join(__dirname, '../../src/externals/adb');
  const command = `${adbCommandPath} -s ${deviceName} shell ip route`;
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`獲取設備${deviceName}的IP地址時出錯: ${error}`);
      event.reply('device-ip-error', `獲取${deviceName}的IP地址失敗`);
      return;
    }

    const channel = `device-ip-${deviceName}`;
    const ipMatch = stdout.match(/src (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (ipMatch && ipMatch.length > 1) {
      const deviceIP = ipMatch[1];
      event.reply(channel, deviceIP); // 使用唯一通道名回復IP
    } else {
      event.reply(`${channel}-error`, '無法獲取IP地址'); // 使用唯一通道名回復錯誤
    }
  });
});

ipcMain.on('setTcpip', (event, deviceName) => {
  const adbCommandPath = path.join(__dirname, '../../src/externals/adb.exe'); // ADB 命令的路徑
  exec(`${adbCommandPath} -s ${deviceName} tcpip 5555`, (error, stdout, stderr) => {
    if (error) {
      console.error(`設定 TCP/IP 端口出錯: ${error.message}`);
      event.reply('setTcpip-response', { success: false, message: '設定 TCP/IP 端口失敗' });
    } else {
      console.log('成功設定 TCP/IP 端口: 5555');
      event.reply('setTcpip-response', { success: true, message: '成功設定 TCP PORT: 5555' });
    }
  });
});





ipcMain.on('adb-connect', (event, deviceAddress) => {
  const adbCommandPath = path.join(__dirname, '../../src/externals/adb.exe');
  const command = `${adbCommandPath} connect ${deviceAddress}`;
  console.log({deviceAddress});
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`執行 adb connect 時出錯: ${error}`);
      event.reply('adb-connect-response', '連接失敗');
      return;
    }
    console.log('connectsuccess');
    exec(`${adbCommandPath} devices`, (error, stdout, stderr) => {
      if (error) {
        console.error(`獲取設備列表時出錯: ${error.message}`);
        return;
      }
      event.reply('device-list', stdout);
    });
  
  });
});


ipcMain.on('start-scrcpy', (event, deviceIP) => {
  const scrcpyPath = path.join(__dirname, '../../src/externals/scrcpy.exe');

  // 使用 spawn 而不是 exec 啟動新的進程
  const scrcpyProcess = spawn(scrcpyPath, [
    '-s', deviceIP,
    '--video-bit-rate', '2M',
    '--max-fps', '15',
    '--no-audio',
    '--crop', '1600:1039:2200:549'
  ], { shell: true }); // 在 Windows 上運行時，可能需要設置 shell: true

  // 監聽 stdout 和 stderr
  scrcpyProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  scrcpyProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  scrcpyProcess.on('close', (code) => {
    console.log(`scrcpy 子進程退出碼：${code}`);
    // 根據退出碼決定是否成功，並通知渲染進程
    if (code !== 0) {
      event.reply('scrcpy-response', '影像投射失敗');
    }
  });

  // 無需移除監聽器，因為每個 scrcpyProcess 是獨立的
});


ipcMain.on('disconnect-all-wifi-devices', (event) => {
  const adbPath = path.join(__dirname, '../../src/externals/adb.exe');
  exec(`${adbPath} disconnect`, (error, stdout, stderr) => {
    if (error) {
      console.error(`斷開WIFI設備時出錯: ${error}`);
      event.reply('disconnect-all-wifi-devices-response', '斷開失敗');
      return;
    }
    console.log('所有WIFI設備已斷開');
    event.reply('disconnect-all-wifi-devices-response', '所有WIFI設備已斷開');
    exec(`${adbPath} devices`, (error, stdout, stderr) => {
      if (error) {
        console.error(`獲取設備列表時出錯: ${error.message}`);
        return;
      }
      event.reply('device-list', stdout);
    });

  
  });
});


app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  win = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

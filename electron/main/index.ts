import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { release } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'child_process';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scrcpyDirPath = path.join(__dirname, '../../externals');

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
    win.webContents.openDevTools()
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


// 新增的 Scrcpy 相关逻辑
ipcMain.on('start-scrcpy', (event) => {
  // 构造 adb 命令的完整路径
  const adbCommandPath = path.join(scrcpyDirPath, 'adb');

  
  exec(`${adbCommandPath} shell ip route`, (error, stdout, stderr) => {
      if (error) {
          console.error(`获取 IP 地址时出错: ${error}`);
          event.reply('scrcpy-error', '获取 IP 地址失败');
          return;
      }

      const ipMatch = stdout.match(/src (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (!ipMatch || ipMatch.length < 2) {
        console.error('未找到有效的 IP 地址');
        event.reply('scrcpy-error', '未找到有效的 IP 地址');
        return;
      }
  
      const deviceIP = ipMatch[1];

      
      exec(`${adbCommandPath} tcpip 5555`, (tcpError) => {
          if (tcpError) {
              console.error(`设置 adb tcpip 时出错: ${tcpError}`);
              event.reply('scrcpy-error', '设置 adb tcpip 失败');
              return;
          }

          // 第三步：连接设备
          exec(`${adbCommandPath} connect ${deviceIP}:5555`, (connectError) => {
              if (connectError) {
                  console.error(`连接设备时出错: ${connectError}`);
                  event.reply('scrcpy-error', '连接设备失败');
                  return;
              }

              // 第四步：启动 Scrcpy
              const scrcpyCommandPath = path.join(scrcpyDirPath, 'scrcpy');
              exec(`${scrcpyCommandPath} -s ${deviceIP}:5555 --video-bit-rate 2M --max-fps 15 --no-audio`, (scrcpyError, scrcpyStdout) => {
                  if (scrcpyError) {
                      console.error(`启动 Scrcpy 时出错: ${scrcpyError}`);
                      event.reply('scrcpy-error', '启动 Scrcpy 失败');
                      return;
                  }
                  console.log('Scrcpy 已成功启动');
                  event.reply('scrcpy-success', 'Scrcpy 已成功启动');
              });
          });
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

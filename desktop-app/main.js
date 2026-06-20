const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let printBridgeProcess;

function startPrintBridge() {
  const exePath = app.isPackaged 
    ? path.join(process.resourcesPath, 'PrintBridge.exe')
    : path.join(__dirname, '..', 'print-server', 'PrintBridge.exe');

  if (fs.existsSync(exePath)) {
    console.log('Iniciando motor de impresion en segundo plano...');
    printBridgeProcess = spawn(exePath, [], {
      windowsHide: true,
      stdio: 'ignore'
    });

    printBridgeProcess.on('error', (err) => {
      console.error('Error al iniciar PrintBridge:', err);
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.png'), // Icon for the window
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // THIS IS THE MAGIC FIX: Disables CORS and Mixed Content blocks
      allowRunningInsecureContent: true
    }
  });

  // Remove the default menu bar for a cleaner "app" look
  Menu.setApplicationMenu(null);

  // Maximize the window automatically
  mainWindow.maximize();

  // Load the live Vercel production URL
  mainWindow.loadURL('https://menu-digital-pro.vercel.app/login.html');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Automatically maximize ALL new windows (e.g. POS, Kiosko popups) and remove menus
app.on('browser-window-created', (e, window) => {
  window.setMenuBarVisibility(false);
  window.maximize();
});

// Disabling hardware acceleration sometimes helps with older POS machines
app.disableHardwareAcceleration();

// Accept insecure certificates (just in case)
app.commandLine.appendSwitch('ignore-certificate-errors');

app.on('ready', () => {
  startPrintBridge();
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  if (printBridgeProcess) {
    printBridgeProcess.kill();
  }
});

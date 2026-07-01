const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

// ===== IPC: Provide userData path to preload =====
// El preload necesita saber donde guardar la config de impresora por PC
ipcMain.on('get-user-data-path', (event) => {
  event.returnValue = app.getPath('userData');
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // PRELOAD: Este es el puente que conecta el WebView con la impresora TCP
      // Hace que window.DesktopPrint este disponible en la pagina web
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Disables CORS and Mixed Content blocks
      allowRunningInsecureContent: true
    }
  });

  // Remove the default menu bar for a cleaner "app" look
  Menu.setApplicationMenu(null);

  // Add keyboard shortcuts for reload and devtools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'r') {
      mainWindow.reload();
      event.preventDefault();
    }
    if (input.key === 'F5') {
      mainWindow.reload();
      event.preventDefault();
    }
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Maximize the window automatically
  mainWindow.maximize();

  // Clear cache and load the live Vercel production URL
  mainWindow.webContents.session.clearCache().then(() => {
    console.log('Cache cleared successfully');
    mainWindow.loadURL('https://menu-digital-pro.vercel.app/login.html');
  });

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
  // Ya no necesitamos iniciar PrintBridge.exe como proceso separado
  // La impresion TCP esta integrada directamente via preload.js
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

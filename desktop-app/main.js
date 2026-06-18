const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

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

// Disabling hardware acceleration sometimes helps with older POS machines
app.disableHardwareAcceleration();

// Accept insecure certificates (just in case)
app.commandLine.appendSwitch('ignore-certificate-errors');

app.on('ready', createWindow);

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

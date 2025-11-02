const { app, BrowserWindow, globalShortcut } = require("electron");
const { switchFullscreenState } = require("./windowManager.js");

const homePage = "https://play.geforcenow.com";

function register() {
  console.log("Registering global shortcuts...");

  // Try multiple variations for fullscreen
  const fullscreenShortcuts = ["Super+F", "Meta+F", "F11"];
  fullscreenShortcuts.forEach(shortcut => {
    const ret = globalShortcut.register(shortcut, () => {
      console.log(`Fullscreen shortcut triggered: ${shortcut}`);
      switchFullscreenState();
    });
    console.log(`Shortcut ${shortcut} registration: ${ret ? 'SUCCESS' : 'FAILED'}`);
  });

  // Register Alt+F4 to quit
  const quitRet = globalShortcut.register("Alt+F4", () => {
    app.quit();
  });
  console.log(`Shortcut Alt+F4 registration: ${quitRet ? 'SUCCESS' : 'FAILED'}`);

  // Register Alt+Home to navigate to home page
  const homeRet = globalShortcut.register("Alt+Home", () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].loadURL(homePage);
    }
  });
  console.log(`Shortcut Alt+Home registration: ${homeRet ? 'SUCCESS' : 'FAILED'}`);

  // Register Ctrl+Shift+I to toggle dev tools
  const devToolsRet = globalShortcut.register("CommandOrControl+Shift+I", () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.toggleDevTools();
    }
  });
  console.log(`Shortcut Ctrl+Shift+I registration: ${devToolsRet ? 'SUCCESS' : 'FAILED'}`);

  console.log("Shortcuts registration complete");
}

function unregister() {
  globalShortcut.unregisterAll();
}

module.exports = {
  register: register,
  unregister: unregister,
};

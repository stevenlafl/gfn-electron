const { app, BrowserWindow } = require("electron");
const electronLocalshortcut = require("electron-localshortcut");
const { switchFullscreenState } = require("./windowManager.js");

const homePage = "https://play.geforcenow.com";

function register() {
  electronLocalshortcut.register("Super+F", async () => {
    switchFullscreenState();
  });

  electronLocalshortcut.register("F11", async () => {
    switchFullscreenState();
  });

  electronLocalshortcut.register("Alt+F4", async () => {
    app.quit();
  });

  electronLocalshortcut.register("Alt+Home", async () => {
    BrowserWindow.getAllWindows()[0].loadURL(homePage);
  });

  electronLocalshortcut.register("Control+Shift+I", () => {
    BrowserWindow.getAllWindows()[0].webContents.toggleDevTools();
  });
}

function unregister() {
  electronLocalshortcut.unregisterAll();
}

module.exports = {
  register: register,
  unregister: unregister,
};

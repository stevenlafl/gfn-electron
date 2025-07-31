const { BrowserWindow } = require("electron");

function redirectConsoleLogInDevTools() {
  console.log = function (...args) {
    if (BrowserWindow.getAllWindows().length === 0) return;
    BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
      `console.log('Backend:', ${JSON.stringify(args)})`,
    );
  };
}

function duplicateConsoleLogInDevTools() {
  const cl = console.log;
  console.log = function (...args) {
    cl.apply(this, args);
    if (BrowserWindow.getAllWindows().length === 0) return;
    BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
      `console.log('Backend:', ${JSON.stringify(args)})`,
    );
  };
}

module.exports = {
  redirectConsoleLogInDevTools: redirectConsoleLogInDevTools,
  duplicateConsoleLogInDevTools: duplicateConsoleLogInDevTools,
};

const { app, BrowserWindow } = require("electron");

var isFullScreen = false;
var isGameStreamingScreen = false;

function toggleFullscreen(state) {
  var window = BrowserWindow.getAllWindows()[0];
  if (!window) {
    console.error("No browser window found to toggle fullscreen.");
    return;
  }
  if (window.isDestroyed()) {
    console.error("Browser window is destroyed, cannot toggle fullscreen.");
    return;
  }

  var actualState = window.isFullScreen();
  if (isFullScreen != state || actualState != state) {
    if (state || !isGameStreamingScreen) {
      window.setFullScreen(state);
      isFullScreen = state;
      console.log("Fullscreen state changed to: " + state);

      if (state) {
        window.webContents.executeJavaScript(
          `
          if (window.document.body.requestPointerLock) {
            window.document.body.requestPointerLock()
          };
          `,
        );
        focusWindow();
      } else {
        window.webContents.executeJavaScript(
          `
          if (window.document.body.exitPointerLock) {
            window.document.body.exitPointerLock()
          };
          `,
        );
      }
    }
  }
}

function toggleGameStreamingMode(state) {
  if (isGameStreamingScreen != state) {
    isGameStreamingScreen = state;
    console.log("Game streaming mode state changed to: " + state);
  }

  toggleFullscreen(isGameStreamingScreen);

  if (state) {
    focusWindow();
  }
}

function switchFullscreenState() {
  if (isFullScreen) {
    toggleFullscreen(false);
  } else {
    toggleFullscreen(true);
  }
}

function focusWindow() {
  if (BrowserWindow.getAllWindows().length === 0) {
    return;
  }
  BrowserWindow.getAllWindows()[0].focus();
}

app.on("browser-window-created", async function (event, window) {
  window.on("leave-full-screen", async function (event, window) {
    console.log("Window left fullscreen mode");
    event.preventDefault();
    if (isGameStreamingScreen) {
      toggleFullscreen(true);
    }
  });
  window.on("page-title-updated", async function (event, title) {
    toggleGameStreamingMode(title.includes("on GeForce NOW"));
  });
});

module.exports = { toggleFullscreen, switchFullscreenState };

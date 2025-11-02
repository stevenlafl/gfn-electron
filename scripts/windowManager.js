const { app, BrowserWindow } = require("electron");

var isFullScreen = false;
var isGameStreamingScreen = false;
var streamResolution = { width: 1920, height: 1080 }; // Default resolution

async function detectStreamResolution() {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;

  try {
    const resolution = await window.webContents.executeJavaScript(`
      (function() {
        const video = document.querySelector('video');
        if (video && video.videoWidth && video.videoHeight) {
          return {
            width: video.videoWidth,
            height: video.videoHeight
          };
        }
        return null;
      })();
    `);

    if (resolution) {
      streamResolution = resolution;
      console.log(`Detected stream resolution: ${resolution.width}x${resolution.height}`);
    }
  } catch (error) {
    console.error("Failed to detect stream resolution:", error);
  }
}

function toggleFullscreen(state) {
  console.log(`toggleFullscreen called with state: ${state}`);
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
  console.log(`Current fullscreen state - isFullScreen: ${isFullScreen}, actualState: ${actualState}, isGameStreamingScreen: ${isGameStreamingScreen}`);

  if (isFullScreen != state || actualState != state) {
    console.log(`State mismatch detected, attempting to change fullscreen`);
    console.log(`Calling window.setFullScreen(${state})`);
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
      // Exiting fullscreen - resize window to match stream resolution
      if (isGameStreamingScreen) {
        const UI_CHROME_HEIGHT = 73; // Titlebar + menu bar

        // Calculate aspect ratio from stream resolution
        const aspectRatio = streamResolution.width / streamResolution.height;

        // Window height = stream height
        const windowHeight = streamResolution.height;

        // Window width calculated to maintain aspect ratio (accounting for chrome)
        const windowWidth = Math.round((windowHeight - UI_CHROME_HEIGHT) * aspectRatio);

        console.log(`Resizing window - Stream: ${streamResolution.width}x${streamResolution.height}, Aspect ratio: ${aspectRatio.toFixed(3)}, Window content: ${windowWidth}x${windowHeight - UI_CHROME_HEIGHT}`);
        window.setContentSize(windowWidth, windowHeight - UI_CHROME_HEIGHT);
        window.center();
      }
      window.webContents.executeJavaScript(
        `
        if (window.document.exitPointerLock) {
          window.document.exitPointerLock()
        };
        `,
      );
    }
  } else {
    console.log(`No state change needed - already in desired state`);
  }
}

async function toggleGameStreamingMode(state) {
  if (isGameStreamingScreen != state) {
    isGameStreamingScreen = state;
    console.log("Game streaming mode state changed to: " + state);
  }

  toggleFullscreen(isGameStreamingScreen);

  if (state) {
    focusWindow();
    // Wait for video element to load, then detect resolution
    setTimeout(async () => {
      await detectStreamResolution();
      // Keep checking resolution periodically in case it changes
      const resolutionCheckInterval = setInterval(async () => {
        if (!isGameStreamingScreen) {
          clearInterval(resolutionCheckInterval);
          return;
        }
        await detectStreamResolution();
      }, 5000); // Check every 5 seconds
    }, 2000); // Initial delay to let video load
  }
}

function switchFullscreenState() {
  console.log(`switchFullscreenState called - current isFullScreen: ${isFullScreen}`);
  if (isFullScreen) {
    console.log("Switching to windowed mode");
    toggleFullscreen(false);
  } else {
    console.log("Switching to fullscreen mode");
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
    isFullScreen = false;
  });
  window.on("page-title-updated", async function (event, title) {
    toggleGameStreamingMode(title.includes("on GeForce NOW"));
  });
});

module.exports = { toggleFullscreen, switchFullscreenState };

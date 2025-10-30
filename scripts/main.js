const { app, BrowserWindow } = require("electron");
const path = require("path");
const Discord = require("./discord.js");
const Shortcuts = require("./shortcuts.js");
const HardwareAcceleration = require("./hardwareAcceleration.js");
const Magic = require("./magic.js");
const Utils = require("./utils.js");

const homePage = "https://play.geforcenow.com";

const debugMode = process.argv.includes("--debug-mode");
const disableMagic = process.argv.includes("--disable-magic");

console.log("Process arguments: " + process.argv);

// Enable hardware acceleration and handle GPU crashes
// This is necessary for the GeForce NOW client to function properly without issues related to video decoding and rendering / input lagging.
HardwareAcceleration.tryEnable();

// Handle GPU crashes to ensure the application can recover gracefully
// This will attempt to restart the application with a different 'use-gl' switch implementation or disable hardware acceleration if necessary.
// This is crucial for maintaining stability, especially on systems with varying GPU capabilities.
HardwareAcceleration.handleGPUCrash();

// CRITICAL: Certificate error handler must be registered BEFORE app.ready
// Otherwise Chromium will reject AnyProxy MITM certificates before the handler can accept them
if (!disableMagic) {
  const Proxy = require("./proxy.js");
  Proxy.handleCertElectronCertErrors();
  console.log("Certificate error handler registered");
}

app.whenReady().then(async () => await main());

/// This is the main entry point for the GeForce NOW client application once electron app is ready.
/// It initializes the application, sets up the main window, and handles various events.
async function main() {
  Shortcuts.register();
  const mainWindow = await createWnd();

  if (!disableMagic) {
    console.log("Magic is enabled, setting up high resolution support.");
    console.warn(
      "WARN: Magic is experimental, you may experience issues, games may not start on the first try but will work on the second try.",
    );
    // Pass the window's session so proxy is applied to the correct session
    await Magic.useHighResolutionSupport(debugMode, mainWindow.webContents.session);
  } else {
    console.log("Magic is disabled, skipping high resolution support.");
  }

  await Discord.setActivity("Home on GeForce NOW");
}

async function createWnd() {
  const mainWindow = new BrowserWindow({
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      userAgent: Magic.fakeWindowsGFNUA(),
      // Use custom partition to isolate session
      partition: 'persist:gfn-no-sw',
    },
  });

  // Block service worker registration by overriding the API
  mainWindow.webContents.on('did-start-loading', () => {
    mainWindow.webContents.executeJavaScript(`
      if ('serviceWorker' in navigator) {
        console.log('[SW-BLOCK] Blocking service worker registration');
        // Unregister any existing service workers
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          for(let registration of registrations) {
            registration.unregister();
            console.log('[SW-BLOCK] Unregistered service worker:', registration.scope);
          }
        });
        // Override register to prevent new registrations
        navigator.serviceWorker.register = function() {
          console.log('[SW-BLOCK] Service worker registration blocked');
          return Promise.reject(new Error('Service workers disabled'));
        };
      }
    `).catch(err => console.log('[SW-BLOCK] Failed to inject:', err.message));
  });

  var promise = null;

  if (process.argv.includes("--direct-start")) {
    promise = mainWindow.loadURL(
      "https://play.geforcenow.com/mall/#/streamer?launchSource=GeForceNOW&cmsId=" +
        process.argv[process.argv.indexOf("--direct-start") + 1],
    );
  } else {
    promise = mainWindow.loadURL(homePage);
  }

  if (debugMode) {
    console.log("Debug mode is enabled, opening developer tools.");
    mainWindow.webContents.openDevTools({ mode: "detach" });
    mainWindow.webContents.on("will-navigate", (event, url) => {
      console.log("will-navigate", url);
      event.preventDefault();
    });
    mainWindow.webContents.executeJavaScript(
      `alert('Debug mode is enabled, redirecting backend console output to devtools')`,
    );
    Utils.redirectConsoleLogInDevTools();
  }

  await promise;
  return mainWindow;
}

app.on("activate", async function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWnd();
  }
});

app.on("browser-window-created", async function (e, window) {
  window.setBackgroundColor("#1A1D1F");
  window.setMenu(null);

  if (disableMagic) {
    window.webContents.setUserAgent(Magic.nativeLinuxGFNUA());
  } else {
    window.webContents.setUserAgent(Magic.fakeWindowsGFNUA());
  }

  window.webContents.on("new-window", (event, url) => {
    event.preventDefault();
    BrowserWindow.getAllWindows()[0].loadURL(url);
  });

  window.on("page-title-updated", async function (e, title) {
    await Discord.setActivity(title);
  });
});

app.on("will-quit", async () => {
  Magic.dispose();
  Shortcuts.unregister();
});

app.on("window-all-closed", async function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
  app.exit(0);
});

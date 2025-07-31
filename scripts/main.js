const { app, BrowserWindow, session, protocol } = require("electron");
const electronLocalshortcut = require("electron-localshortcut");
const findProcess = require("find-process");
const fs = require("fs");
const path = require("path");
const { DiscordRPC } = require("./rpc.js");
const { switchFullscreenState } = require("./windowManager.js");
const { servePacScript, startProxyServer } = require("./proxy.js");

var externalProxy = null;
// var externalProxy = "127.0.0.1:8080";
var homePage = "https://play.geforcenow.com";
var userAgent = fakeWindowsGFNUA();

console.log("Using user agent: " + userAgent);
console.log("Process arguments: " + process.argv);

app.on(
  "certificate-error",
  (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    // On certificate error we disable default behaviour (stop loading the page)
    // and we then say "it is all fine - true" to the callback
    callback(true);
  },
);

useHardwareAccelation(app);

// To identify a possible stable 'use-gl' switch implementation for our application, we utilize a config file that stores the number of crashes.
// On Linux, the crash count is likely stored here: /home/[username]/.config/GeForce NOW/config.json.
// To reset the crash count, we can delete that file.

// If the 'use-gl' switch with the 'angle' implementation crashes, the app will then use the 'egl' implementation.
// If the 'egl' implementation also crashes, the app will disable hardware acceleration.

// When I try to use the 'use-gl' switch with 'desktop' or 'swiftshader', it results in an error indicating that these options are not among the permitted implementations.
// It's possible that future versions of Electron may introduce support for 'desktop' and 'swiftshader' implementations.

// Based on my current understanding (which may be incorrect), the 'angle' implementation is preferred due to its utilization of 'OpenGL ES', which ensures consistent behavior across different systems, such as Windows and Linux systems.
// Furthermore, 'angle' includes an additional abstraction layer that could potentially mitigate bugs or circumvent limitations inherent in direct implementations.

// When the 'use-gl' switch is functioning correctly, I still encounter the 'GetVSyncParametersIfAvailable() error' three times, but it does not occur thereafter (based on my testing).
const configPath = path.join(app.getPath("userData"), "config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
  : { crashCount: 0 };

switch (config.crashCount) {
  case 0:
    app.commandLine.appendArgument("enable-accelerated-video-decode");
    app.commandLine.appendSwitch("use-gl", "angle");
    break;
  case 1:
    app.commandLine.appendArgument("enable-accelerated-video-decode");
    app.commandLine.appendSwitch("use-gl", "egl");
    break;
  default:
    app.disableHardwareAcceleration();
}

function useHardwareAccelation(electronApp) {
  electronApp.commandLine.appendSwitch(
    "enable-features",
    "VaapiVideoDecoder,WaylandWindowDecorations,RawDraw",
  );

  electronApp.commandLine.appendSwitch(
    "disable-features",
    "UseChromeOSDirectVideoDecoder",
  );
  electronApp.commandLine.appendSwitch(
    "enable-features",
    "AcceleratedVideoDecodeLinuxGL",
  );
  electronApp.commandLine.appendSwitch("enable-accelerated-mjpeg-decode");
  electronApp.commandLine.appendSwitch("enable-accelerated-video");
  electronApp.commandLine.appendSwitch("ignore-gpu-blocklist");
  electronApp.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
  electronApp.commandLine.appendSwitch("enable-gpu-rasterization");
  electronApp.commandLine.appendSwitch("enable-zero-copy");
  electronApp.commandLine.appendSwitch("enable-gpu-memory-buffer-video-frames");
}

function fakeWindowsGFNUA() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";
}

// might be used in arg switches in the future
function nativeLinuxGFNUA() {
  return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";
}

function proxifySession(pacScriptUrl, callback) {
  console.log("Setting proxy with PAC script URL:", pacScriptUrl);

  var proxyConfig = {
    mode: "pac_script",
    pacScript: pacScriptUrl,
  };

  session.defaultSession
    .setProxy(proxyConfig)
    .then(() => {
      console.log("Proxy set successfully");
      if (callback) {
        callback();
      }
    })
    .catch(() => console.error("Failed to set proxy"));
}

async function createWindow() {
  const mainWindow = new BrowserWindow({
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      userAgent: userAgent,
    },
  });

  if (process.argv.includes("--direct-start")) {
    mainWindow.loadURL(
      "https://play.geforcenow.com/mall/#/streamer?launchSource=GeForceNOW&cmsId=" +
        process.argv[process.argv.indexOf("--direct-start") + 1],
    );
  } else {
    mainWindow.loadURL(homePage);
  }

  /*
  uncomment this to debug any errors with loading GFN landing page

  mainWindow.webContents.on("will-navigate", (event, url) => {
    console.log("will-navigate", url);
    event.preventDefault();
  });
  */
}

let discordIsRunning = false;

app.whenReady().then(async () => {
  console.log("Application is ready");
  startProxyServer((proxyUrl) => {
    var proxy = proxyUrl;
    if (externalProxy) {
      console.log(`Using external proxy: ${externalProxy}`);
      proxy = externalProxy;
    }
    servePacScript(proxy, (url) =>
      proxifySession(url, async () => {
        discordIsRunning = await isDiscordRunning();

        createWindow();
        // Ensure isDiscordRunning is called before createWindow to prevent the 'browser-window-created' event from triggering before the Discord check is complete.

        if (discordIsRunning) {
          DiscordRPC("GeForce NOW");
        }
      }),
    );
  });

  app.on("activate", async function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

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
});

app.on("browser-window-created", async function (e, window) {
  window.setBackgroundColor("#1A1D1F");
  window.setMenu(null);

  window.webContents.setUserAgent(userAgent);

  window.webContents.on("new-window", (event, url) => {
    event.preventDefault();
    BrowserWindow.getAllWindows()[0].loadURL(url);
  });

  if (discordIsRunning) {
    window.on("page-title-updated", async function (e, title) {
      DiscordRPC(title);
    });
  }
});

app.on("child-process-gone", (event, details) => {
  if (details.type === "GPU" && details.reason === "crashed") {
    config.crashCount++;
    fs.writeFileSync(configPath, JSON.stringify(config));

    console.log(
      "Initiating application restart with an alternative 'use-gl' switch implementation or with hardware acceleration disabled, aiming to improve stability or performance based on prior execution outcomes.",
    );

    app.relaunch();
    app.exit(0);
  }
});

app.on("will-quit", async () => {
  electronLocalshortcut.unregisterAll();
});

app.on("window-all-closed", async function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function isDiscordRunning() {
  return new Promise((resolve) => {
    findProcess("name", "Discord")
      .then((list) => {
        if (list.length > 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .catch((error) => {
        console.log("Error checking Discord process:", error);
        resolve(false);
      });
  });
}

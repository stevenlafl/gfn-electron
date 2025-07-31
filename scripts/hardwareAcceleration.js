const { app } = require("electron");
const path = require("path");
const fs = require("fs");

function tryEnable() {
  app.commandLine.appendSwitch(
    "enable-features",
    "VaapiVideoDecoder,WaylandWindowDecorations,RawDraw",
  );

  app.commandLine.appendSwitch(
    "disable-features",
    "UseChromeOSDirectVideoDecoder",
  );
  app.commandLine.appendSwitch(
    "enable-features",
    "AcceleratedVideoDecodeLinuxGL",
  );
  app.commandLine.appendSwitch("enable-accelerated-mjpeg-decode");
  app.commandLine.appendSwitch("enable-accelerated-video");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-gpu-memory-buffer-video-frames");

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
}

function handleGPUCrash() {
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
}

module.exports = {
  tryEnable: tryEnable,
  handleGPUCrash: handleGPUCrash,
};

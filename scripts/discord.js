const findProcess = require("find-process");
const { BrowserWindow } = require("electron");

var client;

function isRunning() {
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

async function setActivity(title) {
  if (await isRunning()) {
    var window = BrowserWindow.getAllWindows()[0];
    window.on("page-title-updated", async function (e, title) {
      Rpc(title);
    });
  }
}

function Rpc(title) {
  if (process.argv.includes("--disable-rpc")) return;

  if (!client) {
    client = require("discord-rich-presence")("963128360219869194");
  }

  let d;

  if (title.includes("on GeForce NOW")) {
    d = title;
  } else {
    d = "Home on GeForce NOW";
  }

  client.updatePresence({
    details: d,
    state: `Not affiliated with NVIDIA`,
    startTimestamp: Date.now(),
    largeImageKey: "icon",
    instance: true,
  });
}

module.exports = {
  isDiscordRunning: isRunning,
  setActivity: setActivity,
};

const Proxy = require("./proxy.js");

var externalProxy = null;
// var externalProxy = "127.0.0.1:8080";

// starts the proxy server and serves the PAC script
// the PAC script is used to determine which URLs should be proxied
// and which should be accessed directly
// proxy is used to override GeForceNOW body / headers for session requests to bypass restrictions for high monitor resolutions
// the proxy fakes the GeForce NOW client and allows us to use the web version of GeForce NOW with custom resolutions
async function useHighResolutionSupport(verbose, targetSession) {
  return new Promise((resolve) => {
    Proxy.setVerbose(verbose);
    Proxy.start(
      (proxyUrl) => {
        var proxy = proxyUrl;
        if (externalProxy) {
          proxy = externalProxy;
        }
        Proxy.servePacScript(proxy, (url) =>
          Proxy.handleElectronSession(url, () => {
            // Certificate error handler is now registered in main.js BEFORE app.ready
            console.log("High resolution support enabled");
            resolve();
          }, targetSession),
        );
      },
      () => {
        reject();
      },
    );
  });
}

function dispose() {
  Proxy.close();
  console.log("High resolution support disabled");
}

function fakeWindowsGFNUA() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";
}

// might be used in arg switches in te future
function nativeLinuxGFNUA() {
  return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";
}

module.exports = {
  useHighResolutionSupport,
  fakeWindowsGFNUA,
  nativeLinuxGFNUA,
  dispose,
};

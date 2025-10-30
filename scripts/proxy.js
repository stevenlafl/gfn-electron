const express = require("express");
const AnyProxy = require("anyproxy");
const http = require("http");
const httpProxy = require("http-proxy");
const { app, session } = require("electron");

var verbose = true; // Set to true for detailed logging

// Mixed Content:
// The page at 'https://play.geforcenow.com/games?game-id=<game_id>&lang=en_US&asset-id=<asset_id>' was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint
// 'ws://null:<port>/rtsps://<ip>.cloudmatchbeta.nvidiagrid.net:<port>/sign_in?peer_id=peer-<id>&version=2'.
// This request has been blocked; this endpoint must be available over WSS.

// --- PAC script logic ---
const pacScript = `
  function FindProxyForURL(url, host) {
      var proxy = "PROXY PROXY_PLACEHOLDER";

      console.log("FindProxyForURL called with URL: " + url + " and host: " + host);

      // Exclude WebSocket URLs from proxying
      if (url.indexOf("ws://") === 0 || url.indexOf("wss://") === 0) {
        return "DIRECT";
      }

      // Always check host first for the domain - reliable
      if (shExpMatch(host, "*.nvidiagrid.net")) {

         // Because Chrome strips path, try best-effort match on URL path using shExpMatch
         // This might fail if paths are stripped, so be ready for fallback
         //
         if (shExpMatch(url, "*/v2/session*")) {
           return proxy; // proxy only /v2/session URLs
         }

         // If path is stripped, you might want to "fail safe" and just direct for other hosts
         // return "DIRECT";
          return proxy;
       }

      return "DIRECT";
  }
`;

function generatePacScript(proxyUrl) {
  // This function can be used to dynamically generate the PAC script if needed
  return pacScript.replace("PROXY_PLACEHOLDER", proxyUrl);
}

const pac_port = 3000; // Port for the PAC script server
var pacScriptApp = null;

function servePacScript(proxyUrl, callback) {
  if (pacScriptApp) {
    if (verbose) {
      console.log(
        "Stopping existing PAC script server before starting a new one.",
      );
    }
    pacScriptApp.close();
  }

  if (verbose) {
    console.log(`Starting pac_script server for proxy: ${proxyUrl}`);
  }

  // --- Serve the PAC script on port 3000 ---
  pacScriptApp = express();
  pacScriptApp.get("/proxy.pac", (req, res) => {
    console.log("[PAC-SERVER] Client requested PAC script from:", req.ip);
    const script = generatePacScript(proxyUrl);
    console.log("[PAC-SERVER] Serving PAC script:", script.substring(0, 100) + "...");
    res.type("application/x-ns-proxy-autoconfig");
    res.send(script);
  });
  pacScriptApp.listen(pac_port, () => {
    const pacUrl = `http://127.0.0.1:${pac_port}/proxy.pac`;
    console.log(`[PAC-SERVER] PAC file server listening at ${pacUrl}`);
    callback(pacUrl);
  });
}

const options = {
  port: 8082,

  webInterface: {
    enable: verbose, // you can enable web UI for the proxy to inspect traffic
    webPort: 8002,
  },
  forceProxyHttps: true,
  // wsIntercept: true,
  silent: !verbose,
  rule: {
    // Override request handling
    *onError(requestDetail, error) {
      console.error("[ANYPROXY-ERROR] Request error:", requestDetail.url, error.message || error);
      // Handle errors here if needed
    },
    *onConnectError(requestDetail, error) {
      console.error("[ANYPROXY-CONNECT-ERROR] Connect error:", requestDetail.url, error.message || error);
      // Handle connect errors here if needed
    },
    *beforeSendRequest(requestDetail) {
      if (verbose) {
        console.log("[ANYPROXY-REQUEST] Intercepting:", requestDetail.url);
      }
      const url = requestDetail.url;
      const urlPattern = /\.*.nvidiagrid\.net\/v2\/session/;

      if (urlPattern.test(url)) {
        var streamType =
          requestDetail.requestOptions.headers["nv-client-streamer"];

        if (streamType) {
          if (verbose) {
            console.log("Stream type detected:", streamType);
          }
        }
        var method = requestDetail.requestOptions.method;

        if (["POST", "PUT"].includes(method)) {
          const newRequestOptions = requestDetail.requestOptions;

          if (verbose) {
            console.log("Session change detected");
          }

          if (
            requestDetail.requestOptions.method == "POST" &&
            streamType == "WEBRTC"
          ) {
            if (verbose) {
              console.log("WebRTC session create detected");
            }
            newRequestOptions.headers["NV-Client-Type"] = "NATIVE";
            newRequestOptions.headers["NV-Device-Type"] = "DESKTOP";
            newRequestOptions.headers["NV-Device-OS"] = "WINDOWS";
            newRequestOptions.headers["NV-Client-Streamer"] = "NVIDIA-CLASSIC";
            newRequestOptions.headers["sec-ch-ua-platform"] = '"WINDOWS"';
            newRequestOptions.headers["sec-ch-ua-platform-version"] = "14.0.0";
            newRequestOptions.headers["user-agent"] =
              "GFN-PC/30.0 (Windows 10.0.19041) BifrostClientSDK/4.77 (36006357)";
          }

          if (requestDetail.requestData) {
            if (verbose) {
              console.log("Modifying request body for session change");
            }
            const bodyJson = JSON.parse(
              requestDetail.requestData.toString("utf8"),
            );

            bodyJson.sessionRequestData.clientRequestMonitorSettings = [
              {
                heightInPixels: 1440,
                framesPerSecond: 120,
                widthInPixels: 3440,
              },
            ];

            if (verbose) {
              console.log(
                bodyJson.sessionRequestData.clientRequestMonitorSettings,
              );
            }

            const newBodyBuffer = Buffer.from(JSON.stringify(bodyJson), "utf8");

            return {
              requestOptions: newRequestOptions,
              requestData: newBodyBuffer,
            };
          }

          return {
            requestOptions: newRequestOptions,
          };
        }
      }
    },
  },
};

var proxyServer = null;

function start(callback, failCallback) {
  if (!AnyProxy.utils.certMgr.ifRootCAFileExists()) {
    AnyProxy.utils.certMgr.generateRootCA((error, keyPath) => {
      if (!error) {
        if (verbose) {
          console.log("MITM Root CA generated at", keyPath);
        }
        // Then install/trust this CA certificate manually
      } else {
        failCallback();
        console.error("Error generating MITM Root CA:", error);
      }
    });
  } else {
    if (verbose) {
      console.log("MITM Root CA already exists, using existing certificate.");
    }
  }

  if (proxyServer) {
    if (verbose) {
      console.log("Stopping existing proxy server before starting a new one.");
    }
    proxyServer.close();
  }

  proxyServer = new AnyProxy.ProxyServer(options);

  // Log errors
  proxyServer.on("error", (e) => {
    console.error("Proxy server error:", e);
  });

  proxyServer.on("ready", () => {
    if (verbose) {
      console.log(`AnyProxy HTTPS MITM proxy running on port ${options.port}`);
    }

    if (options.webInterface.enable) {
      console.log(
        `Web interface available on port ${options.webInterface.webPort}`,
      );
    }

    callback(`127.0.0.1:${options.port}`);
  });

  proxyServer.start();
}

function handleCertElectronCertErrors() {
  console.log("[CERT-HANDLER] Registering certificate-error event handler");

  app.on(
    "certificate-error",
    (event, webContents, url, error, certificate, callback) => {
      console.log(`[CERT] EVENT FIRED! URL: ${url}, Error: ${error}, Issuer: ${certificate.issuerName}`);

      if (
        certificate.issuerName == "AnyProxy" &&
        /\.*.nvidiagrid\.net/.test(url)
      ) {
        // If the certificate is from AnyProxy, we allow it
        // This is necessary for the proxy to work correctly
        console.log(`[CERT] Accepting AnyProxy certificate for ${url}`);
        event.preventDefault();
        callback(true);
        return;
      }
      console.error(
        `[CERT] Rejecting certificate for ${url}: ${error} - Issuer: ${certificate.issuerName}`,
      );
      callback(false);
    },
  );

  // Also try the session-level event as a fallback
  app.on('ready', () => {
    console.log("[CERT-HANDLER] App ready, setting up session certificate verification");
    const { session } = require('electron');
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
      const { hostname, certificate, verificationResult, errorCode } = request;
      console.log(`[CERT-VERIFY-PROC] Verifying: ${hostname}, Issuer: ${certificate.issuerName}, Error: ${errorCode}, Result: ${verificationResult}`);

      // Accept AnyProxy certificates for nvidiagrid.net
      if (hostname.endsWith('.nvidiagrid.net')) {
        console.log(`[CERT-VERIFY-PROC] nvidiagrid.net detected - checking certificate`);
        if (certificate.issuerName === 'AnyProxy') {
          console.log(`[CERT-VERIFY-PROC] ✓ Accepting AnyProxy cert for ${hostname}`);
          callback(0); // 0 = success
          return;
        }
        console.log(`[CERT-VERIFY-PROC] ⚠ Certificate not from AnyProxy, issuer: ${certificate.issuerName}`);
      }

      callback(-2); // -2 = use Chromium's verification
    });
  });
}

function handleElectronSession(pacScriptUrl, callback, targetSession) {
  console.log("[ELECTRON-SESSION] Setting proxy with PAC script URL:", pacScriptUrl);

  // Use provided session or default session
  const sessionToUse = targetSession || session.defaultSession;
  console.log("[ELECTRON-SESSION] Using session:", targetSession ? "custom partition" : "default");

  var proxyConfig = {
    mode: "pac_script",
    pacScript: pacScriptUrl,
  };

  console.log("[ELECTRON-SESSION] Proxy config:", JSON.stringify(proxyConfig));

  sessionToUse
    .setProxy(proxyConfig)
    .then(() => {
      console.log("[ELECTRON-SESSION] Proxy set successfully");
      // Verify the proxy resolution for different URLs
      sessionToUse.resolveProxy("https://prod.cloudmatchbeta.nvidiagrid.net/v2/serverInfo")
        .then((resolvedProxy) => {
          console.log("[ELECTRON-SESSION] Resolved proxy for serverInfo:", resolvedProxy);
        });
      sessionToUse.resolveProxy("https://play.geforcenow.com")
        .then((resolvedProxy) => {
          console.log("[ELECTRON-SESSION] Resolved proxy for play.geforcenow.com:", resolvedProxy);
        });
      if (callback) {
        callback();
      }
    })
    .catch((error) => console.error("[ELECTRON-SESSION] Failed to set proxy:", error));
}

function unhandleElectronSession() {
  if (verbose) {
    console.log("Removing proxy settings");
  }
  session.defaultSession.setProxy({ mode: "direct" }).catch((error) => {
    console.error("Failed to remove proxy:", error);
  });
}

function close() {
  if (verbose) {
    console.log("Stopping proxy server and PAC script server");
  }
  if (proxyServer) {
    proxyServer.close();
    proxyServer = null;
  }
  if (pacScriptApp) {
    pacScriptApp.close();
  }
  if (verbose) {
    console.log("Proxy server and PAC script server stopped");
  }

  unhandleElectronSession();
}

function setVerbose(value) {
  verbose = value;
}

module.exports = {
  servePacScript,
  start,
  handleCertElectronCertErrors,
  handleElectronSession,
  unhandleElectronSession,
  close,
  setVerbose,
};

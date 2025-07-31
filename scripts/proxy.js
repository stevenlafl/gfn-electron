const express = require("express");
const AnyProxy = require("anyproxy");
const http = require("http");
const httpProxy = require("http-proxy");

// --- PAC script logic ---
const pacScript = `
  function FindProxyForURL(url, host) {
      var proxy = "PROXY PROXY_PLACEHOLDER";

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
function servePacScript(proxyUrl, callback) {
  console.log(`Starting pac_script server for proxy: ${proxyUrl}`);

  // --- Serve the PAC script on port 3000 ---
  const pacApp = express();
  pacApp.get("/proxy.pac", (req, res) => {
    console.log("Client requested PAC script");
    res.type("application/x-ns-proxy-autoconfig");
    res.send(generatePacScript(proxyUrl));
  });
  pacApp.listen(pac_port, () => {
    const pacUrl = `http://127.0.0.1:${pac_port}/proxy.pac`;
    console.log(`PAC file served at ${pacUrl}`);
    callback(pacUrl);
  });
}

function startProxyServer(callback) {
  if (!AnyProxy.utils.certMgr.ifRootCAFileExists()) {
    AnyProxy.utils.certMgr.generateRootCA((error, keyPath) => {
      if (!error) {
        console.log("Root CA generated at", keyPath);
        // Then install/trust this CA certificate manually
      } else {
        console.error("Error generating Root CA:", error);
      }
    });
  } else {
    console.log("Root CA already exists, using existing certificate.");
  }

  const options = {
    port: 8082,

    webInterface: {
      enable: true, // you can enable web UI for the proxy to inspect traffic
      webPort: 8002,
    },
    forceProxyHttps: true,
    wsIntercept: true,
    silent: true,
    dangerouslyIgnoreUnauthorized: true,
    rule: {
      // Override request handling
      *onError(requestDetail, error) {
        console.error("Error in request:", requestDetail, error);
        // Handle errors here if needed
      },
      *onConnectError(requestDetail, error) {
        console.error("Error in connect request:", requestDetail, error);
        // Handle connect errors here if needed
      },
      *beforeSendRequest(requestDetail) {
        const url = requestDetail.url;
        const urlPattern = /\.*.nvidiagrid\.net\/v2\/session/;

        if (urlPattern.test(url)) {
          var streamType =
            requestDetail.requestOptions.headers["nv-client-streamer"];

          if (streamType) {
            console.log("Stream type detected:", streamType);
          }
          var method = requestDetail.requestOptions.method;

          if (["POST", "PUT"].includes(method)) {
            const newRequestOptions = requestDetail.requestOptions;
            console.log("Session change detected: " + method);
            if (
              requestDetail.requestOptions.method == "POST" &&
              streamType == "WEBRTC"
            ) {
              console.log("WebRTC session create detected");
              newRequestOptions.headers["NV-Client-Type"] = "NATIVE";
              newRequestOptions.headers["NV-Device-Type"] = "DESKTOP";
              newRequestOptions.headers["NV-Device-OS"] = "WINDOWS";
              newRequestOptions.headers["NV-Client-Streamer"] =
                "NVIDIA-CLASSIC";
              // newRequestOptions.headers["sec-ch-ua-platform"] = '"WINDOWS"';
              // newRequestOptions.headers["sec-ch-ua-platform-version"] =
              //   "14.0.0";
              newRequestOptions.headers["user-agent"] =
                "GFN-PC/30.0 (Windows 10.0.19041) BifrostClientSDK/4.77 (36006357)";
            }

            if (requestDetail.requestData) {
              console.log("Modifying request body for session change");
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

              // Re-serialize the body
              const newBodyBuffer = Buffer.from(
                JSON.stringify(bodyJson),
                "utf8",
              );

              // Update content-length header
              // delete headers["Content-Length"];
              // requestDetail.requestOptions.headers["Content-Length"] =
              //   Buffer.byteLength(newBodyBuffer);

              console.log(newRequestOptions.headers);

              return {
                requestOptions: newRequestOptions,
                requestData: newBodyBuffer,
              };
            }

            return {
              requestOptions: { ...requestDetail.requestOptions, headers },
            };
          }
        }
      },
    },
  };

  const proxyServer = new AnyProxy.ProxyServer(options);

  // Log errors
  proxyServer.on("error", (e) => {
    console.error("Proxy server error:", e);
  });

  proxyServer.on("ready", () => {
    console.log(`AnyProxy HTTPS MITM proxy running on port ${options.port}`);
    console.log(
      `Web interface available on port ${options.webInterface.webPort}`,
    );
    callback(`127.0.0.1:${options.port}`);
  });

  proxyServer.start();
}

module.exports = {
  servePacScript,
  startProxyServer,
};

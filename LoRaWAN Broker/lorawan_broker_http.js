import express from "express";
import { Server } from "socket.io";
import http from "http";
import https from "https";
import fs from "fs";
import fetch from "node-fetch";
import { decode } from "punycode";
import { Console } from "console";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { open } from "node:fs/promises";

const CALIBRATION_FILE =
  "/Users/jorgerangel/Documents/dev/LoRaWAN-HTTPS-app/LoRaWAN Broker/MFCCalibrations-ReadDirectlyByFlareCode.txt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept",
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

let server;
let usingHttps = false;
try {
  const options = {
    key: fs.readFileSync("localhost-key.pe"),
    cert: fs.readFileSync("localhost.pem"),
  };
  server = https.createServer(options, app);
  usingHttps = true;
} catch (err) {
  console.warn(
    "TLS key/cert not found or couldn't be read, falling back to HTTP:",
    err.message,
  );
  server = http.createServer(app);
}

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

const APP_ID_MFC_1 = "eerl-mfc";
const DEVICE_ID_MFC_1 = "mfc-node-01";

const APP_ID_MFC_2 = "eerl-mfc";
const DEVICE_ID_MFC_2 = "mfc-node-01";

const API_KEY =
  "NNSXS.ELCJY4CDOZIVNZAK2XKI7YDO4L3UI5MG43OXCSA.N22HW7G5ACVPRRIOLJIA2V3ZKG4YKN5BI73TVH4TKPKN7VKXDSRQ";

const TTN_API_URL = "http://172.17.55.40:1885/api/v3";

let gatewayTime = "";

const MFC = {
  mfc_1: {
    id: 0,
    name: "",
    lastValue: null,
    deviceState: false,
    lastFlow: 0.0,
    lastSetpoint: 0.0,
    gases: [],
  },
  mfc_2: {
    id: 1,
    name: "",
    lastValue: null,
    deviceState: false,
    lastFlow: 0.0,
    lastSetpoint: 0.0,
    gases: [],
  },
};

const logResults = [];

function decodeUplink(bytes, results) {
  const payloadType = bytes[0];

  if (payloadType === 0x1f) {
    if (bytes.length < 3) {
      console.warn(
        `Error uplink too short: expected 3 bytes, got ${bytes.length}`,
      );
      return results;
    }
    const errorSource = bytes[1];
    const errorCode = bytes[2];
    results.push({
      type: "error",
      errorSource: errorSource,
      errorCode: errorCode,
      payload: bytes
        .toString()
        .replace(/(.{2})/g, "$1 ")
        .trim(),
    });
  } else if (payloadType == 0x11) {
    results.push({
      type: "ACK",
      message: "Setpoint Received",
      payload: bytes.toString().replace(/(.{2})/g, " $1"),
    });
  } else if (payloadType === 0x30) {
    results.push({
      type: "heartbeat",
      message: "Device is alive",
      payload: bytes.toString().replace(/(.{2})/g, " $1"),
    });
  } else if (payloadType === 0x20) {
    if (bytes.length < 10) {
      console.warn(
        `Status uplink too short: expected 10 bytes, got ${bytes.length}. Payload: ${JSON.stringify(bytes)}`,
      );
      return results;
    }
    const mfcId = bytes[1];
    const setpointBytes = bytes.slice(2, 6);
    const flowBytes = bytes.slice(6, 10);
    const deviceBytes = bytes.slice(10, 12);

    const device = bytesToString(deviceBytes);
    const setpointValue = bytesToFloat(setpointBytes);
    const flowValue = bytesToFloat(flowBytes);

    results.push({
      type: "status",
      device: device,
      message: `MFC Status`,
      mfcId: mfcId,
      setpoint: setpointValue.toFixed(2),
      flow: flowValue.toFixed(2),
      unit: "LN/min",
      payload: bytes
        .toString()
        .replace(/(.{2})/g, "$1 ")
        .trim(),
    });

    if (mfcId == 0) {
      MFC.mfc_1.lastSetpoint = setpointValue.toFixed(2);
      MFC.mfc_1.lastFlow = flowValue.toFixed(2);
      MFC.mfc_1.name = device;
    } else if (mfcId == 1) {
      MFC.mfc_2.lastSetpoint = setpointValue.toFixed(2);
      MFC.mfc_2.lastFlow = flowValue.toFixed(2);
      MFC.mfc_2.name = device;
    }
  }

  if (results.length == 50) {
    results.length = 0;
  }

  return results;
}

function bytesToFloat(bytes) {
  const view = new DataView(new Uint8Array(bytes).buffer);
  return view.getFloat32(0, false);
}

function bytesToString(bytes) {
  const buf = Buffer.from(bytes);
  const str = buf.toString("utf-8");
  return str;
}

// app.get("/", (req, res) => {
//   res.send(`
//     <h1>MFC LoRaWAN Controller</h1>
//     <h2>MFC mfc_1</h2>
//     <p>Time: ${gatewayTime} </p>
//     <p>Last uplink: ${JSON.stringify(MFC.mfc_1.lastValue)}</p>
//     <p>Device state: ${MFC.mfc_1.deviceState ? "ON" : "OFF"}</p>
//     <p>Current Flow: ${MFC.mfc_1.lastFlow} </p>
//     <p>Setpoint: ${MFC.mfc_1.lastSetpoint} ln/min</p>

//     <button onclick="sendSetpoint_0()">SET SETPOINT</button>

//     <h2>MFC mfc_2</h2>
//     <p>Time: ${gatewayTime} </p>
//     <p>Last uplink: ${JSON.stringify(MFC.mfc_2.lastValue)}</p>
//     <p>Device state: ${MFC.mfc_2.deviceState ? "ON" : "OFF"}</p>
//     <p>Current Flow: ${MFC.mfc_2.lastFlow} </p>
//     <p>Setpoint: ${MFC.mfc_2.lastSetpoint} ln/min</p>

//     <button onclick="sendSetpoint_1()">SET SETPOINT</button>

//     <script src="/socket.io/socket.io.js"></script>
//     <script>
//       const socket = io();
//       socket.on("uplink", d => console.log("Live uplink:", d));

//       function send_0(cmd) {
//         fetch('/send-command-0', {
//           method: 'POST',
//           headers: {'Content-Type':'application/json'},
//           body: JSON.stringify({command: cmd})
//         });
//       }

//       function sendSetpoint_0() {
//         const value = prompt("Enter float setpoint (ln/min) :");
//         fetch('/setpoint-0', {
//           method: 'POST',
//           headers: {'Content-Type':'application/json'},
//           body: JSON.stringify({value})
//         });
//       }
//       function send_1(cmd) {
//         fetch('/send-command-1', {
//           method: 'POST',
//           headers: {'Content-Type':'application/json'},
//           body: JSON.stringify({command: cmd})
//         });
//       }

//       function sendSetpoint_1() {
//         const value = prompt("Enter float setpoint (ln/min) :");
//         fetch('/setpoint-1', {
//           method: 'POST',
//           headers: {'Content-Type':'application/json'},
//           body: JSON.stringify({value})
//         });
//       }
//     </script>
//   `);
// });

app.use(express.static(path.join(__dirname, "../react-app/build")));

async function resetSession(mfc) {
  let appId = "";
  let deviceId = "";

  if (mfc === 0) {
    appId = APP_ID_MFC_1;
    deviceId = DEVICE_ID_MFC_1;
  } else if (mfc === 1) {
    appId = APP_ID_MFC_2;
    deviceId = DEVICE_ID_MFC_2;
  } else {
    throw new Error("Invalid MFC id");
  }

  console.log("[resetSession] calling ttn-lw-cli for MFC", mfc);

  // Clear logs
  logResults.length = 0;

  return new Promise((resolve, reject) => {
    exec(
      `ttn-lw-cli end-devices reset ${appId} ${deviceId}`,
      (error, stdout, stderr) => {
        if (error) {
          console.error("[resetSession] exec error:", error);
          // Still do local reset as fallback
          if (mfc === 0) {
            MFC.mfc_1.lastFlow = 0.0;
            MFC.mfc_1.lastSetpoint = 0.0;
            MFC.mfc_1.lastValue = null;
            MFC.mfc_1.deviceState = false;
          } else if (mfc === 1) {
            MFC.mfc_2.lastFlow = 0.0;
            MFC.mfc_2.lastSetpoint = 0.0;
            MFC.mfc_2.lastValue = null;
            MFC.mfc_2.deviceState = false;
          }
          return resolve({
            ok: false,
            status: 500,
            body: error.message,
            local: true,
          });
        }
        console.log("[resetSession] exec output:", stdout);
        resolve({ ok: true, status: 200, body: stdout });
      },
    );
  });
}

app.post("/reset", async (req, res) => {
  try {
    const { mfc } = req.body;
    console.log("[POST /reset] body:", req.body);

    if (mfc === undefined || mfc === null) {
      return res.status(400).json({ error: "Missing mfc id" });
    }

    const result = await resetSession(mfc);
    if (!result.ok) {
      if (result.status === 404) {
        console.warn(
          `[POST /reset] TTN reset not found for mfc=${mfc}, performing local reset`,
        );
        if (mfc === 0) {
          MFC.mfc_1.lastFlow = 0.0;
          MFC.mfc_1.lastSetpoint = 0.0;
          MFC.mfc_1.lastValue = null;
          MFC.mfc_1.deviceState = false;
        } else if (mfc === 1) {
          MFC.mfc_2.lastFlow = 0.0;
          MFC.mfc_2.lastSetpoint = 0.0;
          MFC.mfc_2.lastValue = null;
          MFC.mfc_2.deviceState = false;
        }
        io.emit("reset", { mfc, local: true });
        return res.json({
          ok: true,
          message: `Local reset performed for MFC ${mfc} (TTN returned 404)`,
          ttn: result.body,
        });
      }
      return res
        .status(result.status || 500)
        .json({ error: "TTN error", details: result.body });
    }

    io.emit("reset", { mfc, local: false, ttn: result.body });
    res.json({
      ok: true,
      message: `MFC ${mfc} session reset`,
      ttn: result.body,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/uplink", (req, res) => {
  try {
    const data = req.body;

    gatewayTime = data["uplink_message"]["received_at"];

    console.log(gatewayTime);
    if (data.uplink_message?.frm_payload) {
      const payload = Buffer.from(data.uplink_message.frm_payload, "base64");

      const arrayPayload = Array.from(payload);
      if (arrayPayload[0] == 32 && arrayPayload[1] == 0) {
        MFC.mfc_1.lastValue = Array.from(payload);
        console.log(MFC.mfc_1.name);
      } else if (arrayPayload[0] == 32 && arrayPayload[1] == 1) {
        MFC.mfc_2.lastValue = Array.from(payload);
      }

      const decoded = decodeUplink(arrayPayload, logResults);

      console.log("Raw payload:", arrayPayload);
      console.log("Decoded:", decoded);

      io.emit("uplink", decoded[0]);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("UPLINK ERROR:", err);
    res.sendStatus(400);
  }
});

async function sendDownlink(bytes, fPort = 15, mfc) {
  let url = "";
  const payload = {
    downlinks: [
      {
        frm_payload: Buffer.from(bytes).toString("base64"),
        f_port: fPort,
        priority: "NORMAL",
      },
    ],
  };

  // const url = `${TTN_API_URL}/as/applications/${APP_ID_MFC_1}/devices/${DEVICE_ID_MFC_1}/down/replace`;

  if (mfc == 0) {
    url = `${TTN_API_URL}/as/applications/${APP_ID_MFC_1}/devices/${DEVICE_ID_MFC_1}/down/push`;
  } else if (mfc == 1) {
    url = `${TTN_API_URL}/as/applications/${APP_ID_MFC_2}/devices/${DEVICE_ID_MFC_2}/down/replace`;
  }

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) throw new Error(await r.text());
}

app.post("/start-session", async (req, res) => {
  console.log("Starting Session");
  try {
    const GAS_MAP = {
      "AIR": 0x00,
      "NITROGEN": 0x01,
      "METHANE": 0x02,
      "CARBON DIOXIDE": 0x03,
      "PROPANE": 0x04,
      "BUTANE": 0x05,
      "ETHANE": 0x06,
      "HYDROGEN": 0x07,
      "CARBON MONOXIDE": 0x08,
      "ACETYLENE": 0x09,
      "ETHYLENE": 0x0a,
      "PROPYLENE": 0x0b,
      "BUTYLENE": 0x0c,
      "NITROUS OXIDE": 0x0d,
    };
    const { selections } = req.body;
    if (!Array.isArray(selections)) {
      return res.status(400).json({ error: "Missing or invalid selections array" });
    }
    let gas0 = null, gas1 = null, err0 = null, err1 = null;
    for (const sel of selections) {
      const { deviceId, gas } = sel;
      if (!deviceId || !gas) continue;
      let gasKey = gas.toUpperCase();
      let gasByte = GAS_MAP[gasKey];
      if (gasByte === undefined) {
        if (deviceId === "dev_01") err0 = `Unknown gas: ${gas}`;
        if (deviceId === "dev_02") err1 = `Unknown gas: ${gas}`;
        continue;
      }
      if (deviceId === "dev_01") gas0 = gasByte;
      if (deviceId === "dev_02") gas1 = gasByte;
    }
    // Compose payload: [0x21, 0x00, gas0, 0x01, gas1, ...padding]
    const buf = Buffer.alloc(6);
    buf[0] = 0x21;
    buf[1] = 0x00;
    buf[2] = gas0 !== null ? gas0 : 0x00;
    buf[3] = 0x01;
    buf[4] = gas1 !== null ? gas1 : 0x00;
    // Remaining bytes are zero padding
    await sendDownlink([...buf], 15, 0);
    const results = [
      { deviceId: "dev_01", ok: gas0 !== null, gas: gas0, error: err0 },
      { deviceId: "dev_02", ok: gas1 !== null, gas: gas1, error: err1 },
    ];
    res.json({ ok: true, sent: buf.toString('hex'), results });
  } catch (err) {
    console.error("Start session error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/refresh", async (req, res) => {
  console.log(`Refreshing Status`);

  const buf = Buffer.alloc(3);
  buf[0] = 0x11;
  buf[1] = 0x00;

  try {
    await sendDownlink([...buf], 15, 0);
    console.log(`Refreshing Status`);
    res.json({ ok: true });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(400).json({ error: err.message });
  }
});

app.post("/send-command-0", async (req, res) => {
  const { command } = req.body;
  let bytes;

  if (command === "on") bytes = [1];
  else if (command === "off") bytes = [0];
  else if (command === "toggle") bytes = [2];
  else return res.status(400).json({ error: "Unknown command" });

  try {
    await sendDownlink(bytes, 1, 0);
    if (command === "on") MFC.mfc_2.deviceState = true;
    if (command === "off") MFC.mfc_2.deviceState = false;
    if (command === "toggle") MFC.mfc_2.deviceState = !MFC.mfc_2.deviceState;
    res.json({ ok: true });
  } catch (err) {
    console.error("Send command error:", err);
    res.status(400).json({ error: err.message });
  }
});

app.post("/setpoint-0", async (req, res) => {
  const value = parseFloat(req.body.value);
  if (isNaN(value)) return res.status(400).json({ error: "Invalid float" });

  console.log(
    `[/setpoint-0] Setting setpoint for dev_01 (MFC-${MFC.mfc_1.name}) to ${value}`,
  );

  const buf = Buffer.alloc(6);
  buf[0] = 0x10;
  buf[1] = 0x01;
  buf.writeFloatBE(value, 2);

  try {
    await sendDownlink([...buf], 15, 0);
    MFC.mfc_1.lastSetpoint = value;
    console.log(`[/setpoint-0] Updated lastSetpoint to ${value}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("Setpoint error:", err);
    res.status(400).json({ error: err.message });
  }
});

app.post("/send-command-1", async (req, res) => {
  const { command } = req.body;
  let bytes;

  if (command === "on") bytes = [1];
  else if (command === "off") bytes = [0];
  else if (command === "toggle") bytes = [2];
  else return res.status(400).json({ error: "Unknown command" });

  try {
    await sendDownlink(bytes, 1, 0);
    if (command === "on") MFC.mfc_1.deviceState = true;
    if (command === "off") MFC.mfc_1.deviceState = false;
    if (command === "toggle") MFC.mfc_1.deviceState = !MFC.mfc_1.deviceState;
    res.json({ ok: true });
  } catch (err) {
    console.error("Send command error:", err);
    res.status(400).json({ error: err.message });
  }
});

app.post("/setpoint-1", async (req, res) => {
  const value = parseFloat(req.body.value);
  if (isNaN(value)) return res.status(400).json({ error: "Invalid float" });

  console.log(
    `[/setpoint-1] Setting setpoint for dev_02 (MFC-${MFC.mfc_2.name}) to ${value}`,
  );

  const buf = Buffer.alloc(6);
  buf[0] = 0x10;
  buf[1] = 0x00; // MFC ID 0 (for dev_02 / MFC-mfc_1)
  buf.writeFloatBE(value, 2);

  try {
    await sendDownlink([...buf], 15, 0);
    MFC.mfc_2.lastSetpoint = value;
    console.log(`[/setpoint-1] Updated lastSetpoint to ${value}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("Setpoint error:", err);
    res.status(400).json({ error: err.message });
  }
});

app.get("/nodes", (req, res) => {
  res.json([
    {
      id: "node_01",
      name: "MFC-1",
      status: "online",
      type: "Gas Meter",
      devices: [
        {
          id: "dev_01",
          name: `MFC-${MFC.mfc_1.name}`,
          status: MFC.mfc_1.deviceState ? "online" : "offline",
          type: "Gas Meter",
        },
        {
          id: "dev_02",
          name: `MFC-${MFC.mfc_2.name}`,
          status: MFC.mfc_2.deviceState ? "online" : "offline",
          type: "Gas Meter",
        },
      ],
    },
    {
      id: "node_02",
      name: "MFC-2",
      status: "online",
      type: "Gas Meter",
      devices: [
        {
          id: "dev_03",
          name: "MFC-BM",
          status: "online",
          type: "Gas Meter",
        },
        {
          id: "dev_04",
          name: "Test MFC-1",
          status: "online",
          type: "Test MFC",
        },
      ],
    },
    {
      id: "node_03",
      name: "AMT-06",
      status: "online",
      type: "Wind Sensor",
      devices: [
        {
          id: "dev_05",
          name: "AMT-06",
          status: "online",
          type: "Wind Sensor",
        },

        // {
        //   id: "dev_04",
        //   name: "Test MFC-2",
        //   status: "offline",
        //   type: "Test MFC",
        // },
      ],
    },
  ]);
});

app.get("/device/:deviceName/fetch-gas", async (req, res) => {
  const { deviceName } = req.params;
  MFC.mfc_1.gases = [];
  MFC.mfc_2.gases = [];

  try {
    const file = await open(CALIBRATION_FILE);
    for await (const line of file.readLines()) {
      let row = line.split("\t");
      let device = row[0].split("-")[0];
      let gas = row[1];
      if (device == deviceName) {
        if (device == MFC.mfc_1.name) {
          MFC.mfc_1.gases.push(gas);
        } else if (device == MFC.mfc_2.name) {
          MFC.mfc_2.gases.push(gas);
        }
      }
    }

    if (deviceName == MFC.mfc_1.name) {
      MFC.mfc_1.gases = [...new Set(MFC.mfc_1.gases)];
      res.status(200).json({ gases: MFC.mfc_1.gases });
    } else if (deviceName == MFC.mfc_2.name) {
      MFC.mfc_2.gases = [...new Set(MFC.mfc_2.gases)];
      res.status(200).json({ gases: MFC.mfc_2.gases });
    } else {
      res.status(404).json({ error: "Device not found" });
    }

  } catch (error) {
    res.status(404).json({ error: "Device not found" });
    console.log(error);
  }
});

app.get("/device/:deviceId/metrics", (req, res) => {
  const { deviceId } = req.params;

  if (deviceId === "dev_01") {
    res.json({
      setpoint: MFC.mfc_1.lastSetpoint,
      flow: MFC.mfc_1.lastFlow,
    });
  } else if (deviceId === "dev_02") {
    res.json({
      setpoint: MFC.mfc_2.lastSetpoint,
      flow: MFC.mfc_2.lastFlow,
    });
  } else if (deviceId === "dev_03") {
    res.json({
      setpoint: 10,
      flow: 20,
    });
  } else if (deviceId === "dev_04") {
    res.json({
      setpoint: 20,
      flow: 20,
    });
  } else if (deviceId === "dev_05") {
    res.json({
      speed: 20,
      direction: "NE",
    });
  } else {
    res.status(404).json({ error: "Device not found" });
  }
});

app.get("/device/:deviceId/logs", (req, res) => {
  const { deviceId } = req.params;

  const deviceNum = deviceId === "dev_01" ? 0 : 1;
  const lastValue = deviceNum === 0 ? MFC.mfc_1.lastValue : MFC.mfc_2.lastValue;

  res.json(logResults);
});

io.on("connection", (s) => {
  s.emit("initial", {
    mfc_1: {
      lastValue: MFC.mfc_1.lastValue,
      deviceState: MFC.mfc_1.deviceState,
      lastSetpoint: MFC.mfc_1.lastSetpoint,
    },
    mfc_2: {
      lastValue: MFC.mfc_2.lastValue,
      deviceState: MFC.mfc_2.deviceState,
      lastSetpoint: MFC.mfc_2.lastSetpoint,
    },
  });
});

server.listen(PORT, () => {
  const proto = usingHttps ? "https" : "http";
  console.log(`${proto}://localhost:${PORT}`);
});

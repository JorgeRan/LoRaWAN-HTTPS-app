import express from "express";
import { Server } from "socket.io";
import http from "http";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

const PORT = 3000;

const CALIBRATION_FILE =
  "/Users/jorgerangel/Documents/dev/LoRaWAN-HTTPS-app/LoRaWAN Broker/MFCCalibrations-ReadDirectlyByFlareCode.txt";

import { open } from "node:fs/promises";

const mfc_1 = "BC";
const mfc_2 = "BL";

const node = {
  id: "node_01",
  name: "MFC-1",
  status: "online",
  type: "Gas Meter",
  devices: [
    {
      id: "dev_01",
      name: `MFC-${mfc_1}`,
      type: "Gas Meter",
    },
    {
      id: "dev_02",
      name: `MFC-${mfc_2}`,
      type: "Gas Meter",
    },
  ],
};

async function myFileReader() {
  const file = await open(CALIBRATION_FILE);
  for await (const line of file.readLines()) {
    let row = line.split("\t");
    let device = row[0].split('-')[0];
    console.log(row[1])
    // if (device == mfc_1 || device == mfc_2) {
    //   console.log(row[1]);
    //   console.log(device);
    // }
    // for (let i = 0; i < row.length; i++) {
    //   if (row[]) {
        
    //   }
      
    // }
    //console.log(device);
  }
}

myFileReader();

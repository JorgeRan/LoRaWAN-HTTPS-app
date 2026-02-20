import React, { useState, useEffect } from "react";
import { DeviceTabs } from "./components/DeviceTabs";
import { StatusCards } from "./components/StatusCards";
import { CommandSection } from "./components/CommandSection";
import { DeviceStatusPanel } from "./components/DeviceStatusPanel";
import { LocationCard } from "./components/LocationCard";
import { LogTable } from "./components/LogTable";
import { FlowChart } from "./components/FlowChart";
import { RefreshCcw } from "lucide-react";

import {
  fetchNodes,
  fetchDeviceMetrics,
  fetchDeviceGases,
  fetchDeviceLogs,
  connectWebSocket,
  refreshData,
  resetSession,
} from "./services/api";
// `stream/consumers` is a Node-only module and was removed for browser compatibility.
// Removed unused import to fix Vite externalization error.

// Fallback mock data - replace with API calls
const MOCK_NODES = [
  {
    id: "node_01",
    name: "MFC-1",
    status: "online",
    type: "Gas Meter",
    devices: [
      {
        id: "dev_01",
        name: "MFC-BL",
        status: "online",
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
        id: "dev_02",
        name: "MFC-BK",
        status: "online",
        type: "Gas Meter",
      },
      {
        id: "dev_03",
        name: "Test MFC-1",
        status: "online",
        type: "Test MFC",
      },
      {
        id: "dev_04",
        name: "Test MFC-2",
        status: "offline",
        type: "Test MFC",
      },
    ],
  },
];
const MOCK_METRICS = {
  dev_01: {
    signal: -85,
    battery: 87,
    uptime: "14d 3h",
    lastSeen: "2 mins ago",
  },
  dev_02: {
    signal: -65,
    battery: 100,
    uptime: "45d 12h",
    lastSeen: "Just now",
  },
  dev_03: {
    signal: -112,
    battery: 15,
    uptime: "2d 1h",
    lastSeen: "1 hour ago",
  },
  dev_04: {
    signal: -120,
    battery: 0,
    uptime: "0d 0h",
    lastSeen: "3 days ago",
  },
};
const MOCK_LOGS = [
  {
    id: "1",
    timestamp: "2023-10-24 14:32:01",
    type: "info",
    message: "Uplink received",
    payload: "01 4A 2B",
  },
  {
    id: "2",
    timestamp: "2023-10-24 14:15:00",
    type: "success",
    message: "Join request accepted",
  },
  {
    id: "3",
    timestamp: "2023-10-24 13:45:22",
    type: "warning",
    message: "High latency detected",
    payload: "500ms",
  },
  {
    id: "4",
    timestamp: "2023-10-24 12:30:05",
    type: "info",
    message: "Periodic status update",
    payload: "AA BB CC",
  },
  {
    id: "5",
    timestamp: "2023-10-24 10:15:00",
    type: "error",
    message: "Packet loss detected",
  },
];
export function App() {
  const [nodes, setNodes] = useState(MOCK_NODES);
  const [activeNodeId, setActiveNodeId] = useState(MOCK_NODES[0].id);
  const [activeDeviceId, setActiveDeviceId] = useState(
    MOCK_NODES[0].devices[0].id,
  );
  // Store metrics per device: { [deviceId]: { flow, setpoint, gases, ... } }
  const [metrics, setMetrics] = useState({});
  const [chartBuffers, setChartBuffers] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  // Track selected gas per device
  const [selectedGases, setSelectedGases] = useState({});
  // Map of sensors available per end-device. Sensor ids correspond to suffixes used in FlowChart (e.g., 'mfc0', 'mfc1')
  // Sensors per device, now with test MFCs for dev_02
  const DEVICE_SENSORS = {
    dev_01: [
      { id: "mfc1", label: "MFC-BL" },
      { id: "mfc0", label: "MFC-BK" },
    ],
    dev_02: [
      { id: "test_mfc1", label: "Test MFC-1" },
      { id: "test_mfc2", label: "Test MFC-2" },
      { id: "test_mfc3", label: "Test MFC-3" },
    ],
    dev_03: [],
    dev_04: [],
  };
  function useLiveNodeUpdates(nodes, setNodes, socket) {
    useEffect(() => {
      if (!socket) return;
      function handleUplink(uplink) {
        if (!uplink || !uplink.deviceId) return;
        setNodes((prevNodes) => {
          return prevNodes.map((node) => {
            if (!node.devices) return node;
            return {
              ...node,
              devices: node.devices.map((dev) =>
                dev.id === uplink.deviceId ? { ...dev, ...uplink } : dev,
              ),
            };
          });
        });
      }
      socket.on("uplink", handleUplink);
      return () => {
        socket.off("uplink", handleUplink);
      };
    }, [socket, setNodes]);
  }

  const [visibleSensors, setVisibleSensors] = useState(() => {
    // default: show all sensors for each device
    const obj = {};
    Object.keys(DEVICE_SENSORS).forEach((d) => {
      obj[d] = DEVICE_SENSORS[d].map((s) => s.id);
    });
    return obj;
  });

  useEffect(() => {
    const loadNodes = async () => {
      try {
        setLoading(true);
        const data = await fetchNodes();
        setNodes(data);
        // Set default active node/device
        if (data.length > 0) {
          setActiveNodeId(data[0].id);
          if (data[0].devices && data[0].devices.length > 0) {
            setActiveDeviceId(data[0].devices[0].id);
          }
        }
      } catch (err) {
        setError(err.message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadNodes();

    connectWebSocket((uplink) => {
      console.log("Received uplink:", uplink);
      // Update metrics state for the correct device
      if (uplink && uplink.type === "status") {
        // Map mfcId to deviceId: mfc 0 -> dev_02, mfc 1 -> dev_01
        const mfcIdToDeviceId = {
          0: "dev_02", // MFC-BK
          1: "dev_01", // MFC-BL
        };
        const deviceId = mfcIdToDeviceId[uplink.mfcId];

        if (deviceId) {
          setMetrics((prev) => ({
            ...prev,
            [deviceId]: {
              ...(prev[deviceId] || {}),
              flow: Number.isFinite(Number(uplink.flow))
                ? Number(uplink.flow)
                : (prev[deviceId]?.flow ?? 0),
              setpoint: Number.isFinite(Number(uplink.setpoint))
                ? Number(uplink.setpoint)
                : (prev[deviceId]?.setpoint ?? 0),
              // Add other metrics as needed
            },
          }));
        }
      }
      // Add log
      const newLog = {
        id: String(Date.now()),
        timestamp: new Date().toLocaleString(),
        type: uplink.type || "info",
        message: uplink.message || JSON.stringify(uplink),
        payload: uplink.payload,
      };
      setLogs((prev) => [newLog, ...prev.slice(0, -1)]);
    })
      .then((newSocket) => {
        setSocket(newSocket);
      })
      .catch((err) => {
        console.error("Failed to connect to broker:", err);
      });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        setLoading(true);

        const data = await fetchDeviceMetrics(activeDeviceId);

        console.log(`[App] Fetched metrics for ${activeDeviceId}:`, data);

        setMetrics((prev) => ({
          ...prev,
          [activeDeviceId]: { ...data },
        }));
      } catch (err) {
        setError(err.message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (activeDeviceId) {
      loadMetrics();
    }
  }, [activeDeviceId]);

  useEffect(() => {
    const loadLogs = async () => {
      try {
        const data = await fetchDeviceLogs(activeDeviceId);
        setLogs(data || MOCK_LOGS);
      } catch (err) {
        setError(err.message);
        console.error(err);
      }
    };
    if (activeDeviceId) {
      loadLogs();
    }
  }, [activeDeviceId]);

  // Find active node and device
  const activeNode = nodes.find((n) => n.id === activeNodeId) || nodes[0];
  const activeDevice =
    activeNode && activeNode.devices
      ? activeNode.devices.find((d) => d.id === activeDeviceId)
      : null;

  const handleStartSession = async () => {
    setSessionActive(true);
    setLoading(true);
    try {
      // Prepare selections array
      const selections = [];
      nodes.forEach((node) => {
        if (node.devices) {
          node.devices.forEach((dev) => {
            const gas = selectedGases[dev.id];
            if (gas) {
              selections.push({ deviceId: dev.id, gas });
            }
          });
        }
      });
      const api = await import("./services/api");
      await api.sendStartSession(selections);
      console.log("Sent start session for all devices:", selections);
    } catch (err) {
      setError("Failed to start session: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const handleResetSession = async () => {
    setSessionActive(false);
    console.log("Resetting session");

    // try {
    //   setSessionActive(false);
    //   setLoading(true);
    //   const deviceToMfcId = (id) => {
    //     if (id === "dev_01") return 1;
    //     if (id === "dev_02") return 0;
    //     return null;
    //   };
    //   const mfc = deviceToMfcId(activeDeviceId);
    //   await resetSession({ mfc });
    //   setMetrics({ flow: 0, setpoint: 0 });
    //   setChartBuffers({});
    //   setLogs([]);
    // } catch (error) {
    //   console.error("Error setting setpoint:", error);
    // } finally {
    //   setLoading(false);
    // }
  };

  useLiveNodeUpdates(nodes, setNodes, socket);

  return error ? (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <div className="text-red-600">Error: {error}</div>
    </div>
  ) : (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      <DeviceTabs
        nodes={nodes}
        activeNodeId={activeNodeId}
        onSelectNode={setActiveNodeId}
        activeDeviceId={activeDeviceId}
        onSelectDevice={setActiveDeviceId}
      />

      <main className="max-w-8xl mx-auto px-8 py-8">
        {/* Top Grid: Status & Location */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="grid grid-cols-2 space-x-8">
              <h2 className="text-xl font-bold text-slate-900">
                Device Overview
              </h2>
              <button
                onClick={refreshData}
                //disabled={loading || !sessionActive}
                className={`
                  inline-flex items-center px-4 py-2 
                  bg-blue-500 text-white text-sm font-medium rounded-full
                  transition-colors shadow-sm
                  hover:bg-blue-600 hover:shadow

                  disabled:bg-orange-300
                  disabled:hover:bg-orange-300
                  disabled:hover:shadow-none
                  disabled:cursor-not-allowed

                
                `}
              >
                <RefreshCcw className="w-5 h-5 mr-2" />
                {loading ? "Sending..." : "Refresh Data"}
              </button>
            </div>

            <div className="space-x-8">
              <button
                onClick={handleStartSession}
                disabled={loading || sessionActive}
                className="
                px-3 py-1.5 border text-sm font-medium rounded-md shadow-sm transition-colors
                bg-green-500 text-white border-green-500
                hover:bg-green-600
                hover:border-green-600

                disabled:bg-white
                disabled:text-green-200
                disabled:border-green-200
                disabled:hover:bg-white
                disabled:cursor-not-allowed
                "
              >
                {loading ? "Sending..." : "Start Session"}
              </button>

              <button
                onClick={handleResetSession}
                disabled={loading || !sessionActive}
                className="
                px-3 py-1.5 border text-sm font-medium rounded-md shadow-sm transition-colors
                bg-orange-500 text-white border-orange-500
                hover:bg-orange-600
                hover:border-orange-600

                disabled:bg-white
                disabled:text-orange-200
                disabled:border-orange-200
                disabled:hover:bg-white
                disabled:cursor-not-allowed
                "
              >
                {loading ? "Sending..." : "Reset Session"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8">
            {activeNode &&
              activeNode.type !== "Wind Sensor" &&
              activeNode.devices &&
              activeNode.devices.map((dev) => (
                <DeviceStatusPanel
                  device={dev}
                  key={dev.id}
                  socket={socket}
                  activeDeviceId={dev.id}
                  sessionActive={sessionActive}
                  onError={setError}
                  metrics={metrics[dev.id] || { flow: 0, setpoint: 0 }}
                  selectedGas={selectedGases[dev.id]}
                  onSelectGas={(gas) =>
                    setSelectedGases((prev) => ({ ...prev, [dev.id]: gas }))
                  }
                  onDataUpdate={(buffer) =>
                    setChartBuffers((prev) => ({
                      ...prev,
                      [activeDeviceId]: buffer,
                    }))
                  }
                  onMetricsUpdate={setMetrics}
                />
              ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Left Column: Commands & Location */}
          <div className="lg:col-span-1 space-y-8">
            <div className="lg:col-span-2">
              <LogTable logs={logs} />
            </div>
            {/* <div className="h-64">
              <LocationCard
                lat={37.7749}
                lng={-122.4194}
                address="Building 4, Server Room B"
              />
            </div> */}
          </div>
          <div className="mb-8 lg:col-span-2">
            <FlowChart
              deviceId={activeDeviceId}
              initialData={chartBuffers[activeDeviceId]}
              sensors={visibleSensors[activeDeviceId] || []}
              onMetricsUpdate={setMetrics}
              onDataUpdate={(buffer) =>
                setChartBuffers((prev) => ({
                  ...prev,
                  [activeDeviceId]: buffer,
                }))
              }
            />
          </div>
        </div>
      </main>
    </div>
  );
}

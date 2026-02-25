import React, { useState, useEffect } from "react";
import { StatusCards } from "./StatusCards";
import { fetchDeviceMetrics } from "../services/api";
import { CommandSection } from "./CommandSection";
import { fetchDeviceGases } from "../services/api";
import DropdownButton from "./DropdownButton";

export function DeviceStatusPanel({
  device,
  socket,
  activeDeviceId,
  sessionActive,
  onError,
  metrics,
  selectedGas,
  onSelectGas,
  onGasOptionsLoaded,
  gasSelectionError,
  onMetricsUpdate,
  onDataUpdate,
}) {
  const [gasOptions, setGasOptions] = useState([]);
  

  useEffect(() => {
    async function fetchGases() {
      const deviceName = device?.name?.slice(4, 6);
      if (!deviceName) {
        setGasOptions([]);
        if (onGasOptionsLoaded) onGasOptionsLoaded([]);
        return;
      }
      try {
        const result = await fetchDeviceGases(deviceName);
        const gases = result?.gases || [];
        const options = gases.map((g) => ({ label: g, value: g }));
        setGasOptions(options);
        if (onGasOptionsLoaded) onGasOptionsLoaded(options);
        console.log(`[App] Fetched gases for ${device?.name}:`, options);
      } catch (err) {
        console.error("Error fetching gases:", err);
        setGasOptions([]);
        if (onGasOptionsLoaded) onGasOptionsLoaded([]);
      }
    }
    fetchGases();
  }, [device?.name, onGasOptionsLoaded]);

   

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-lg p-6 mb-8 flex flex-col gap-6 transition-shadow">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-3 mb-2">
        <div className="flex items-center gap-3">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded font-mono text-base tracking-tight">
            {device?.name || "Unknown"}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-normal">
            {device?.type || "Device"}
          </span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <StatusCards
            metrics={metrics}
            socket={socket}
            activeDeviceId={activeDeviceId}
            sessionActive={sessionActive}
            gasOptions={gasOptions}
            selectedGas={selectedGas}
            onSelectGas={onSelectGas}
            gasSelectionError={gasSelectionError}
            onMetricsUpdate={onMetricsUpdate}
            onDataUpdate={onDataUpdate}
          />
        </div>
        <div className="md:w-80 w-full">
          <div className="bg-gray-50 rounded-xl shadow-inner p-4 border border-gray-200 h-full flex flex-col">
            <CommandSection
              activeDeviceId={activeDeviceId}
              onError={onError}
              sessionActive={sessionActive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

import {
  listDevices,
  pairDevice,
  renameDevice,
  revokeDevice,
  type Device as ApiDevice,
  type DeviceApiResult,
} from "../api/devices";

/** Presence is authenticated by the target; a raw heartbeat is not Online. */
export type Device = ApiDevice & { availability?: "online" | "signed_out" | "offline" };

export interface DevicesFacade {
  listDevices(signal?: AbortSignal): Promise<DeviceApiResult<Device[]>>;
  pairDevice(code: string, signal?: AbortSignal): Promise<DeviceApiResult<unknown>>;
  renameDevice(deviceId: string, deviceName: string, signal?: AbortSignal): Promise<DeviceApiResult<unknown>>;
  revokeDevice(deviceId: string, signal?: AbortSignal): Promise<DeviceApiResult<unknown>>;
}

export const devicesFacade: DevicesFacade = {
  listDevices: (signal) => listDevices({}, signal),
  pairDevice,
  renameDevice,
  revokeDevice,
};

export type {
  DeviceApiResult,
  DeviceGrantKind,
  DevicePlatform,
} from "../api/devices";

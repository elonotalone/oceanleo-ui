import {
  listDevices,
  pairDevice,
  renameDevice,
  revokeDevice,
  type Device,
  type DeviceApiResult,
} from "../api/devices";

export interface DevicesFacade {
  listDevices(): Promise<DeviceApiResult<Device[]>>;
  pairDevice(code: string): Promise<DeviceApiResult<unknown>>;
  renameDevice(deviceId: string, deviceName: string): Promise<DeviceApiResult<unknown>>;
  revokeDevice(deviceId: string): Promise<DeviceApiResult<unknown>>;
}

export const devicesFacade: DevicesFacade = {
  listDevices,
  pairDevice,
  renameDevice,
  revokeDevice,
};

export type {
  Device,
  DeviceApiResult,
  DeviceGrantKind,
  DevicePlatform,
} from "../api/devices";

/** Shared by peer, signalling and UI so an input fault never enters session teardown. */
export function isWebRtcInputFault(code?: string): boolean {
  if (!code || /consent|revok|disabled|signed_out|signout|billing|(?:^|_)lease(?:_|$)/.test(code)) return false;
  return /^(?:input_|host_input_|webrtc_input_|webrtc_data_channel_|media_data_channel_|data_channel_|control_send_failed$)/.test(code);
}

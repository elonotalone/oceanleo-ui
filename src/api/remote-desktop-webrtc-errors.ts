/**
 * Notices the host attaches to a working picture (`media_status.error`) about where the last input
 * landed: Windows refuses input to an administrator window, the screen is locked, or held keys must
 * be released first. The input lane itself is fine, so they are never a reason to reconnect input.
 */
const HOST_INPUT_NOTICES = new Set(["input_target_elevated", "screen_locked", "input_cleanup_required"]);

/** Shared by peer, signalling and UI so an input fault never enters session teardown. */
export function isWebRtcInputFault(code?: string): boolean {
  if (!code || HOST_INPUT_NOTICES.has(code) || /consent|revok|disabled|signed_out|signout|billing|(?:^|_)lease(?:_|$)/.test(code)) return false;
  return /^(?:input_|host_input_|webrtc_input_|webrtc_data_channel_|media_data_channel_|data_channel_|control_send_failed$)/.test(code);
}

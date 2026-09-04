declare module "waveform-playlist" {
  export function init(options?: object, ee?: unknown): unknown;
  const WaveformPlaylist: { init: typeof init };
  export default WaveformPlaylist;
}

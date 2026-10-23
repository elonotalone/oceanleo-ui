/** Use the editor's decoded PCM for every waveform, avoiding a second resample.
 * WaveSurfer normalizes out-of-range supplied peaks in place. Clamp a copy in
 * that case so displaying a loud edit cannot mutate its authoritative samples. */
export function audioWaveformChannels(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, channel) => {
    const samples = buffer.getChannelData(channel);
    return samples.some((sample) => sample > 1 || sample < -1)
      ? Float32Array.from(samples, (sample) => Math.max(-1, Math.min(1, sample)))
      : samples;
  });
}

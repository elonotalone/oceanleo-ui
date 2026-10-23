import { AUDIO_WAVE_PALETTE } from "./audio-project-carrier";

export const AUDIO_THEME_PALETTES = {
  dark: {
    background: AUDIO_WAVE_PALETTE["wave.bg"].value,
    body: AUDIO_WAVE_PALETTE["wave.body"].value,
    progress: AUDIO_WAVE_PALETTE["wave.peak"].value,
    cursor: AUDIO_WAVE_PALETTE["wave.playhead"].value,
    selection: AUDIO_WAVE_PALETTE["wave.selection"].value,
  },
  light: {
    background: "#f8fafc",
    body: "#1d4ed8",
    progress: "#1e3a8a",
    cursor: "#9a3412",
    selection: "#047857",
  },
} as const;

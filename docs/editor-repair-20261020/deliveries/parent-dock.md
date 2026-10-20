# Parent residue — ComputerDock architecture check

`pnpm architecture:check` failed because `src/shell/cloud-computer/ComputerDock.tsx` imported `../../facades/devices` (implementation must not depend on public facades; present since `d8295b1b`). Switched to `../../api/devices` `listDevices` / `Device`. Dock tests 24/24. Architecture check now exit 0.

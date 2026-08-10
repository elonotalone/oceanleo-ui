export const id = "w6-low-contrast-fixture";
export const label = "低对比夹具";
export const placements = [{ site: "finance", app: "forecast" }];
export const size = { width: 900, height: 560 };

export function renderLook({ context: ctx, width, height }) {
  ctx.fillStyle = "#f8f8f8";
  for (let index = 0; index < 30_000; index += 1) {
    const x = (index * 37 + Math.floor(index / 97)) % width;
    const y = (index * 83 + Math.floor(index / 53)) % height;
    ctx.fillRect(x, y, 1, 1);
  }
}


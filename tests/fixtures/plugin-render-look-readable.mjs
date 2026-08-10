export const id = "w6-readable-dashboard-fixture";
export const label = "经营脉搏";
export const placements = [{ site: "finance", app: "forecast" }];
export const size = { width: 900, height: 560 };

export function renderLook({ context: ctx, width, height }) {
  ctx.fillStyle = "#eef4ff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#10213d";
  ctx.fillRect(32, 28, width - 64, 72);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px sans-serif";
  ctx.fillText("REVENUE PULSE", 58, 72);
  ctx.fillStyle = "#9fb5d6";
  ctx.font = "14px sans-serif";
  ctx.fillText("Forecast workspace / Q3", 640, 70);

  const cards = [
    ["Revenue", "$128.4K", "+7.0%"],
    ["Orders", "1,842", "+12.4%"],
    ["Churn", "0.0%", "stable"],
  ];
  for (let index = 0; index < cards.length; index += 1) {
    const x = 32 + index * 282;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, 122, 260, 116);
    ctx.fillStyle = "#61708a";
    ctx.font = "14px sans-serif";
    ctx.fillText(cards[index][0], x + 20, 151);
    ctx.fillStyle = "#142541";
    ctx.font = "700 28px sans-serif";
    ctx.fillText(cards[index][1], x + 20, 191);
    ctx.fillStyle = index === 2 ? "#667085" : "#15803d";
    ctx.font = "13px sans-serif";
    ctx.fillText(cards[index][2], x + 20, 218);
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(32, 260, 552, 268);
  ctx.fillStyle = "#142541";
  ctx.font = "700 17px sans-serif";
  ctx.fillText("Weekly revenue", 56, 294);
  const points = [435, 408, 421, 371, 358, 326, 300, 278];
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((y, index) => {
    const x = 64 + index * 68;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px sans-serif";
  ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"].forEach((week, index) => {
    ctx.fillText(week, 54 + index * 68, 495);
  });

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(606, 260, 262, 268);
  ctx.fillStyle = "#142541";
  ctx.font = "700 17px sans-serif";
  ctx.fillText("Channel mix", 630, 294);
  const mix = [
    ["Direct", 0.78, "#2563eb"],
    ["Partner", 0.55, "#7c3aed"],
    ["Organic", 0.42, "#0f766e"],
  ];
  mix.forEach(([name, value, color], index) => {
    const y = 334 + index * 60;
    ctx.fillStyle = "#64748b";
    ctx.font = "13px sans-serif";
    ctx.fillText(name, 630, y);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(630, y + 12, 202, 12);
    ctx.fillStyle = color;
    ctx.fillRect(630, y + 12, 202 * value, 12);
  });
}


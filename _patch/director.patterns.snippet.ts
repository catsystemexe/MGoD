// --- ADD: patterns line/circle/edge (insert next to grid block) ---
} else if (ptn?.kind === "line") {
  const idx = w.spawned;
  const dirX = (typeof ptn.dirX === "number") ? ptn.dirX : 1;
  const dirY = (typeof ptn.dirY === "number") ? ptn.dirY : 0;
  const spacing = (typeof ptn.spacing === "number") ? ptn.spacing : 12;
  spawn = {
    x: (ptn.originX ?? 0) + dirX * spacing * idx,
    y: (ptn.originY ?? 0) + dirY * spacing * idx,
  };

} else if (ptn?.kind === "circle") {
  const idx = w.spawned;
  const count = Math.max(1, ptn.count ?? 8);
  const startAngle = (typeof ptn.startAngle === "number") ? ptn.startAngle : 0;
  const a = startAngle + (idx % count) * (Math.PI * 2 / count);
  const r = (typeof ptn.radius === "number") ? ptn.radius : 30;
  spawn = {
    x: (ptn.cx ?? 0) + Math.cos(a) * r,
    y: (ptn.cy ?? 0) + Math.sin(a) * r,
  };

} else if (ptn?.kind === "edge") {
  const idx = w.spawned;
  const edge = (typeof ptn.edge === "string") ? ptn.edge : "top";
  const count = Math.max(1, ptn.count ?? 8);
  const t = (count <= 1) ? 0.5 : ((idx % count) / (count - 1));
  const margin = (typeof ptn.margin === "number") ? ptn.margin : 8;
  const span = (typeof ptn.span === "number") ? ptn.span : 160;

  const ox = (ptn.originX ?? 0);
  const oy = (ptn.originY ?? 0);

  const pick = (edge === "random")
    ? (["top","bottom","left","right"][Math.floor(Math.random()*4)])
    : edge;

  if (pick === "top") {
    spawn = { x: ox + margin + t * span, y: oy + margin };
  } else if (pick === "bottom") {
    spawn = { x: ox + margin + t * span, y: oy + margin };
  } else if (pick === "left") {
    spawn = { x: ox + margin, y: oy + margin + t * span };
  } else {
    spawn = { x: ox + margin, y: oy + margin + t * span };
  }

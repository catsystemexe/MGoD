import { Vec2 } from "../utils/math";

export type DrawSkinFn = (ctx: CanvasRenderingContext2D, pos: Vec2, facing: number, cellSize: number) => void;

export const Skins = {
  // Základní trojúhelník
  basic: (ctx: CanvasRenderingContext2D, pos: Vec2, facing: number, cs: number) => {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(facing);
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    const size = 3 * cs;
    ctx.moveTo(size, 0);
    ctx.lineTo(-size / 1.5, size / 1.5);
    ctx.lineTo(-size / 1.5, -size / 1.5);
    ctx.fill();
    ctx.restore();
  },

  // Pokročilá stíhačka
  advancedV1: (ctx: CanvasRenderingContext2D, pos: Vec2, facing: number, cs: number) => {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(facing);

    const scale = cs * 0.8; 

    // Motor (Glow)
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#FF8800"; 
    ctx.fillStyle = "#FF4400";
    ctx.beginPath();
    ctx.moveTo(-2 * scale, 0);
    ctx.lineTo(-5 * scale, 1.5 * scale);
    ctx.lineTo(-6 * scale + Math.random() * scale, 0); 
    ctx.lineTo(-5 * scale, -1.5 * scale);
    ctx.fill();
    ctx.restore();

    // Trup
    ctx.fillStyle = "#0088FF"; 
    ctx.strokeStyle = "#66CCFF"; 
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(4 * scale, 0);
    ctx.lineTo(-2 * scale, 3 * scale);
    ctx.lineTo(-1 * scale, 1 * scale);
    ctx.lineTo(-3 * scale, 1 * scale);
    ctx.lineTo(-3 * scale, -1 * scale);
    ctx.lineTo(-1 * scale, -1 * scale);
    ctx.lineTo(-2 * scale, -3 * scale);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Kokpit
    ctx.fillStyle = "#CCFFFF";
    ctx.beginPath();
    ctx.ellipse(1 * scale, 0, 1 * scale, 0.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },

  // NOVÉ: Vlečná mina (Bomba)
  bomb: (ctx: CanvasRenderingContext2D, pos: Vec2, cs: number) => {
      const sx = pos.x;
      const sy = pos.y;
      const r = cs * 1.5; // Velikost bomby

      ctx.save();
      ctx.translate(sx, sy);

      // 1. Tělo miny (Tmavý kov)
      ctx.fillStyle = "#333333";
      ctx.strokeStyle = "#555555";
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 2. Ostny (hrozba)
      ctx.fillStyle = "#777777";
      for(let i=0; i<4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(r, -r*0.3);
          ctx.lineTo(r + r*0.4, 0);
          ctx.lineTo(r, r*0.3);
          ctx.fill();
      }

      // 3. Jádro (Blikající červená/oranžová)
      const blink = Math.sin(Date.now() * 0.01); // -1 až 1
      const intensity = (blink + 1) / 2; // 0 až 1
      
      // Barva od tmavě červené po jasně oranžovou
      ctx.fillStyle = `rgba(255, ${Math.floor(intensity * 100)}, 0, 1)`;
      ctx.shadowBlur = 5 + intensity * 10;
      ctx.shadowColor = "#FF0000";
      
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
  }
};

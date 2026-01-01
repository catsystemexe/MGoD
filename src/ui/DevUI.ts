import { Config } from "../core/Config";

export interface DevParams {
    godMode: boolean;
    cellSize: number;
    genSpeed: number;
    spawnRate: number;
    timeScale: number;
    crt: boolean;
}

export class DevUI {
    private selectedIndex = 0;
    private items = [
        { id: 'god', label: 'GOD MODE [I]', type: 'bool' },
        { id: 'crt', label: 'CRT EFFECT', type: 'bool' },
        { id: 'size', label: 'CELL SIZE', type: 'num', min: 1.0, max: 5.0, step: 0.2 },
        { id: 'speed', label: 'GEN SPEED', type: 'num', min: 1, max: 60, step: 1 },
        { id: 'spawn', label: 'SPAWN RATE', type: 'num', min: 0.1, max: 5.0, step: 0.1 },
        { id: 'time', label: 'TIME SCALE', type: 'num', min: 0.1, max: 2.0, step: 0.1 },
    ];

    updateInput(input: any, params: DevParams, callbacks: { onSizeChange: () => void, onSpeedChange: () => void, onCrtChange: (val: boolean) => void }) {
        if (input.wasPressed("ArrowUp")) {
            this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        }
        if (input.wasPressed("ArrowDown")) {
            this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        }

        const item = this.items[this.selectedIndex];

        if (input.wasPressed("ArrowRight") || input.wasPressed("ArrowLeft")) {
            const dir = input.wasPressed("ArrowRight") ? 1 : -1;
            
            if (item.id === 'god') {
                params.godMode = !params.godMode;
            } else if (item.id === 'crt') {
                params.crt = !params.crt;
                callbacks.onCrtChange(params.crt);
            } else if (item.id === 'size') {
                params.cellSize = parseFloat((params.cellSize + dir * item.step!).toFixed(1));
                if (params.cellSize < item.min!) params.cellSize = item.min!;
                if (params.cellSize > item.max!) params.cellSize = item.max!;
                Config.CELL_SIZE = params.cellSize;
                callbacks.onSizeChange();
            } else if (item.id === 'speed') {
                params.genSpeed += dir * item.step!;
                if (params.genSpeed < item.min!) params.genSpeed = item.min!;
                if (params.genSpeed > item.max!) params.genSpeed = item.max!;
                Config.CA_HZ = params.genSpeed;
                callbacks.onSpeedChange();
            } else if (item.id === 'spawn') {
                params.spawnRate = parseFloat((params.spawnRate + dir * item.step!).toFixed(1));
                if (params.spawnRate < item.min!) params.spawnRate = item.min!;
                if (params.spawnRate > item.max!) params.spawnRate = item.max!;
                Config.SPAWN_RATE_MULT = params.spawnRate;
            } else if (item.id === 'time') {
                params.timeScale = parseFloat((params.timeScale + dir * item.step!).toFixed(1));
                if (params.timeScale < item.min!) params.timeScale = item.min!;
                if (params.timeScale > item.max!) params.timeScale = item.max!;
                Config.TIME_SCALE = params.timeScale;
            }
        }
    }

    render(ctx: CanvasRenderingContext2D, w: number, h: number, params: DevParams, active: boolean) {
        if (!active) {
            // Minimal indicator if God Mode is on but menu closed
            if (params.godMode) {
                ctx.fillStyle = "#FF00FF";
                ctx.font = "bold 10px monospace";
                ctx.textAlign = "left";
                ctx.fillText("GOD MODE", 10, 80);
            }
            return;
        }

        const menuW = 200;
        const menuH = this.items.length * 20 + 40;
        const x = 10;
        const y = 80;

        // Bg
        ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
        ctx.strokeStyle = "#00FF00";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, menuW, menuH);
        ctx.strokeRect(x, y, menuW, menuH);

        // Header
        ctx.fillStyle = "#00FF00";
        ctx.textAlign = "center";
        ctx.font = "bold 12px monospace";
        ctx.fillText("--- DEV CONSOLE ---", x + menuW/2, y + 20);

        // Items
        ctx.textAlign = "left";
        ctx.font = "10px monospace";
        
        this.items.forEach((item, i) => {
            const py = y + 40 + i * 20;
            const isSelected = i === this.selectedIndex;
            
            // Cursor
            if (isSelected) {
                ctx.fillStyle = "#00FF00";
                ctx.fillText(">", x + 10, py);
                ctx.fillStyle = "#111";
                ctx.fillRect(x + 20, py - 8, menuW - 30, 10);
                ctx.fillStyle = "#00FF00";
            } else {
                ctx.fillStyle = "#008800";
            }

            let valStr = "";
            if (item.id === 'god') valStr = params.godMode ? "ON" : "OFF";
            if (item.id === 'crt') valStr = params.crt ? "ON" : "OFF";
            if (item.id === 'size') valStr = params.cellSize.toFixed(1);
            if (item.id === 'speed') valStr = params.genSpeed.toString() + " Hz";
            if (item.id === 'spawn') valStr = params.spawnRate.toFixed(1) + "x";
            if (item.id === 'time') valStr = params.timeScale.toFixed(1) + "x";

            ctx.fillText(`${item.label}:`, x + 25, py);
            ctx.textAlign = "right";
            ctx.fillText(valStr, x + menuW - 10, py);
            ctx.textAlign = "left";
        });

        // Footer help
        ctx.font = "8px monospace";
        ctx.fillStyle = "#008800";
        ctx.textAlign = "center";
        ctx.fillText("ARROWS to Adjust | B to Close", x + menuW/2, y + menuH - 8);
    }
}

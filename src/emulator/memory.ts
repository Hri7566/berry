import type { Device } from "./device";

export class Memory implements Device {
    private data: Uint8Array;

    constructor(size = 65536) {
        this.data = new Uint8Array(size);
    }

    peek(addr: number): number {
        return this.data[addr & 0xffff] ?? 0;
    }

    poke(addr: number, value: number): void {
        this.data[addr & 0xffff] = value & 0xff;
    }

    load(data: Uint8Array | number[], offset = 0): void {
        for (let i = 0; i < data.length; i++) {
            this.data[(offset + i) & 0xffff] = (data[i] ?? 0) & 0xff;
        }
    }

    dump(start: number, length: number): string {
        const lines: string[] = [];
        for (let row = 0; row < Math.ceil(length / 16); row++) {
            const base = start + row * 16;
            const hex = Array.from({ length: 16 }, (_, i) =>
                (this.data[(base + i) & 0xffff] ?? 0)
                    .toString(16)
                    .padStart(2, "0")
            ).join(" ");
            lines.push(
                `$${base.toString(16).padStart(4, "0").toUpperCase()}: ${hex}`
            );
        }
        return lines.join("\n");
    }
}

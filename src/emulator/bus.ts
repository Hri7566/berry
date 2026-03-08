import type { Device } from "./device";

interface Mapping {
    start: number;
    end: number;
    device: Device;
}

export class Bus implements Device {
    private mappings: Mapping[] = [];

    attach(device: Device, start: number, end: number): this {
        this.mappings.push({ start, end, device });
        return this;
    }

    peek(addr: number): number {
        addr &= 0xffff;
        for (const m of this.mappings) {
            if (addr >= m.start && addr <= m.end) return m.device.peek(addr);
        }
        return 0xff; // open bus
    }

    poke(addr: number, val: number): void {
        addr &= 0xffff;
        val &= 0xff;
        for (const m of this.mappings) {
            if (addr >= m.start && addr <= m.end) {
                m.device.poke(addr, val);
                return;
            }
        }
    }
}

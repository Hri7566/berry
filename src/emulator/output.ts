import type { Device } from "./device";

/** Memory-mapped output port at $F000.
 *  Write a byte to print it as ASCII. Read returns $FF (always ready).
 *  Null bytes ($00) flush the accumulated buffer via onFlush callback.
 */
export class OutputDevice implements Device {
    onFlush?: (s: string) => void;
    private buf = "";

    peek(_addr: number): number {
        return 0xff;
    }

    poke(_addr: number, val: number): void {
        if (val === 0x00) {
            if (this.buf) { this.onFlush?.(this.buf); this.buf = ""; }
            return;
        }
        this.buf += String.fromCharCode(val & 0x7f);
    }

    /** Return accumulated output and clear the buffer. */
    flush(): string {
        const s = this.buf;
        this.buf = "";
        return s;
    }
}

export const OUTPUT_PORT = 0xf000;

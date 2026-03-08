import type { Device } from "./device";

// Processor status flags
const F_C = 0x01; // Carry
const F_Z = 0x02; // Zero
const F_I = 0x04; // Interrupt Disable
const F_D = 0x08; // Decimal Mode
const F_B = 0x10; // Break Command
const F_U = 0x20; // Unused (always 1)
const F_V = 0x40; // Overflow
const F_N = 0x80; // Negative

type Mode =
    | "imp"
    | "acc"
    | "imm"
    | "zp"
    | "zpx"
    | "zpy"
    | "abs"
    | "abx"
    | "aby"
    | "ind"
    | "inx"
    | "iny"
    | "rel";

interface Op {
    fn: string;
    mode: Mode;
    cycles: number;
    pageCycle: boolean;
}

export class CPU {
    A = 0;
    X = 0;
    Y = 0;
    SP = 0xfd;
    PC = 0;
    P = F_U | F_I;

    cycles = 0;
    halted = false;
    /** Set to false if you want BRK to jump through $FFFE (proper IRQ handling) */
    haltOnBRK = true;

    private ops: (Op | undefined)[] = new Array(256);

    constructor(private mem: Device) {
        this.buildOps();
    }

    private buildOps() {
        const op = (
            code: number,
            fn: string,
            mode: Mode,
            cycles: number,
            pageCycle = false
        ) => {
            this.ops[code] = { fn, mode, cycles, pageCycle };
        };

        // ADC
        op(0x69, "ADC", "imm", 2);
        op(0x65, "ADC", "zp", 3);
        op(0x75, "ADC", "zpx", 4);
        op(0x6d, "ADC", "abs", 4);
        op(0x7d, "ADC", "abx", 4, true);
        op(0x79, "ADC", "aby", 4, true);
        op(0x61, "ADC", "inx", 6);
        op(0x71, "ADC", "iny", 5, true);

        // AND
        op(0x29, "AND", "imm", 2);
        op(0x25, "AND", "zp", 3);
        op(0x35, "AND", "zpx", 4);
        op(0x2d, "AND", "abs", 4);
        op(0x3d, "AND", "abx", 4, true);
        op(0x39, "AND", "aby", 4, true);
        op(0x21, "AND", "inx", 6);
        op(0x31, "AND", "iny", 5, true);

        // ASL
        op(0x0a, "ASL", "acc", 2);
        op(0x06, "ASL", "zp", 5);
        op(0x16, "ASL", "zpx", 6);
        op(0x0e, "ASL", "abs", 6);
        op(0x1e, "ASL", "abx", 7);

        // Branches
        op(0x90, "BCC", "rel", 2);
        op(0xb0, "BCS", "rel", 2);
        op(0xf0, "BEQ", "rel", 2);
        op(0x30, "BMI", "rel", 2);
        op(0xd0, "BNE", "rel", 2);
        op(0x10, "BPL", "rel", 2);
        op(0x50, "BVC", "rel", 2);
        op(0x70, "BVS", "rel", 2);

        // BIT
        op(0x24, "BIT", "zp", 3);
        op(0x2c, "BIT", "abs", 4);

        // BRK
        op(0x00, "BRK", "imp", 7);

        // Clear flags
        op(0x18, "CLC", "imp", 2);
        op(0xd8, "CLD", "imp", 2);
        op(0x58, "CLI", "imp", 2);
        op(0xb8, "CLV", "imp", 2);

        // CMP
        op(0xc9, "CMP", "imm", 2);
        op(0xc5, "CMP", "zp", 3);
        op(0xd5, "CMP", "zpx", 4);
        op(0xcd, "CMP", "abs", 4);
        op(0xdd, "CMP", "abx", 4, true);
        op(0xd9, "CMP", "aby", 4, true);
        op(0xc1, "CMP", "inx", 6);
        op(0xd1, "CMP", "iny", 5, true);

        // CPX
        op(0xe0, "CPX", "imm", 2);
        op(0xe4, "CPX", "zp", 3);
        op(0xec, "CPX", "abs", 4);

        // CPY
        op(0xc0, "CPY", "imm", 2);
        op(0xc4, "CPY", "zp", 3);
        op(0xcc, "CPY", "abs", 4);

        // DEC
        op(0xc6, "DEC", "zp", 5);
        op(0xd6, "DEC", "zpx", 6);
        op(0xce, "DEC", "abs", 6);
        op(0xde, "DEC", "abx", 7);

        // DEX, DEY
        op(0xca, "DEX", "imp", 2);
        op(0x88, "DEY", "imp", 2);

        // EOR
        op(0x49, "EOR", "imm", 2);
        op(0x45, "EOR", "zp", 3);
        op(0x55, "EOR", "zpx", 4);
        op(0x4d, "EOR", "abs", 4);
        op(0x5d, "EOR", "abx", 4, true);
        op(0x59, "EOR", "aby", 4, true);
        op(0x41, "EOR", "inx", 6);
        op(0x51, "EOR", "iny", 5, true);

        // INC
        op(0xe6, "INC", "zp", 5);
        op(0xf6, "INC", "zpx", 6);
        op(0xee, "INC", "abs", 6);
        op(0xfe, "INC", "abx", 7);

        // INX, INY
        op(0xe8, "INX", "imp", 2);
        op(0xc8, "INY", "imp", 2);

        // JMP
        op(0x4c, "JMP", "abs", 3);
        op(0x6c, "JMP", "ind", 5);

        // JSR, RTS
        op(0x20, "JSR", "abs", 6);
        op(0x60, "RTS", "imp", 6);

        // LDA
        op(0xa9, "LDA", "imm", 2);
        op(0xa5, "LDA", "zp", 3);
        op(0xb5, "LDA", "zpx", 4);
        op(0xad, "LDA", "abs", 4);
        op(0xbd, "LDA", "abx", 4, true);
        op(0xb9, "LDA", "aby", 4, true);
        op(0xa1, "LDA", "inx", 6);
        op(0xb1, "LDA", "iny", 5, true);

        // LDX
        op(0xa2, "LDX", "imm", 2);
        op(0xa6, "LDX", "zp", 3);
        op(0xb6, "LDX", "zpy", 4);
        op(0xae, "LDX", "abs", 4);
        op(0xbe, "LDX", "aby", 4, true);

        // LDY
        op(0xa0, "LDY", "imm", 2);
        op(0xa4, "LDY", "zp", 3);
        op(0xb4, "LDY", "zpx", 4);
        op(0xac, "LDY", "abs", 4);
        op(0xbc, "LDY", "abx", 4, true);

        // LSR
        op(0x4a, "LSR", "acc", 2);
        op(0x46, "LSR", "zp", 5);
        op(0x56, "LSR", "zpx", 6);
        op(0x4e, "LSR", "abs", 6);
        op(0x5e, "LSR", "abx", 7);

        // NOP
        op(0xea, "NOP", "imp", 2);

        // ORA
        op(0x09, "ORA", "imm", 2);
        op(0x05, "ORA", "zp", 3);
        op(0x15, "ORA", "zpx", 4);
        op(0x0d, "ORA", "abs", 4);
        op(0x1d, "ORA", "abx", 4, true);
        op(0x19, "ORA", "aby", 4, true);
        op(0x01, "ORA", "inx", 6);
        op(0x11, "ORA", "iny", 5, true);

        // Stack
        op(0x48, "PHA", "imp", 3);
        op(0x08, "PHP", "imp", 3);
        op(0x68, "PLA", "imp", 4);
        op(0x28, "PLP", "imp", 4);

        // ROL
        op(0x2a, "ROL", "acc", 2);
        op(0x26, "ROL", "zp", 5);
        op(0x36, "ROL", "zpx", 6);
        op(0x2e, "ROL", "abs", 6);
        op(0x3e, "ROL", "abx", 7);

        // ROR
        op(0x6a, "ROR", "acc", 2);
        op(0x66, "ROR", "zp", 5);
        op(0x76, "ROR", "zpx", 6);
        op(0x6e, "ROR", "abs", 6);
        op(0x7e, "ROR", "abx", 7);

        // RTI
        op(0x40, "RTI", "imp", 6);

        // SBC
        op(0xe9, "SBC", "imm", 2);
        op(0xe5, "SBC", "zp", 3);
        op(0xf5, "SBC", "zpx", 4);
        op(0xed, "SBC", "abs", 4);
        op(0xfd, "SBC", "abx", 4, true);
        op(0xf9, "SBC", "aby", 4, true);
        op(0xe1, "SBC", "inx", 6);
        op(0xf1, "SBC", "iny", 5, true);

        // Set flags
        op(0x38, "SEC", "imp", 2);
        op(0xf8, "SED", "imp", 2);
        op(0x78, "SEI", "imp", 2);

        // STA
        op(0x85, "STA", "zp", 3);
        op(0x95, "STA", "zpx", 4);
        op(0x8d, "STA", "abs", 4);
        op(0x9d, "STA", "abx", 5);
        op(0x99, "STA", "aby", 5);
        op(0x81, "STA", "inx", 6);
        op(0x91, "STA", "iny", 6);

        // STX
        op(0x86, "STX", "zp", 3);
        op(0x96, "STX", "zpy", 4);
        op(0x8e, "STX", "abs", 4);

        // STY
        op(0x84, "STY", "zp", 3);
        op(0x94, "STY", "zpx", 4);
        op(0x8c, "STY", "abs", 4);

        // Transfers
        op(0xaa, "TAX", "imp", 2);
        op(0xa8, "TAY", "imp", 2);
        op(0xba, "TSX", "imp", 2);
        op(0x8a, "TXA", "imp", 2);
        op(0x9a, "TXS", "imp", 2);
        op(0x98, "TYA", "imp", 2);
    }

    // Memory helpers
    private r(addr: number): number {
        return this.mem.peek(addr & 0xffff);
    }
    private w(addr: number, val: number): void {
        this.mem.poke(addr & 0xffff, val & 0xff);
    }
    private r16(addr: number): number {
        return this.r(addr) | (this.r(addr + 1) << 8);
    }

    // Stack
    private push(val: number): void {
        this.w(0x0100 | this.SP, val);
        this.SP = (this.SP - 1) & 0xff;
    }
    private pop(): number {
        this.SP = (this.SP + 1) & 0xff;
        return this.r(0x0100 | this.SP);
    }

    // Flags
    private getFlag(f: number): boolean {
        return (this.P & f) !== 0;
    }
    private setFlag(f: number, v: boolean): void {
        this.P = v ? this.P | f : this.P & ~f;
        this.P |= F_U;
    }
    private updateNZ(val: number): void {
        this.setFlag(F_Z, (val & 0xff) === 0);
        this.setFlag(F_N, (val & 0x80) !== 0);
    }

    // Fetch
    private fetch(): number {
        const v = this.r(this.PC);
        this.PC = (this.PC + 1) & 0xffff;
        return v;
    }
    private fetch16(): number {
        const lo = this.fetch();
        return lo | (this.fetch() << 8);
    }

    private resolveAddr(mode: Mode): [addr: number, pageCross: boolean] {
        switch (mode) {
            case "imp":
            case "acc":
                return [0, false];
            case "imm": {
                const a = this.PC;
                this.PC = (this.PC + 1) & 0xffff;
                return [a, false];
            }
            case "zp":
                return [this.fetch(), false];
            case "zpx":
                return [(this.fetch() + this.X) & 0xff, false];
            case "zpy":
                return [(this.fetch() + this.Y) & 0xff, false];
            case "abs":
                return [this.fetch16(), false];
            case "abx": {
                const base = this.fetch16();
                const addr = (base + this.X) & 0xffff;
                return [addr, (base & 0xff00) !== (addr & 0xff00)];
            }
            case "aby": {
                const base = this.fetch16();
                const addr = (base + this.Y) & 0xffff;
                return [addr, (base & 0xff00) !== (addr & 0xff00)];
            }
            case "ind": {
                const ptr = this.fetch16();
                // 6502 page-wrap bug: high byte wraps within page if low byte is $FF
                const lo = this.r(ptr);
                const hi = this.r((ptr & 0xff00) | ((ptr + 1) & 0xff));
                return [lo | (hi << 8), false];
            }
            case "inx": {
                const zp = (this.fetch() + this.X) & 0xff;
                return [this.r(zp) | (this.r((zp + 1) & 0xff) << 8), false];
            }
            case "iny": {
                const zp = this.fetch();
                const base = this.r(zp) | (this.r((zp + 1) & 0xff) << 8);
                const addr = (base + this.Y) & 0xffff;
                return [addr, (base & 0xff00) !== (addr & 0xff00)];
            }
            case "rel": {
                const off = this.fetch();
                const signed = off >= 0x80 ? off - 256 : off;
                const addr = (this.PC + signed) & 0xffff;
                return [addr, (this.PC & 0xff00) !== (addr & 0xff00)];
            }
        }
    }

    reset(): void {
        this.A = 0;
        this.X = 0;
        this.Y = 0;
        this.SP = 0xfd;
        this.P = F_U | F_I;
        this.cycles = 0;
        this.halted = false;
        this.PC = this.r16(0xfffc);
    }

    step(): number {
        if (this.halted) return 0;
        const pcAtStart = this.PC;
        const opcode = this.fetch();
        const op = this.ops[opcode];

        if (!op) {
            const pc = pcAtStart.toString(16).padStart(4, "0").toUpperCase();
            const oc = opcode.toString(16).padStart(2, "0").toUpperCase();
            console.warn(`Illegal opcode $${oc} at $${pc}`);
            this.halted = true;
            return 0;
        }

        const [addr, pageCross] = this.resolveAddr(op.mode);
        let extra = 0;

        switch (op.fn) {
            case "ADC": {
                const a = this.A,
                    b = this.r(addr),
                    c = this.getFlag(F_C) ? 1 : 0;
                const result = a + b + c;
                this.setFlag(F_C, result > 0xff);
                this.setFlag(F_V, (~(a ^ b) & (a ^ result) & 0x80) !== 0);
                this.A = result & 0xff;
                this.updateNZ(this.A);
                if (pageCross && op.pageCycle) extra = 1;
                break;
            }
            case "AND":
                this.A &= this.r(addr);
                this.updateNZ(this.A);
                if (pageCross && op.pageCycle) extra = 1;
                break;
            case "ASL":
                if (op.mode === "acc") {
                    this.setFlag(F_C, (this.A & 0x80) !== 0);
                    this.A = (this.A << 1) & 0xff;
                    this.updateNZ(this.A);
                } else {
                    const val = this.r(addr);
                    this.setFlag(F_C, (val & 0x80) !== 0);
                    const result = (val << 1) & 0xff;
                    this.w(addr, result);
                    this.updateNZ(result);
                }
                break;
            case "BCC":
                if (!this.getFlag(F_C)) {
                    extra = pageCross ? 2 : 1;
                    this.PC = addr;
                }
                break;
            case "BCS":
                if (this.getFlag(F_C)) {
                    extra = pageCross ? 2 : 1;
                    this.PC = addr;
                }
                break;
            case "BEQ":
                if (this.getFlag(F_Z)) {
                    extra = pageCross ? 2 : 1;
                    this.PC = addr;
                }
                break;
            case "BIT": {
                const val = this.r(addr);
                this.setFlag(F_Z, (this.A & val) === 0);
                this.setFlag(F_N, (val & 0x80) !== 0);
                this.setFlag(F_V, (val & 0x40) !== 0);
                break;
            }
            case "BMI":
                if (this.getFlag(F_N)) {
                    extra = pageCross ? 2 : 1;
                    this.PC = addr;
                }
                break;
            case "BNE":
                if (!this.getFlag(F_Z)) {
                    extra = pageCross ? 2 : 1;
                    this.PC = addr;
                }
                break;
            case "BPL":
                if (!this.getFlag(F_N)) {
                    extra = pageCross ? 2 : 1;
                    this.PC = addr;
                }
                break;
            case "BRK":
                this.PC = (this.PC + 1) & 0xffff; // skip padding byte
                this.push((this.PC >> 8) & 0xff);
                this.push(this.PC & 0xff);
                this.push(this.P | F_B | F_U);
                this.setFlag(F_I, true);
                if (this.haltOnBRK) {
                    this.halted = true;
                } else {
                    this.PC = this.r16(0xfffe);
                }
                break;
            case "BVC":
                if (!this.getFlag(F_V)) {
                    extra = pageCross ? 2 : 1;
                    this.PC = addr;
                }
                break;
            case "BVS":
                if (this.getFlag(F_V)) {
                    extra = pageCross ? 2 : 1;
                    this.PC = addr;
                }
                break;
            case "CLC":
                this.setFlag(F_C, false);
                break;
            case "CLD":
                this.setFlag(F_D, false);
                break;
            case "CLI":
                this.setFlag(F_I, false);
                break;
            case "CLV":
                this.setFlag(F_V, false);
                break;
            case "CMP": {
                const val = this.r(addr);
                this.setFlag(F_C, this.A >= val);
                this.updateNZ((this.A - val) & 0xff);
                if (pageCross && op.pageCycle) extra = 1;
                break;
            }
            case "CPX": {
                const val = this.r(addr);
                this.setFlag(F_C, this.X >= val);
                this.updateNZ((this.X - val) & 0xff);
                break;
            }
            case "CPY": {
                const val = this.r(addr);
                this.setFlag(F_C, this.Y >= val);
                this.updateNZ((this.Y - val) & 0xff);
                break;
            }
            case "DEC": {
                const val = (this.r(addr) - 1) & 0xff;
                this.w(addr, val);
                this.updateNZ(val);
                break;
            }
            case "DEX":
                this.X = (this.X - 1) & 0xff;
                this.updateNZ(this.X);
                break;
            case "DEY":
                this.Y = (this.Y - 1) & 0xff;
                this.updateNZ(this.Y);
                break;
            case "EOR":
                this.A ^= this.r(addr);
                this.updateNZ(this.A);
                if (pageCross && op.pageCycle) extra = 1;
                break;
            case "INC": {
                const val = (this.r(addr) + 1) & 0xff;
                this.w(addr, val);
                this.updateNZ(val);
                break;
            }
            case "INX":
                this.X = (this.X + 1) & 0xff;
                this.updateNZ(this.X);
                break;
            case "INY":
                this.Y = (this.Y + 1) & 0xff;
                this.updateNZ(this.Y);
                break;
            case "JMP":
                this.PC = addr;
                break;
            case "JSR":
                // Push address of last byte of JSR instruction (PC-1) so RTS can return correctly
                this.push(((this.PC - 1) >> 8) & 0xff);
                this.push((this.PC - 1) & 0xff);
                this.PC = addr;
                break;
            case "LDA":
                this.A = this.r(addr);
                this.updateNZ(this.A);
                if (pageCross && op.pageCycle) extra = 1;
                break;
            case "LDX":
                this.X = this.r(addr);
                this.updateNZ(this.X);
                if (pageCross && op.pageCycle) extra = 1;
                break;
            case "LDY":
                this.Y = this.r(addr);
                this.updateNZ(this.Y);
                if (pageCross && op.pageCycle) extra = 1;
                break;
            case "LSR":
                if (op.mode === "acc") {
                    this.setFlag(F_C, (this.A & 0x01) !== 0);
                    this.A = (this.A >> 1) & 0xff;
                    this.updateNZ(this.A);
                } else {
                    const val = this.r(addr);
                    this.setFlag(F_C, (val & 0x01) !== 0);
                    const result = (val >> 1) & 0xff;
                    this.w(addr, result);
                    this.updateNZ(result);
                }
                break;
            case "NOP":
                break;
            case "ORA":
                this.A |= this.r(addr);
                this.updateNZ(this.A);
                if (pageCross && op.pageCycle) extra = 1;
                break;
            case "PHA":
                this.push(this.A);
                break;
            case "PHP":
                this.push(this.P | F_B | F_U);
                break;
            case "PLA":
                this.A = this.pop();
                this.updateNZ(this.A);
                break;
            case "PLP":
                this.P = (this.pop() & ~F_B) | F_U;
                break;
            case "ROL":
                if (op.mode === "acc") {
                    const carry = this.getFlag(F_C) ? 1 : 0;
                    this.setFlag(F_C, (this.A & 0x80) !== 0);
                    this.A = ((this.A << 1) | carry) & 0xff;
                    this.updateNZ(this.A);
                } else {
                    const val = this.r(addr);
                    const carry = this.getFlag(F_C) ? 1 : 0;
                    this.setFlag(F_C, (val & 0x80) !== 0);
                    const result = ((val << 1) | carry) & 0xff;
                    this.w(addr, result);
                    this.updateNZ(result);
                }
                break;
            case "ROR":
                if (op.mode === "acc") {
                    const carry = this.getFlag(F_C) ? 0x80 : 0;
                    this.setFlag(F_C, (this.A & 0x01) !== 0);
                    this.A = ((this.A >> 1) | carry) & 0xff;
                    this.updateNZ(this.A);
                } else {
                    const val = this.r(addr);
                    const carry = this.getFlag(F_C) ? 0x80 : 0;
                    this.setFlag(F_C, (val & 0x01) !== 0);
                    const result = ((val >> 1) | carry) & 0xff;
                    this.w(addr, result);
                    this.updateNZ(result);
                }
                break;
            case "RTI":
                this.P = (this.pop() & ~F_B) | F_U;
                this.PC = this.pop() | (this.pop() << 8);
                break;
            case "RTS":
                this.PC = ((this.pop() | (this.pop() << 8)) + 1) & 0xffff;
                break;
            case "SBC": {
                // SBC A - M - (1 - C)  ≡  ADC A + ~M + C
                const a = this.A,
                    b = this.r(addr) ^ 0xff,
                    c = this.getFlag(F_C) ? 1 : 0;
                const result = a + b + c;
                this.setFlag(F_C, result > 0xff);
                this.setFlag(F_V, (~(a ^ b) & (a ^ result) & 0x80) !== 0);
                this.A = result & 0xff;
                this.updateNZ(this.A);
                if (pageCross && op.pageCycle) extra = 1;
                break;
            }
            case "SEC":
                this.setFlag(F_C, true);
                break;
            case "SED":
                this.setFlag(F_D, true);
                break;
            case "SEI":
                this.setFlag(F_I, true);
                break;
            case "STA":
                this.w(addr, this.A);
                break;
            case "STX":
                this.w(addr, this.X);
                break;
            case "STY":
                this.w(addr, this.Y);
                break;
            case "TAX":
                this.X = this.A;
                this.updateNZ(this.X);
                break;
            case "TAY":
                this.Y = this.A;
                this.updateNZ(this.Y);
                break;
            case "TSX":
                this.X = this.SP;
                this.updateNZ(this.X);
                break;
            case "TXA":
                this.A = this.X;
                this.updateNZ(this.A);
                break;
            case "TXS":
                this.SP = this.X;
                break;
            case "TYA":
                this.A = this.Y;
                this.updateNZ(this.A);
                break;
        }

        const totalCycles = op.cycles + extra;
        this.cycles += totalCycles;
        return totalCycles;
    }

    /** Run until halted or the cycle limit is reached */
    run(maxCycles = Infinity): void {
        while (!this.halted && this.cycles < maxCycles) {
            this.step();
        }
    }

    /** Human-readable register state */
    state(): string {
        const h2 = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
        const h4 = (v: number) => v.toString(16).padStart(4, "0").toUpperCase();
        const flags = [
            this.getFlag(F_N) ? "N" : "n",
            this.getFlag(F_V) ? "V" : "v",
            "-",
            this.getFlag(F_B) ? "B" : "b",
            this.getFlag(F_D) ? "D" : "d",
            this.getFlag(F_I) ? "I" : "i",
            this.getFlag(F_Z) ? "Z" : "z",
            this.getFlag(F_C) ? "C" : "c"
        ].join("");
        return `PC:${h4(this.PC)} A:${h2(this.A)} X:${h2(this.X)} Y:${h2(this.Y)} SP:${h2(this.SP)} P:[${flags}] CYC:${this.cycles}`;
    }
}

import Client from "mpp-client-net";
import { Memory, CPU, Bus, OutputDevice, OUTPUT_PORT } from "./emulator";
import { assemble } from "./assembler";
import { mkdir } from "node:fs/promises";

const PROG_DIR = "./programs";
const ORIGIN = 0x8000;
const MAX_CYCLES = 1_000_000;
const OUTPUT_PREFIX = "[6502] ";

await mkdir(PROG_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Global VM state
// ---------------------------------------------------------------------------

let mem = new Memory();
let outDev = new OutputDevice();
let bus = new Bus().attach(outDev, OUTPUT_PORT, OUTPUT_PORT).attach(mem, 0x0000, 0xffff);
let cpu = new CPU(bus);
let lastBytes: number[] = [];

function loadAndReset(bytes: number[]): void {
    lastBytes = bytes;
    mem = new Memory();
    outDev = new OutputDevice();
    bus = new Bus().attach(outDev, OUTPUT_PORT, OUTPUT_PORT).attach(mem, 0x0000, 0xffff);
    cpu = new CPU(bus);
    mem.load(bytes, ORIGIN);
    mem.poke(0xfffc, ORIGIN & 0xff);
    mem.poke(0xfffd, (ORIGIN >> 8) & 0xff);
    cpu.reset();
}

// ---------------------------------------------------------------------------
// Program persistence
// ---------------------------------------------------------------------------

async function saveProgram(name: string): Promise<string> {
    if (!lastBytes.length) return "Nothing loaded to save.";
    const path = `${PROG_DIR}/${name}.json`;
    await Bun.write(path, JSON.stringify({ origin: ORIGIN, bytes: lastBytes }));
    return `Saved ${lastBytes.length} bytes as "${name}".`;
}

async function loadProgram(name: string): Promise<string> {
    const path = `${PROG_DIR}/${name}.json`;
    const file = Bun.file(path);
    if (!(await file.exists())) return `No program named "${name}".`;
    const { bytes } = (await file.json()) as {
        origin: number;
        bytes: number[];
    };
    loadAndReset(bytes);
    return `Loaded "${name}" (${bytes.length} bytes) — reset. Use !6502 step or !6502 run to execute.`;
}

async function listPrograms(): Promise<string> {
    const glob = new Bun.Glob("*.json");
    const names: string[] = [];
    for await (const f of glob.scan(PROG_DIR))
        names.push(f.replace(/\.json$/, ""));
    return names.length
        ? `Programs: ${names.join(", ")}`
        : "No saved programs.";
}

// ---------------------------------------------------------------------------
// Disassembler (single instruction peek for step output)
// ---------------------------------------------------------------------------

const MNEMONIC: Record<number, [string, string]> = {};
(function buildDisTable() {
    const table: Array<[number, string, string]> = [
        [0x69, "ADC", "imm"],
        [0x65, "ADC", "zp"],
        [0x75, "ADC", "zpx"],
        [0x6d, "ADC", "abs"],
        [0x7d, "ADC", "abx"],
        [0x79, "ADC", "aby"],
        [0x61, "ADC", "inx"],
        [0x71, "ADC", "iny"],
        [0x29, "AND", "imm"],
        [0x25, "AND", "zp"],
        [0x35, "AND", "zpx"],
        [0x2d, "AND", "abs"],
        [0x3d, "AND", "abx"],
        [0x39, "AND", "aby"],
        [0x21, "AND", "inx"],
        [0x31, "AND", "iny"],
        [0x0a, "ASL", "acc"],
        [0x06, "ASL", "zp"],
        [0x16, "ASL", "zpx"],
        [0x0e, "ASL", "abs"],
        [0x1e, "ASL", "abx"],
        [0x90, "BCC", "rel"],
        [0xb0, "BCS", "rel"],
        [0xf0, "BEQ", "rel"],
        [0x30, "BMI", "rel"],
        [0xd0, "BNE", "rel"],
        [0x10, "BPL", "rel"],
        [0x50, "BVC", "rel"],
        [0x70, "BVS", "rel"],
        [0x24, "BIT", "zp"],
        [0x2c, "BIT", "abs"],
        [0x00, "BRK", "imp"],
        [0x18, "CLC", "imp"],
        [0xd8, "CLD", "imp"],
        [0x58, "CLI", "imp"],
        [0xb8, "CLV", "imp"],
        [0xc9, "CMP", "imm"],
        [0xc5, "CMP", "zp"],
        [0xd5, "CMP", "zpx"],
        [0xcd, "CMP", "abs"],
        [0xdd, "CMP", "abx"],
        [0xd9, "CMP", "aby"],
        [0xc1, "CMP", "inx"],
        [0xd1, "CMP", "iny"],
        [0xe0, "CPX", "imm"],
        [0xe4, "CPX", "zp"],
        [0xec, "CPX", "abs"],
        [0xc0, "CPY", "imm"],
        [0xc4, "CPY", "zp"],
        [0xcc, "CPY", "abs"],
        [0xc6, "DEC", "zp"],
        [0xd6, "DEC", "zpx"],
        [0xce, "DEC", "abs"],
        [0xde, "DEC", "abx"],
        [0xca, "DEX", "imp"],
        [0x88, "DEY", "imp"],
        [0x49, "EOR", "imm"],
        [0x45, "EOR", "zp"],
        [0x55, "EOR", "zpx"],
        [0x4d, "EOR", "abs"],
        [0x5d, "EOR", "abx"],
        [0x59, "EOR", "aby"],
        [0x41, "EOR", "inx"],
        [0x51, "EOR", "iny"],
        [0xe6, "INC", "zp"],
        [0xf6, "INC", "zpx"],
        [0xee, "INC", "abs"],
        [0xfe, "INC", "abx"],
        [0xe8, "INX", "imp"],
        [0xc8, "INY", "imp"],
        [0x4c, "JMP", "abs"],
        [0x6c, "JMP", "ind"],
        [0x20, "JSR", "abs"],
        [0xa9, "LDA", "imm"],
        [0xa5, "LDA", "zp"],
        [0xb5, "LDA", "zpx"],
        [0xad, "LDA", "abs"],
        [0xbd, "LDA", "abx"],
        [0xb9, "LDA", "aby"],
        [0xa1, "LDA", "inx"],
        [0xb1, "LDA", "iny"],
        [0xa2, "LDX", "imm"],
        [0xa6, "LDX", "zp"],
        [0xb6, "LDX", "zpy"],
        [0xae, "LDX", "abs"],
        [0xbe, "LDX", "aby"],
        [0xa0, "LDY", "imm"],
        [0xa4, "LDY", "zp"],
        [0xb4, "LDY", "zpx"],
        [0xac, "LDY", "abs"],
        [0xbc, "LDY", "abx"],
        [0x4a, "LSR", "acc"],
        [0x46, "LSR", "zp"],
        [0x56, "LSR", "zpx"],
        [0x4e, "LSR", "abs"],
        [0x5e, "LSR", "abx"],
        [0xea, "NOP", "imp"],
        [0x09, "ORA", "imm"],
        [0x05, "ORA", "zp"],
        [0x15, "ORA", "zpx"],
        [0x0d, "ORA", "abs"],
        [0x1d, "ORA", "abx"],
        [0x19, "ORA", "aby"],
        [0x01, "ORA", "inx"],
        [0x11, "ORA", "iny"],
        [0x48, "PHA", "imp"],
        [0x08, "PHP", "imp"],
        [0x68, "PLA", "imp"],
        [0x28, "PLP", "imp"],
        [0x2a, "ROL", "acc"],
        [0x26, "ROL", "zp"],
        [0x36, "ROL", "zpx"],
        [0x2e, "ROL", "abs"],
        [0x3e, "ROL", "abx"],
        [0x6a, "ROR", "acc"],
        [0x66, "ROR", "zp"],
        [0x76, "ROR", "zpx"],
        [0x6e, "ROR", "abs"],
        [0x7e, "ROR", "abx"],
        [0x40, "RTI", "imp"],
        [0x60, "RTS", "imp"],
        [0xe9, "SBC", "imm"],
        [0xe5, "SBC", "zp"],
        [0xf5, "SBC", "zpx"],
        [0xed, "SBC", "abs"],
        [0xfd, "SBC", "abx"],
        [0xf9, "SBC", "aby"],
        [0xe1, "SBC", "inx"],
        [0xf1, "SBC", "iny"],
        [0x38, "SEC", "imp"],
        [0xf8, "SED", "imp"],
        [0x78, "SEI", "imp"],
        [0x85, "STA", "zp"],
        [0x95, "STA", "zpx"],
        [0x8d, "STA", "abs"],
        [0x9d, "STA", "abx"],
        [0x99, "STA", "aby"],
        [0x81, "STA", "inx"],
        [0x91, "STA", "iny"],
        [0x86, "STX", "zp"],
        [0x96, "STX", "zpy"],
        [0x8e, "STX", "abs"],
        [0x84, "STY", "zp"],
        [0x94, "STY", "zpx"],
        [0x8c, "STY", "abs"],
        [0xaa, "TAX", "imp"],
        [0xa8, "TAY", "imp"],
        [0xba, "TSX", "imp"],
        [0x8a, "TXA", "imp"],
        [0x9a, "TXS", "imp"],
        [0x98, "TYA", "imp"]
    ];
    for (const [op, mn, mode] of table) MNEMONIC[op] = [mn, mode];
})();

function disassemble(pc: number): string {
    const h2 = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
    const h4 = (v: number) => v.toString(16).padStart(4, "0").toUpperCase();
    const op = mem.peek(pc);
    const entry = MNEMONIC[op];
    if (!entry) return `$${h4(pc)}: ???  ($${h2(op)})`;
    const [mn, mode] = entry;
    const b1 = mem.peek(pc + 1);
    const b2 = mem.peek(pc + 2);
    let operandStr = "";
    switch (mode) {
        case "imp":
            break;
        case "acc":
            operandStr = "A";
            break;
        case "imm":
            operandStr = `#$${h2(b1)}`;
            break;
        case "zp":
            operandStr = `$${h2(b1)}`;
            break;
        case "zpx":
            operandStr = `$${h2(b1)},X`;
            break;
        case "zpy":
            operandStr = `$${h2(b1)},Y`;
            break;
        case "abs":
            operandStr = `$${h4(b1 | (b2 << 8))}`;
            break;
        case "abx":
            operandStr = `$${h4(b1 | (b2 << 8))},X`;
            break;
        case "aby":
            operandStr = `$${h4(b1 | (b2 << 8))},Y`;
            break;
        case "ind":
            operandStr = `($${h4(b1 | (b2 << 8))})`;
            break;
        case "inx":
            operandStr = `($${h2(b1)},X)`;
            break;
        case "iny":
            operandStr = `($${h2(b1)}),Y`;
            break;
        case "rel": {
            const off = b1 >= 0x80 ? b1 - 256 : b1;
            operandStr = `$${h4((pc + 2 + off) & 0xffff)}`;
            break;
        }
    }
    return `$${h4(pc)}: ${mn}${operandStr ? " " + operandStr : ""}`;
}

// ---------------------------------------------------------------------------
// Instruction reference table
// ---------------------------------------------------------------------------

const INST_DESC: Record<string, string> = {
    ADC: "Add with Carry — A=A+M+C; flags: N V Z C",
    AND: "Bitwise AND — A=A&M; flags: N Z",
    ASL: "Arithmetic Shift Left — M<<=1; flags: N Z C",
    BCC: "Branch if Carry Clear — branch if C=0",
    BCS: "Branch if Carry Set — branch if C=1",
    BEQ: "Branch if Equal — branch if Z=1",
    BIT: "Bit Test — N=M7, V=M6, Z=(A&M)=0; flags: N V Z",
    BMI: "Branch if Minus — branch if N=1",
    BNE: "Branch if Not Equal — branch if Z=0",
    BPL: "Branch if Plus — branch if N=0",
    BRK: "Break — push PC+2 and P, jump through $FFFE; flags: B I",
    BVC: "Branch if Overflow Clear — branch if V=0",
    BVS: "Branch if Overflow Set — branch if V=1",
    CLC: "Clear Carry — C=0",
    CLD: "Clear Decimal — D=0",
    CLI: "Clear Interrupt Disable — I=0",
    CLV: "Clear Overflow — V=0",
    CMP: "Compare — A-M; flags: N Z C",
    CPX: "Compare X — X-M; flags: N Z C",
    CPY: "Compare Y — Y-M; flags: N Z C",
    DEC: "Decrement Memory — M--; flags: N Z",
    DEX: "Decrement X — X--; flags: N Z",
    DEY: "Decrement Y — Y--; flags: N Z",
    EOR: "Exclusive OR — A=A^M; flags: N Z",
    INC: "Increment Memory — M++; flags: N Z",
    INX: "Increment X — X++; flags: N Z",
    INY: "Increment Y — Y++; flags: N Z",
    JMP: "Jump — PC=addr",
    JSR: "Jump to Subroutine — push PC-1, PC=addr",
    LDA: "Load Accumulator — A=M; flags: N Z",
    LDX: "Load X — X=M; flags: N Z",
    LDY: "Load Y — Y=M; flags: N Z",
    LSR: "Logical Shift Right — M>>=1; flags: N Z C",
    NOP: "No Operation",
    ORA: "Bitwise OR — A=A|M; flags: N Z",
    PHA: "Push Accumulator — push A",
    PHP: "Push Processor Status — push P",
    PLA: "Pull Accumulator — A=pop; flags: N Z",
    PLP: "Pull Processor Status — P=pop; flags: all",
    ROL: "Rotate Left — M=(M<<1)|C; flags: N Z C",
    ROR: "Rotate Right — M=(M>>1)|(C<<7); flags: N Z C",
    RTI: "Return from Interrupt — P=pop, PC=pop",
    RTS: "Return from Subroutine — PC=pop+1",
    SBC: "Subtract with Carry — A=A-M-(1-C); flags: N V Z C",
    SEC: "Set Carry — C=1",
    SED: "Set Decimal — D=1",
    SEI: "Set Interrupt Disable — I=1",
    STA: "Store Accumulator — M=A",
    STX: "Store X — M=X",
    STY: "Store Y — M=Y",
    TAX: "Transfer A to X — X=A; flags: N Z",
    TAY: "Transfer A to Y — Y=A; flags: N Z",
    TSX: "Transfer SP to X — X=SP; flags: N Z",
    TXA: "Transfer X to A — A=X; flags: N Z",
    TXS: "Transfer X to SP — SP=X",
    TYA: "Transfer Y to A — A=Y; flags: N Z"
};

// Cycle counts per opcode (for reference display)
const CYCLES: Record<number, number> = {
    0x69:2,0x65:3,0x75:4,0x6d:4,0x7d:4,0x79:4,0x61:6,0x71:5,
    0x29:2,0x25:3,0x35:4,0x2d:4,0x3d:4,0x39:4,0x21:6,0x31:5,
    0x0a:2,0x06:5,0x16:6,0x0e:6,0x1e:7,
    0x90:2,0xb0:2,0xf0:2,0x30:2,0xd0:2,0x10:2,0x50:2,0x70:2,
    0x24:3,0x2c:4,
    0x00:7,
    0x18:2,0xd8:2,0x58:2,0xb8:2,
    0xc9:2,0xc5:3,0xd5:4,0xcd:4,0xdd:4,0xd9:4,0xc1:6,0xd1:5,
    0xe0:2,0xe4:3,0xec:4,
    0xc0:2,0xc4:3,0xcc:4,
    0xc6:5,0xd6:6,0xce:6,0xde:7,
    0xca:2,0x88:2,
    0x49:2,0x45:3,0x55:4,0x4d:4,0x5d:4,0x59:4,0x41:6,0x51:5,
    0xe6:5,0xf6:6,0xee:6,0xfe:7,
    0xe8:2,0xc8:2,
    0x4c:3,0x6c:5,
    0x20:6,
    0xa9:2,0xa5:3,0xb5:4,0xad:4,0xbd:4,0xb9:4,0xa1:6,0xb1:5,
    0xa2:2,0xa6:3,0xb6:4,0xae:4,0xbe:4,
    0xa0:2,0xa4:3,0xb4:4,0xac:4,0xbc:4,
    0x4a:2,0x46:5,0x56:6,0x4e:6,0x5e:7,
    0xea:2,
    0x09:2,0x05:3,0x15:4,0x0d:4,0x1d:4,0x19:4,0x01:6,0x11:5,
    0x48:3,0x08:3,0x68:4,0x28:4,
    0x2a:2,0x26:5,0x36:6,0x2e:6,0x3e:7,
    0x6a:2,0x66:5,0x76:6,0x6e:6,0x7e:7,
    0x40:6,0x60:6,
    0xe9:2,0xe5:3,0xf5:4,0xed:4,0xfd:4,0xf9:4,0xe1:6,0xf1:5,
    0x38:2,0xf8:2,0x78:2,
    0x85:3,0x95:4,0x8d:4,0x9d:5,0x99:5,0x81:6,0x91:6,
    0x86:3,0x96:4,0x8e:4,
    0x84:3,0x94:4,0x8c:4,
    0xaa:2,0xa8:2,0xba:2,0x8a:2,0x9a:2,0x98:2
};

// ---------------------------------------------------------------------------
// MPP bot
// ---------------------------------------------------------------------------

const cl = new Client("wss://mppclone.com:8443", process.env.MPPNET_TOKEN);
cl.start();
cl.setChannel("cheez");

cl.on("hi", () => {
    console.log("Connected to server");
});

cl.on("a", async (msg) => {
    const text: string = msg.a;
    console.log(`${msg.p._id.substring(0, 6)} ${msg.p.name}: ${text}`);

    if (!text.startsWith("!6502")) return;

    const rest = text.slice(5).trim();
    const spIdx = rest.search(/\s/);
    const sub = (spIdx === -1 ? rest : rest.slice(0, spIdx)).toLowerCase();
    const args = spIdx === -1 ? "" : rest.slice(spIdx + 1).trim();

    const reply = (s: string) => cl.sendChat(s);

    // ,<addr> shorthand: dump memory at hex address
    if (sub.startsWith(",")) {
        const addrStr = sub.slice(1);
        const addr = parseInt(addrStr, 16);
        if (isNaN(addr)) {
            reply("Usage: !6502 ,<hex addr>  e.g. !6502 ,8000");
            return;
        }
        const len = args ? parseInt(args, 10) : 16;
        reply(mem.dump(addr, Math.min(len, 64)));
        return;
    }

    switch (sub) {
        case "asm": {
            if (!args) {
                reply(
                    "Usage: !6502 asm <instructions>  e.g. !6502 asm LDA #$42 ; STA $00 ; BRK"
                );
                return;
            }
            const result = assemble(args);
            if (result.error) {
                reply(`Asm error: ${result.error}`);
                return;
            }
            loadAndReset(result.bytes);
            outDev.onFlush = (s) => reply(OUTPUT_PREFIX + s.slice(0, 200));
            const hex = result.bytes
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(" ");
            reply(
                `Assembled ${result.bytes.length}B at $8000: ${hex.slice(0, 80)}${hex.length > 80 ? "…" : ""}`
            );
            cpu.run(MAX_CYCLES);
            const asmOut = outDev.flush();
            if (asmOut) reply(OUTPUT_PREFIX + asmOut.slice(0, 200));
            reply(
                cpu.halted
                    ? cpu.state()
                    : `Cycle limit (${MAX_CYCLES}) hit — halted. ` + cpu.state()
            );
            break;
        }

        case "run": {
            if (!args) {
                // Run current CPU state (resume from current PC)
                if (cpu.halted) {
                    reply("CPU is halted. Use !6502 reset to restart.");
                    return;
                }
                outDev.onFlush = (s) => reply(OUTPUT_PREFIX + s.slice(0, 200));
                cpu.run(MAX_CYCLES);
                const runOut = outDev.flush();
                if (runOut) reply(OUTPUT_PREFIX + runOut.slice(0, 200));
                reply(
                    cpu.halted ? cpu.state() : `Cycle limit hit. ` + cpu.state()
                );
            } else {
                // Load raw hex bytes
                const hexParts = args.split(/\s+/);
                const bytes: number[] = [];
                for (const h of hexParts) {
                    const v = parseInt(h, 16);
                    if (isNaN(v) || v < 0 || v > 0xff) {
                        reply(`Invalid byte: ${h}`);
                        return;
                    }
                    bytes.push(v);
                }
                loadAndReset(bytes);
                outDev.onFlush = (s) => reply(OUTPUT_PREFIX + s.slice(0, 200));
                cpu.run(MAX_CYCLES);
                const runBytesOut = outDev.flush();
                if (runBytesOut) reply(OUTPUT_PREFIX + runBytesOut.slice(0, 200));
                reply(
                    cpu.halted ? cpu.state() : `Cycle limit hit. ` + cpu.state()
                );
            }
            break;
        }

        case "step": {
            if (cpu.halted) {
                reply("CPU is halted. Use !6502 reset to restart.");
                return;
            }
            const n = args ? parseInt(args, 10) : 1;
            if (isNaN(n) || n < 1) {
                reply("Usage: !6502 step [n]");
                return;
            }
            outDev.onFlush = (s) => reply(OUTPUT_PREFIX + s.slice(0, 200));
            const lines: string[] = [];
            for (let i = 0; i < n; i++) {
                if (cpu.halted) break;
                const dis = disassemble(cpu.PC);
                cpu.step();
                lines.push(dis);
            }
            const stepOut = outDev.flush();
            if (stepOut) reply(OUTPUT_PREFIX + stepOut.slice(0, 200));
            const out = lines.join(" | ");
            reply(`${out.slice(0, 200)}${out.length > 200 ? "…" : ""}`);
            reply(cpu.state());
            break;
        }

        case "regs":
        case "reg":
        case "state": {
            reply(cpu.state());
            break;
        }

        case "reset": {
            cpu.reset();
            reply("CPU reset. " + cpu.state());
            break;
        }

        case "halt": {
            cpu.halted = true;
            reply("CPU halted.");
            break;
        }

        case "mem": {
            if (!args) {
                reply("Usage: !6502 mem <hex addr> [len]");
                return;
            }
            const parts = args.split(/\s+/);
            const addr = parseInt(parts[0]!, 16);
            if (isNaN(addr)) {
                reply("Usage: !6502 mem <hex addr> [len]");
                return;
            }
            const len = parts[1] ? parseInt(parts[1]!, 10) : 16;
            reply(mem.dump(addr, Math.min(len, 64)));
            break;
        }

        case "peek": {
            if (!args) {
                reply("Usage: !6502 peek <hex addr>");
                return;
            }
            const addr = parseInt(args, 16);
            if (isNaN(addr)) {
                reply("Usage: !6502 peek <hex addr>");
                return;
            }
            const h4 = (v: number) =>
                v.toString(16).padStart(4, "0").toUpperCase();
            const h2 = (v: number) =>
                v.toString(16).padStart(2, "0").toUpperCase();
            reply(`$${h4(addr)} = $${h2(mem.peek(addr))} (${mem.peek(addr)})`);
            break;
        }

        case "poke": {
            const parts = args.split(/\s+/);
            if (parts.length < 2) {
                reply("Usage: !6502 poke <hex addr> <hex val> [...]");
                return;
            }
            const addr = parseInt(parts[0]!, 16);
            if (isNaN(addr)) {
                reply("Bad address.");
                return;
            }
            for (let i = 1; i < parts.length; i++) {
                const v = parseInt(parts[i]!, 16);
                if (isNaN(v)) {
                    reply(`Bad value: ${parts[i]}`);
                    return;
                }
                mem.poke(addr + i - 1, v);
            }
            reply(
                `Poked ${parts.length - 1} byte(s) at $${addr.toString(16).padStart(4, "0").toUpperCase()}.`
            );
            break;
        }

        case "print": {
            // Dump from current PC
            reply(mem.dump(cpu.PC, 32));
            break;
        }

        case "op":
        case "ins":
        case "inst": {
            if (!args) {
                reply("Usage: !6502 op <hex byte>  or  !6502 op <mnemonic>");
                break;
            }
            const h2 = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
            // If it looks like a hex byte, look up the specific opcode
            if (/^[0-9a-fA-F]{1,2}$/.test(args)) {
                const byte = parseInt(args, 16);
                const entry = MNEMONIC[byte];
                if (!entry) {
                    reply(`$${h2(byte)}: illegal/unknown opcode`);
                    break;
                }
                const [mn, mode] = entry;
                const cyc = CYCLES[byte] ?? "?";
                const desc = INST_DESC[mn] ?? mn;
                reply(`$${h2(byte)}: ${mn} (${mode}, ${cyc} cycles) — ${desc}`);
            } else {
                // Treat as mnemonic — show all modes
                const mn = args.toUpperCase();
                const desc = INST_DESC[mn];
                if (!desc) {
                    reply(`Unknown mnemonic: ${mn}`);
                    break;
                }
                // Collect all opcodes for this mnemonic
                const modes = Object.entries(MNEMONIC)
                    .filter(([, v]) => v[0] === mn)
                    .map(([op, v]) => `$${h2(Number(op))}=${v[1]}(${CYCLES[Number(op)] ?? "?"}cyc)`)
                    .join(" ");
                reply(`${mn}: ${desc}`);
                reply(modes);
            }
            break;
        }

        case "dis":
        case "disasm": {
            const startAddr = args ? parseInt(args, 16) : cpu.PC;
            if (isNaN(startAddr)) {
                reply("Usage: !6502 dis [hex addr]");
                return;
            }
            const lines: string[] = [];
            let pc = startAddr;
            for (let i = 0; i < 8; i++) {
                lines.push(disassemble(pc));
                const op = mem.peek(pc);
                const entry = MNEMONIC[op];
                if (!entry) {
                    pc++;
                    continue;
                }
                const modeSize: Record<string, number> = {
                    imp: 1,
                    acc: 1,
                    imm: 2,
                    zp: 2,
                    zpx: 2,
                    zpy: 2,
                    inx: 2,
                    iny: 2,
                    rel: 2,
                    abs: 3,
                    abx: 3,
                    aby: 3,
                    ind: 3
                };
                pc += modeSize[entry[1]] ?? 1;
            }
            reply(lines.join(" | ").slice(0, 400));
            break;
        }

        case "save": {
            if (!args) {
                reply("Usage: !6502 save <name>");
                return;
            }
            reply(await saveProgram(args));
            break;
        }

        case "load": {
            if (!args) {
                reply("Usage: !6502 load <name>");
                return;
            }
            reply(await loadProgram(args));
            break;
        }

        case "ls":
        case "list": {
            reply(await listPrograms());
            break;
        }

        case "help":
        case "": {
            reply(
                "!6502 commands: " +
                    "asm <code> | run [hex bytes] | step [n] | regs | reset | halt | " +
                    "mem <addr> [len] | peek <addr> | poke <addr> <val> [..] | " +
                    "dis [addr] | print | ,<addr> [len] | op <byte|mnemonic> | " +
                    "save <name> | load <name> | ls"
            );
            break;
        }

        default:
            reply(`Unknown subcommand: ${sub}. Try !6502 help`);
    }
});

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

const ISA: Record<string, Partial<Record<Mode, number>>> = {
    ADC: {
        imm: 0x69,
        zp: 0x65,
        zpx: 0x75,
        abs: 0x6d,
        abx: 0x7d,
        aby: 0x79,
        inx: 0x61,
        iny: 0x71
    },
    AND: {
        imm: 0x29,
        zp: 0x25,
        zpx: 0x35,
        abs: 0x2d,
        abx: 0x3d,
        aby: 0x39,
        inx: 0x21,
        iny: 0x31
    },
    ASL: { acc: 0x0a, zp: 0x06, zpx: 0x16, abs: 0x0e, abx: 0x1e },
    BCC: { rel: 0x90 },
    BCS: { rel: 0xb0 },
    BEQ: { rel: 0xf0 },
    BMI: { rel: 0x30 },
    BNE: { rel: 0xd0 },
    BPL: { rel: 0x10 },
    BVC: { rel: 0x50 },
    BVS: { rel: 0x70 },
    BIT: { zp: 0x24, abs: 0x2c },
    BRK: { imp: 0x00 },
    CLC: { imp: 0x18 },
    CLD: { imp: 0xd8 },
    CLI: { imp: 0x58 },
    CLV: { imp: 0xb8 },
    CMP: {
        imm: 0xc9,
        zp: 0xc5,
        zpx: 0xd5,
        abs: 0xcd,
        abx: 0xdd,
        aby: 0xd9,
        inx: 0xc1,
        iny: 0xd1
    },
    CPX: { imm: 0xe0, zp: 0xe4, abs: 0xec },
    CPY: { imm: 0xc0, zp: 0xc4, abs: 0xcc },
    DEC: { zp: 0xc6, zpx: 0xd6, abs: 0xce, abx: 0xde },
    DEX: { imp: 0xca },
    DEY: { imp: 0x88 },
    EOR: {
        imm: 0x49,
        zp: 0x45,
        zpx: 0x55,
        abs: 0x4d,
        abx: 0x5d,
        aby: 0x59,
        inx: 0x41,
        iny: 0x51
    },
    INC: { zp: 0xe6, zpx: 0xf6, abs: 0xee, abx: 0xfe },
    INX: { imp: 0xe8 },
    INY: { imp: 0xc8 },
    JMP: { abs: 0x4c, ind: 0x6c },
    JSR: { abs: 0x20 },
    LDA: {
        imm: 0xa9,
        zp: 0xa5,
        zpx: 0xb5,
        abs: 0xad,
        abx: 0xbd,
        aby: 0xb9,
        inx: 0xa1,
        iny: 0xb1
    },
    LDX: { imm: 0xa2, zp: 0xa6, zpy: 0xb6, abs: 0xae, aby: 0xbe },
    LDY: { imm: 0xa0, zp: 0xa4, zpx: 0xb4, abs: 0xac, abx: 0xbc },
    LSR: { acc: 0x4a, zp: 0x46, zpx: 0x56, abs: 0x4e, abx: 0x5e },
    NOP: { imp: 0xea },
    ORA: {
        imm: 0x09,
        zp: 0x05,
        zpx: 0x15,
        abs: 0x0d,
        abx: 0x1d,
        aby: 0x19,
        inx: 0x01,
        iny: 0x11
    },
    PHA: { imp: 0x48 },
    PHP: { imp: 0x08 },
    PLA: { imp: 0x68 },
    PLP: { imp: 0x28 },
    ROL: { acc: 0x2a, zp: 0x26, zpx: 0x36, abs: 0x2e, abx: 0x3e },
    ROR: { acc: 0x6a, zp: 0x66, zpx: 0x76, abs: 0x6e, abx: 0x7e },
    RTI: { imp: 0x40 },
    RTS: { imp: 0x60 },
    SBC: {
        imm: 0xe9,
        zp: 0xe5,
        zpx: 0xf5,
        abs: 0xed,
        abx: 0xfd,
        aby: 0xf9,
        inx: 0xe1,
        iny: 0xf1
    },
    SEC: { imp: 0x38 },
    SED: { imp: 0xf8 },
    SEI: { imp: 0x78 },
    STA: {
        zp: 0x85,
        zpx: 0x95,
        abs: 0x8d,
        abx: 0x9d,
        aby: 0x99,
        inx: 0x81,
        iny: 0x91
    },
    STX: { zp: 0x86, zpy: 0x96, abs: 0x8e },
    STY: { zp: 0x84, zpx: 0x94, abs: 0x8c },
    TAX: { imp: 0xaa },
    TAY: { imp: 0xa8 },
    TSX: { imp: 0xba },
    TXA: { imp: 0x8a },
    TXS: { imp: 0x9a },
    TYA: { imp: 0x98 }
};

const BRANCHES = new Set([
    "BCC",
    "BCS",
    "BEQ",
    "BMI",
    "BNE",
    "BPL",
    "BVC",
    "BVS"
]);

function modeSize(mode: Mode): number {
    if (mode === "imp" || mode === "acc") return 1;
    if (mode === "abs" || mode === "abx" || mode === "aby" || mode === "ind")
        return 3;
    return 2; // imm, zp, zpx, zpy, inx, iny, rel
}

function parseNum(s: string): number {
    s = s.trim();
    if (s.startsWith("$")) return parseInt(s.slice(1), 16);
    if (s.startsWith("0x") || s.startsWith("0X"))
        return parseInt(s.slice(2), 16);
    if (s.startsWith("%")) return parseInt(s.slice(1), 2);
    return parseInt(s, 10);
}

type Operand =
    | { kind: "imp" }
    | { kind: "acc" }
    | { kind: "imm"; value: number }
    | { kind: "zp"; value: number }
    | { kind: "zpx"; value: number }
    | { kind: "zpy"; value: number }
    | { kind: "abs"; value: number }
    | { kind: "abx"; value: number }
    | { kind: "aby"; value: number }
    | { kind: "ind"; value: number }
    | { kind: "inx"; value: number }
    | { kind: "iny"; value: number }
    | { kind: "num"; value: number } // bare decimal/hex number, context-determines mode
    | { kind: "label"; name: string }
    | { kind: "labx"; name: string } // label,X
    | { kind: "laby"; name: string } // label,Y
    | { kind: "lind"; name: string } // (label) indirect
    | { kind: "linx"; name: string } // (label,X) indexed indirect
    | { kind: "liny"; name: string }; // (label),Y indirect indexed

function parseOperand(op: string): Operand | null {
    op = op.trim();
    if (!op) return { kind: "imp" };
    if (op.toUpperCase() === "A") return { kind: "acc" };

    let m: RegExpMatchArray | null;

    if ((m = op.match(/^#(.+)$/)))
        return { kind: "imm", value: parseNum(m[1]!) & 0xff };

    if ((m = op.match(/^\(\s*\$([0-9a-fA-F]{1,2})\s*,\s*[Xx]\s*\)$/)))
        return { kind: "inx", value: parseInt(m[1]!, 16) };

    if ((m = op.match(/^\(\s*\$([0-9a-fA-F]{1,2})\s*\)\s*,\s*[Yy]$/)))
        return { kind: "iny", value: parseInt(m[1]!, 16) };

    if ((m = op.match(/^\(\s*\$([0-9a-fA-F]{1,4})\s*\)$/)))
        return { kind: "ind", value: parseInt(m[1]!, 16) };

    // $xx,X → zpx; $xxx+,X → abx
    if ((m = op.match(/^\$([0-9a-fA-F]+)\s*,\s*[Xx]$/))) {
        const g = m[1]!;
        const v = parseInt(g, 16);
        return g.length <= 2
            ? { kind: "zpx", value: v }
            : { kind: "abx", value: v };
    }

    // $xx,Y → zpy; $xxx+,Y → aby
    if ((m = op.match(/^\$([0-9a-fA-F]+)\s*,\s*[Yy]$/))) {
        const g = m[1]!;
        const v = parseInt(g, 16);
        return g.length <= 2
            ? { kind: "zpy", value: v }
            : { kind: "aby", value: v };
    }

    // $xx → zp; $xxx+ → abs
    if ((m = op.match(/^\$([0-9a-fA-F]+)$/))) {
        const g = m[1]!;
        const v = parseInt(g, 16);
        return g.length <= 2
            ? { kind: "zp", value: v }
            : { kind: "abs", value: v };
    }

    // Bare decimal
    if ((m = op.match(/^(-?\d+)$/)))
        return { kind: "num", value: parseInt(m[1]!, 10) };

    // (label,X) — indexed indirect
    if ((m = op.match(/^\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*[Xx]\s*\)$/)))
        return { kind: "linx", name: m[1]! };

    // (label),Y — indirect indexed
    if ((m = op.match(/^\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*,\s*[Yy]$/)))
        return { kind: "liny", name: m[1]! };

    // (label) — indirect
    if ((m = op.match(/^\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/)))
        return { kind: "lind", name: m[1]! };

    // label,X
    if ((m = op.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*,\s*[Xx]$/)))
        return { kind: "labx", name: m[1]! };

    // label,Y
    if ((m = op.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*,\s*[Yy]$/)))
        return { kind: "laby", name: m[1]! };

    // Label identifier
    if ((m = op.match(/^([A-Za-z_][A-Za-z0-9_]*)$/)))
        return { kind: "label", name: m[1]! };

    return null;
}

interface AsmLine {
    label?: string;
    mnemonic?: string;
    rawOperand?: string;
    address: number;
    size: number;
}

export function assemble(
    src: string,
    origin = 0x8000
): { bytes: number[]; error?: string } {
    // Tokenize: split on ; or \n, strip comments
    const rawLines = src
        .split(/[;\n]/)
        .map((l) => l.replace(/\/\/.*$/, "").trim())
        .filter(Boolean);

    // Parse into structured lines
    const parsed: Array<{
        label?: string;
        mnemonic?: string;
        rawOperand?: string;
    }> = [];
    for (const line of rawLines) {
        const entry: {
            label?: string;
            mnemonic?: string;
            rawOperand?: string;
        } = {};
        let rest = line;

        const labelMatch = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:(.*)/);
        if (labelMatch) {
            entry.label = labelMatch[1]!;
            rest = labelMatch[2]!.trim();
        }

        if (rest) {
            const spIdx = rest.search(/\s/);
            if (spIdx === -1) {
                entry.mnemonic = rest.toUpperCase();
                entry.rawOperand = "";
            } else {
                entry.mnemonic = rest.slice(0, spIdx).toUpperCase();
                entry.rawOperand = rest.slice(spIdx + 1).trim();
            }
        }

        parsed.push(entry);
    }

    // Pass 1: assign addresses and build label map
    const labels = new Map<string, number>();
    let pc = origin;
    const lines: AsmLine[] = [];

    for (const p of parsed) {
        const line: AsmLine = { address: pc, size: 0, ...p };

        if (p.label) labels.set(p.label, pc);

        if (p.mnemonic) {
            if (!(p.mnemonic in ISA))
                return { bytes: [], error: `Unknown mnemonic: ${p.mnemonic}` };

            const modes = ISA[p.mnemonic]!;
            let size: number;

            if (BRANCHES.has(p.mnemonic)) {
                size = 2;
            } else if (Object.keys(modes).length === 1 && "imp" in modes) {
                size = 1;
            } else {
                const op = p.rawOperand
                    ? parseOperand(p.rawOperand)
                    : { kind: "imp" as const };
                if (!op)
                    return { bytes: [], error: `Bad operand: ${p.rawOperand}` };

                if (op.kind === "label" || op.kind === "num" || op.kind === "lind") {
                    // Guess: 3 bytes (abs/ind) for non-branches
                    size = 3;
                } else if (op.kind === "labx") {
                    size = "abx" in modes ? 3 : 2; // zpx fallback
                } else if (op.kind === "laby") {
                    size = "aby" in modes ? 3 : 2; // zpy fallback
                } else if (op.kind === "linx" || op.kind === "liny") {
                    size = 2;
                } else if (op.kind === "imp" && "imp" in modes) {
                    size = 1;
                } else if (op.kind === "acc" && "acc" in modes) {
                    size = 1;
                } else {
                    size = modeSize(op.kind as Mode);
                    // If instruction doesn't support this mode, try fallback
                    if (!(op.kind in modes)) {
                        const fallbacks: Partial<Record<string, Mode>> = {
                            zpx: "abx",
                            zpy: "aby",
                            zp: "abs",
                            abx: "zpx",
                            aby: "zpy",
                            abs: "zp"
                        };
                        const fb = fallbacks[op.kind];
                        if (fb && fb in modes) size = modeSize(fb);
                    }
                }
            }

            line.size = size;
            pc += size;
        }

        lines.push(line);
    }

    // Pass 2: emit bytes
    const bytes: number[] = new Array(pc - origin).fill(0);

    for (const line of lines) {
        if (!line.mnemonic || line.size === 0) continue;

        const modes = ISA[line.mnemonic]!;
        const offset = line.address - origin;

        // Resolve operand
        const rawOp = line.rawOperand ?? "";
        const op = rawOp ? parseOperand(rawOp) : { kind: "imp" as const };
        if (!op) return { bytes: [], error: `Bad operand: ${rawOp}` };

        // Handle branches
        if (BRANCHES.has(line.mnemonic)) {
            let targetAddr: number;
            if (op.kind === "label") {
                const t = labels.get(op.name);
                if (t === undefined)
                    return { bytes: [], error: `Undefined label: ${op.name}` };
                targetAddr = t;
            } else if (op.kind === "abs" || op.kind === "zp") {
                targetAddr = op.value;
            } else if (op.kind === "num") {
                // Signed offset relative to instruction end
                const off = op.value;
                if (off >= -128 && off <= 127) {
                    targetAddr = (line.address + 2 + off) & 0xffff;
                } else {
                    targetAddr = op.value & 0xffff; // treat as absolute
                }
            } else {
                return { bytes: [], error: `Bad branch operand: ${rawOp}` };
            }
            const relOff = targetAddr - (line.address + 2);
            if (relOff < -128 || relOff > 127)
                return {
                    bytes: [],
                    error: `Branch out of range at $${line.address.toString(16).toUpperCase()}`
                };
            bytes[offset] = modes["rel"]!;
            bytes[offset + 1] = relOff & 0xff;
            continue;
        }

        // Resolve mode and value for non-branches
        let finalMode: Mode;
        let finalValue = 0;

        if (op.kind === "imp") {
            if ("imp" in modes) finalMode = "imp";
            else if ("acc" in modes) finalMode = "acc";
            else
                return {
                    bytes: [],
                    error: `${line.mnemonic} requires an operand`
                };
        } else if (op.kind === "acc") {
            if ("acc" in modes) finalMode = "acc";
            else finalMode = "imp"; // fallback
        } else if (op.kind === "label") {
            const t = labels.get(op.name);
            if (t === undefined)
                return { bytes: [], error: `Undefined label: ${op.name}` };
            if ("abs" in modes) {
                finalMode = "abs";
                finalValue = t;
            } else if ("zp" in modes && t <= 0xff) {
                finalMode = "zp";
                finalValue = t;
            } else
                return {
                    bytes: [],
                    error: `${line.mnemonic}: can't use label as operand`
                };
        } else if (op.kind === "labx") {
            const t = labels.get(op.name);
            if (t === undefined)
                return { bytes: [], error: `Undefined label: ${op.name}` };
            if ("abx" in modes) { finalMode = "abx"; finalValue = t; }
            else if ("zpx" in modes) { finalMode = "zpx"; finalValue = t; }
            else return { bytes: [], error: `${line.mnemonic}: no X-indexed mode` };
        } else if (op.kind === "laby") {
            const t = labels.get(op.name);
            if (t === undefined)
                return { bytes: [], error: `Undefined label: ${op.name}` };
            if ("aby" in modes) { finalMode = "aby"; finalValue = t; }
            else if ("zpy" in modes) { finalMode = "zpy"; finalValue = t; }
            else return { bytes: [], error: `${line.mnemonic}: no Y-indexed mode` };
        } else if (op.kind === "lind") {
            const t = labels.get(op.name);
            if (t === undefined)
                return { bytes: [], error: `Undefined label: ${op.name}` };
            if (!("ind" in modes))
                return { bytes: [], error: `${line.mnemonic}: no indirect mode` };
            finalMode = "ind"; finalValue = t;
        } else if (op.kind === "linx") {
            const t = labels.get(op.name);
            if (t === undefined)
                return { bytes: [], error: `Undefined label: ${op.name}` };
            if (t > 0xff)
                return { bytes: [], error: `Label ${op.name} must be zero-page for (label,X)` };
            if (!("inx" in modes))
                return { bytes: [], error: `${line.mnemonic}: no (zp,X) mode` };
            finalMode = "inx"; finalValue = t;
        } else if (op.kind === "liny") {
            const t = labels.get(op.name);
            if (t === undefined)
                return { bytes: [], error: `Undefined label: ${op.name}` };
            if (t > 0xff)
                return { bytes: [], error: `Label ${op.name} must be zero-page for (label),Y` };
            if (!("iny" in modes))
                return { bytes: [], error: `${line.mnemonic}: no (zp),Y mode` };
            finalMode = "iny"; finalValue = t;
        } else if (op.kind === "num") {
            const v = op.value;
            if (v >= 0 && v <= 0xff && "zp" in modes) {
                finalMode = "zp";
                finalValue = v;
            } else if ("abs" in modes) {
                finalMode = "abs";
                finalValue = v & 0xffff;
            } else if ("imm" in modes) {
                finalMode = "imm";
                finalValue = v & 0xff;
            } else
                return {
                    bytes: [],
                    error: `${line.mnemonic}: can't use numeric ${v} as operand`
                };
        } else {
            finalMode = op.kind as Mode;
            finalValue = (op as any).value ?? 0;

            // Fallback if mode not supported
            if (!(finalMode in modes)) {
                const fallbacks: Partial<Record<Mode, Mode>> = {
                    zpx: "abx",
                    zpy: "aby",
                    zp: "abs",
                    abx: "zpx",
                    aby: "zpy",
                    abs: "zp"
                };
                const fb = fallbacks[finalMode];
                if (fb && fb in modes) finalMode = fb;
                else
                    return {
                        bytes: [],
                        error: `${line.mnemonic}: unsupported addressing mode ${finalMode}`
                    };
            }
        }

        const opcode = modes[finalMode];
        if (opcode === undefined)
            return {
                bytes: [],
                error: `${line.mnemonic}: no opcode for mode ${finalMode}`
            };

        bytes[offset] = opcode;
        const sz = modeSize(finalMode);
        if (sz >= 2) bytes[offset + 1] = finalValue & 0xff;
        if (sz >= 3) bytes[offset + 2] = (finalValue >> 8) & 0xff;
    }

    return { bytes };
}

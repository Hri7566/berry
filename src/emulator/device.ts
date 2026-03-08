export interface Device {
    peek(addr: number): number;
    poke(addr: number, val: number): void;
}

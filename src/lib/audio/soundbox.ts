import {getAudioContext} from "./context";

// Oscillators

function osc_sin(value: number): number {
    return Math.sin(value * 6.283184);
}

function osc_saw(value: number): number {
    return 2 * (value % 1) - 1;
}

function osc_square(value: number): number {
    return (value % 1) < 0.5 ? 1 : -1;
}

function osc_tri(value: number): number {
    const v2 = (value % 1) * 4;
    if (v2 < 2) return v2 - 1;
    return 3 - v2;
}

function pow2(y: number): number {
    return Math.pow(2, y);
}

function getNoteFreq(n: number): number {
    // 174.61.. / 44100 = 0.003959503758 (F3)
    return 0.003959503758 * pow2((n - 128) / 12);
}

function createNote(instr: any, n: number, rowLen: number) {
    const osc1 = oscillators[instr.i[0]];
    const o1vol = instr.i[1];
    const o1xenv = instr.i[3] / 32;
    const osc2 = oscillators[instr.i[4]];
    const o2vol = instr.i[5];
    const o2xenv = instr.i[8] / 32;
    const noiseVol = instr.i[9];
    const attack = instr.i[10] * instr.i[10] * 4;
    const sustain = instr.i[11] * instr.i[11] * 4;
    const release = instr.i[12] * instr.i[12] * 4;
    const releaseInv = 1 / release;
    const expDecay = -instr.i[13] / 16;
    let arp = instr.i[14];
    const arpInterval = rowLen * pow2(2 - instr.i[15]);

    const noteBuf = new Int32Array(attack + sustain + release);

    // Re-trig oscillators
    let c1 = 0;
    let c2 = 0;

    let o1t = 0.0;
    let o2t = 0.0;

    // Generate one note (attack + sustain + release)
    for (let j = 0, j2 = 0; j < attack + sustain + release; ++j, ++j2) {
        if (j2 >= 0) {
            // Switch arpeggio note.
            arp = (arp >> 8) | ((arp & 255) << 4);
            j2 -= arpInterval;

            // Calculate note frequencies for the oscillators
            o1t = getNoteFreq(n + (arp & 15) + instr.i[2] - 128);
            o2t = getNoteFreq(n + (arp & 15) + instr.i[6] - 128) * (1 + 0.0008 * instr.i[7]);
        }

        // Envelope
        let e = 1;
        if (j < attack) {
            e = j / attack;
        } else if (j >= attack + sustain) {
            e = (j - attack - sustain) * releaseInv;
            e = (1 - e) * Math.pow(3, expDecay * e);
        }

        // Oscillator 1
        c1 += o1t * Math.pow(e, o1xenv);
        let sample = osc1(c1) * o1vol;

        // Oscillator 2
        c2 += o2t * Math.pow(e, o2xenv);
        sample += osc2(c2) * o2vol;

        // Noise oscillator
        if (noiseVol) {
            sample += (2 * Math.random() - 1) * noiseVol;
        }

        // Add to (mono) channel buffer
        noteBuf[j] = (80 * sample * e) | 0;
    }

    return noteBuf;
}

// Array of oscillator functions
const oscillators = [
    osc_sin,
    osc_square,
    osc_saw,
    osc_tri
];

// Generate audio data for a single track
function generate(song: SongData, mix: Int32Array, track: number): void {
    // Put performance critical items in local variables
    const chnBuf = new Int32Array(mix.length);
    const instr = song.songData[track];
    const rowLen = song.rowLen;
    const patternLen = song.patternLen;

    // Clear effect state
    let low = 0;
    let band = 0;
    let lsample = 0;
    let rsample = 0;
    let filterActive = false;

    // Clear note cache.
    let noteCache = [];

    // Patterns
    const lastRow = song.endPattern;
    for (let p = 0; p <= lastRow; ++p) {
        const cp = instr.p[p];

        // Pattern rows
        for (let row = 0; row < patternLen; ++row) {
            // Execute effect command.
            const cmdNo = cp ? instr.c[cp - 1].f[row] : 0;
            if (cmdNo) {
                instr.i[cmdNo - 1] = instr.c[cp - 1].f[row + patternLen] || 0;

                // Clear the note cache since the instrument has changed.
                if (cmdNo < 17) {
                    noteCache = [];
                }
            }

            // Put performance critical instrument properties in local variables
            const oscLFO = oscillators[instr.i[16]];
            const lfoAmt = instr.i[17] / 512;
            const lfoFreq = pow2(instr.i[18] - 9) / rowLen;
            const fxLFO = instr.i[19];
            const fxFilter = instr.i[20];
            const fxFreq = instr.i[21] * 43.23529 * 3.141592 / 44100;
            const q = 1 - instr.i[22] / 255;
            const dist = instr.i[23] * 1e-5;
            const drive = instr.i[24] / 32;
            const panAmt = instr.i[25] / 512;
            const panFreq = 6.283184 * pow2(instr.i[26] - 9) / rowLen;
            const dlyAmt = instr.i[27] / 255;
            const dly = instr.i[28] * rowLen & ~1;  // Must be an even number

            // Calculate start sample number for this row in the pattern
            const rowStartSample = (p * patternLen + row) * rowLen;

            // Generate notes for this pattern row
            for (let col = 0; col < 4; ++col) {
                const n = cp ? instr.c[cp - 1].n[row + col * patternLen] : 0;
                if (n) {
                    if (!noteCache[n]) {
                        noteCache[n] = createNote(instr, n, rowLen);
                    }

                    // Copy note from the note cache
                    const noteBuf = noteCache[n];
                    for (let j = 0, i = rowStartSample * 2; j < noteBuf.length; ++j, i += 2) {
                        chnBuf[i] += noteBuf[j];
                    }
                }
            }

            // Perform effects for this pattern row
            for (let j = 0; j < rowLen; ++j) {
                // Dry mono-sample
                const k = (rowStartSample + j) * 2;
                rsample = chnBuf[k];

                // We only do effects if we have some sound input
                if (rsample || filterActive) {
                    // State variable filter
                    let f = fxFreq;
                    if (fxLFO) {
                        f *= oscLFO(lfoFreq * k) * lfoAmt + 0.5;
                    }
                    f = 1.5 * Math.sin(f);
                    low += f * band;
                    const high = q * (rsample - band) - low;
                    band += f * high;
                    rsample = fxFilter == 3 ? band : fxFilter == 1 ? high : low;

                    // Distortion
                    if (dist) {
                        rsample *= dist;
                        rsample = rsample < 1 ? rsample > -1 ? osc_sin(rsample * .25) : -1 : 1;
                        rsample /= dist;
                    }

                    // Drive
                    rsample *= drive;

                    // Is the filter active (i.e. still audiable)?
                    filterActive = rsample * rsample > 1e-5;

                    // Panning
                    const t = Math.sin(panFreq * k) * panAmt + 0.5;
                    lsample = rsample * (1 - t);
                    rsample *= t;
                } else {
                    lsample = 0;
                }

                // Delay is always done, since it does not need sound input
                if (k >= dly) {
                    // Left channel = left + right[-p] * t
                    lsample += chnBuf[k - dly + 1] * dlyAmt;

                    // Right channel = right + left[-p] * t
                    rsample += chnBuf[k - dly] * dlyAmt;
                }

                // Store in stereo channel buffer (needed for the delay effect)
                chnBuf[k] = lsample | 0;
                chnBuf[k + 1] = rsample | 0;

                // ...and add to stereo mix buffer
                mix[k] += lsample | 0;
                mix[k + 1] += rsample | 0;
            }
        }
    }
}

function generateAll(song: SongData, mix: Int32Array) {
    const numTracks = song.numChannels;
    for (let i = 0; i < numTracks; ++i) {
        generate(song, mix, i);
    }
}

export function createAudioBufferFromSong(song: SongData): AudioBuffer {
    const ctx = getAudioContext();
    const numChannels = 2;
    const len = song.rowLen * song.patternLen * (song.endPattern + 1);
    const numWords = len * numChannels;
    const mix = new Int32Array(numWords);

    generateAll(song, mix);

    const buffer = ctx.createBuffer(numChannels, len, 44100);
    for (let i = 0; i < numChannels; i++) {
        const data = buffer.getChannelData(i);
        for (let j = i; j < numWords; j += numChannels) {
            data[j >> 1] = mix[j] / 65536;
        }
    }
    return buffer;
}

interface SongDataColumn {
    n:(number|undefined)[];
    f:(number|undefined)[];
}

interface SongDataInstrument {
    // instrument
    i: number[];
    // patterns
    p: (number|undefined)[];
    // columns
    c: SongDataColumn[];
}

export interface SongData {
    songData: SongDataInstrument[];
    rowLen: number;
    patternLen: number;
    endPattern: number;
    numChannels: number;
}
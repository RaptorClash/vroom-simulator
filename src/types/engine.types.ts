export interface SynthConfig {
    name?: string;
    hasTurbo?: boolean;
    volumeMultiplier?: number;
    idleRPM?: number;
    maxRPM?: number;
    gears?: number;
    shiftPoint?: number;
    engineType?: OscillatorType;
    baseFrequency?: number;
    filterCutoff?: number;
    blowoffFreq?: number;
    distortionAmount?: number;
}

export interface AudioNodeGroup {
    rpm: number | null;
    type: 'on' | 'off';
    gainNode: GainNode;
    sourceNode: AudioBufferSourceNode;
}

export interface SoundPack {
    id: string;
    name: string;
    type: 'wav-multi' | 'wav-single' | 'synth';
    files: { url: string; rpm: number | null; state: 'on' | 'off' }[];
    config?: SynthConfig;
}
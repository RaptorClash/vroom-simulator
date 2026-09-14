import { useState, useRef, useEffect } from 'react';
import type { AudioNodeGroup, SoundPack } from '../types/engine.types';
import { makeDistortionCurve } from '../audio/audioUtils';
import { soundPacks } from '../audio/soundManager';

export function useEngine(
    selectedPackId: string,
    globalVolume: number,
    maxSpeed: number,
    uiGears: number,
    uiShiftPoint: number,
    mode: 'gps' | 'manual' | 'sensor' = 'manual',
    gpsSpeed: number = 0
) {
    const [engineStarted, setEngineStarted] = useState(false);
    const [speed, setSpeed] = useState(0);
    const [targetLoad, setTargetLoad] = useState(0);

    const currentLoadRef = useRef(0);
    const speedRef = useRef(0);

    const engineFreeRevRef = useRef(0);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const globalVolumeRef = useRef<GainNode | null>(null);
    const activeNodesRef = useRef<AudioNodeGroup[]>([]);

    const synthMainOscRef = useRef<OscillatorNode | null>(null);
    const synthSubOscRef = useRef<OscillatorNode | null>(null);
    const synthFilterRef = useRef<BiquadFilterNode | null>(null);

    useEffect(() => {
        if (globalVolumeRef.current && audioCtxRef.current) {
            globalVolumeRef.current.gain.setTargetAtTime(globalVolume / 100, audioCtxRef.current.currentTime, 0.1);
        }
    }, [globalVolume]);

    const startEngine = async () => {
        const activePack = soundPacks.find(p => p.id === selectedPackId);
        if (!activePack) return;
        const ctx = new window.AudioContext();
        audioCtxRef.current = ctx;

        const masterVolNode = ctx.createGain();
        masterVolNode.gain.value = globalVolume / 100;
        masterVolNode.connect(ctx.destination);
        globalVolumeRef.current = masterVolNode;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.5;
        gainNode.connect(masterVolNode);

        try {
            if (activePack.type === 'wav-multi' || activePack.type === 'wav-single') {
                const loadedNodes: AudioNodeGroup[] = [];
                await Promise.all(activePack.files.map(async (file) => {
                    const res = await fetch(file.url);
                    const arrayBuffer = await res.arrayBuffer();
                    const buffer = await ctx.decodeAudioData(arrayBuffer);

                    const sourceNode = ctx.createBufferSource();
                    sourceNode.buffer = buffer;
                    sourceNode.loop = true;
                    const fileGain = ctx.createGain();
                    fileGain.gain.value = 0;
                    sourceNode.connect(fileGain);
                    fileGain.connect(gainNode);
                    sourceNode.start();
                    loadedNodes.push({
                        rpm: file.rpm,
                        type: file.state,
                        gainNode: fileGain,
                        sourceNode: sourceNode
                    });
                }));
                activeNodesRef.current = loadedNodes.sort((a, b) => (a.rpm || 0) - (b.rpm || 0));
            } else if (activePack.type === 'synth' && activePack.config) {
                const distortion = ctx.createWaveShaper();
                distortion.curve = new Float32Array(makeDistortionCurve(activePack.config.distortionAmount || 50));
                distortion.oversample = '4x';
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = activePack.config.filterCutoff || 400;
                filter.Q.value = 2.0;
                synthFilterRef.current = filter;

                const mainOsc = ctx.createOscillator();
                mainOsc.type = activePack.config.engineType || 'sawtooth';
                mainOsc.frequency.value = activePack.config.baseFrequency || 50;
                synthMainOscRef.current = mainOsc;

                const subOsc = ctx.createOscillator();
                subOsc.type = 'sine';
                subOsc.frequency.value = (activePack.config.baseFrequency || 50) / 2;
                synthSubOscRef.current = subOsc;

                mainOsc.connect(filter);
                subOsc.connect(filter);
                filter.connect(distortion);
                distortion.connect(gainNode);
                mainOsc.start();
                subOsc.start();
            }
            setEngineStarted(true);
        } catch (error) {
            alert("Fehler beim Laden der Audiodaten.");
            console.error(error);
        }
    };

    const stopEngine = () => {
        activeNodesRef.current.forEach(node => {
            try { node.sourceNode.stop(); } catch (e) { console.error(e); }
            node.sourceNode.disconnect();
        });
        activeNodesRef.current = [];

        if (synthMainOscRef.current) {
            try { synthMainOscRef.current.stop(); } catch (e) { console.error(e); }
            synthMainOscRef.current.disconnect();
            synthSubOscRef.current?.stop();
        }

        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close();
        }
        audioCtxRef.current = null;

        setEngineStarted(false);
        setSpeed(0);
        speedRef.current = 0;
        setTargetLoad(0);
        currentLoadRef.current = 0;
        engineFreeRevRef.current = 0;
    };

    const playBlowoffSound = (activePack: SoundPack, ctx: AudioContext) => {
        if (!activePack.config?.hasTurbo) return;
        const duration = 0.9;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);

        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = activePack.config.blowoffFreq || 2600;
        filter.Q.value = 8.0;

        const flutterLFO = ctx.createOscillator();
        flutterLFO.type = 'sine';
        flutterLFO.frequency.value = 14;

        const flutterGain = ctx.createGain();
        flutterGain.gain.value = 0.5;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.5;

        flutterLFO.connect(lfoGain);
        lfoGain.connect(flutterGain.gain);

        const masterBlowoffGain = ctx.createGain();
        masterBlowoffGain.gain.setValueAtTime(1.5, ctx.currentTime);
        masterBlowoffGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        noiseSrc.connect(filter);
        filter.connect(flutterGain);
        flutterGain.connect(masterBlowoffGain);
        masterBlowoffGain.connect(globalVolumeRef.current || ctx.destination);

        noiseSrc.start();
        flutterLFO.start();
    };

    useEffect(() => {
        if (!engineStarted) return;
        const interval = setInterval(() => {
            const ctx = audioCtxRef.current;
            const activePack = soundPacks.find(p => p.id === selectedPackId);
            if (!ctx || !activePack) return;

            currentLoadRef.current += (targetLoad - currentLoadRef.current) * 0.15;
            const prevLoad = currentLoadRef.current;

            let newSpeed: number;

            if (mode === 'gps' || mode === 'sensor') {
                newSpeed = gpsSpeed;
            } else {
                const acceleration = currentLoadRef.current > 0
                    ? currentLoadRef.current * 3.5
                    : currentLoadRef.current < 0
                        ? currentLoadRef.current * 5.0
                        : -0.5;

                newSpeed = speedRef.current + acceleration;
                if (newSpeed < 0) newSpeed = 0;
                if (newSpeed > maxSpeed) newSpeed = maxSpeed;
            }

            speedRef.current = newSpeed;
            setSpeed(newSpeed); 

            if (newSpeed < 3.0) {
                if (targetLoad > 0) {
                    engineFreeRevRef.current += targetLoad * 4.0;

                    const revLimit = (maxSpeed / uiGears) * 0.8;
                    if (engineFreeRevRef.current > revLimit) {
                        engineFreeRevRef.current = revLimit;
                    }
                } else {
                    engineFreeRevRef.current *= 0.85;
                    if (engineFreeRevRef.current < 0.1) engineFreeRevRef.current = 0;
                }
            } else {
                engineFreeRevRef.current *= 0.7;
                if (engineFreeRevRef.current < 0.1) engineFreeRevRef.current = 0;
            }

            const virtualEngineSpeed = newSpeed + engineFreeRevRef.current;


            if (prevLoad > 0.5 && targetLoad <= 0 && virtualEngineSpeed > 40) {
                playBlowoffSound(activePack, ctx);
            }

            const loadClamped = Math.max(0, currentLoadRef.current);
            const onGainFactor = Math.sin(loadClamped * 0.5 * Math.PI);
            const offGainFactor = Math.cos(loadClamped * 0.5 * Math.PI);
            const volMultiplier = activePack.config?.volumeMultiplier || 1.0;

            if (activePack.type === 'wav-multi') {
                const nodes = activeNodesRef.current;
                const idleRPM = activePack.config?.idleRPM || 900;
                const absoluteMaxRPM = activePack.config?.maxRPM || Math.max(...nodes.map(n => n.rpm || 900));
                const effectiveMaxRPM = idleRPM + (absoluteMaxRPM - idleRPM) * uiShiftPoint;
                let currentRpm = idleRPM;

                if (uiGears > 1) {
                    const speedPerGear = maxSpeed / uiGears;
                    const currentGear = Math.min(Math.floor(virtualEngineSpeed / speedPerGear), uiGears - 1);
                    const speedInCurrentGear = virtualEngineSpeed - (currentGear * speedPerGear);
                    const gearProgress = speedInCurrentGear / speedPerGear;
                    const startRpm = currentGear === 0 ? idleRPM : effectiveMaxRPM * 0.65;
                    currentRpm = startRpm + gearProgress * (effectiveMaxRPM - startRpm);
                } else {
                    currentRpm = idleRPM + (virtualEngineSpeed / maxSpeed) * (effectiveMaxRPM - idleRPM);
                }

                const onNodes = nodes.filter(n => n.type === 'on');
                const offNodes = nodes.filter(n => n.type === 'off');

                const updateNodeGroup = (group: AudioNodeGroup[], globalGain: number) => {
                    if (group.length === 0) return;
                    for (let i = 0; i < group.length; i++) {
                        const node = group[i];
                        const nextNode = group[i + 1];
                        const prevNode = group[i - 1];
                        let nodeGain = 0;
                        let pitch = 1.0;

                        if (i === 0 && currentRpm <= node.rpm!) {
                            nodeGain = 1;
                            pitch = currentRpm / node.rpm!;
                        } else if (!nextNode && currentRpm >= node.rpm!) {
                            nodeGain = 1;
                            pitch = currentRpm / node.rpm!;
                        } else if (nextNode && currentRpm >= node.rpm! && currentRpm <= nextNode.rpm!) {
                            const range = nextNode.rpm! - node.rpm!;
                            const progress = (currentRpm - node.rpm!) / range;
                            nodeGain = Math.cos(progress * 0.5 * Math.PI);
                            pitch = currentRpm / node.rpm!;
                        } else if (prevNode && currentRpm >= prevNode.rpm! && currentRpm <= node.rpm!) {
                            const range = node.rpm! - prevNode.rpm!;
                            const progress = (currentRpm - prevNode.rpm!) / range;
                            nodeGain = Math.sin(progress * 0.5 * Math.PI);
                            pitch = currentRpm / node.rpm!;
                        }

                        if (pitch < 0.2) pitch = 0.2;
                        if (pitch > 3.0) pitch = 3.0;

                        node.gainNode.gain.setTargetAtTime(nodeGain * globalGain * volMultiplier, ctx.currentTime, 0.05);
                        node.sourceNode.playbackRate.setTargetAtTime(pitch, ctx.currentTime, 0.05);
                    }
                };

                updateNodeGroup(onNodes, onGainFactor);
                updateNodeGroup(offNodes, offGainFactor);

            } else if (activePack.type === 'wav-single') {
                const onNode = activeNodesRef.current.find(n => n.type === 'on');
                const offNode = activeNodesRef.current.find(n => n.type === 'off');
                const pitch = 0.6 + (virtualEngineSpeed / 150);

                if (onNode) {
                    onNode.gainNode.gain.setTargetAtTime(onGainFactor * volMultiplier, ctx.currentTime, 0.1);
                    onNode.sourceNode.playbackRate.setTargetAtTime(pitch, ctx.currentTime, 0.1);
                }
                if (offNode) {
                    offNode.gainNode.gain.setTargetAtTime(offGainFactor * volMultiplier, ctx.currentTime, 0.1);
                    offNode.sourceNode.playbackRate.setTargetAtTime(pitch, ctx.currentTime, 0.1);
                }
            } else if (activePack.type === 'synth' && synthMainOscRef.current && synthFilterRef.current && activePack.config) {
                const rpmMultiplier = 1 + (virtualEngineSpeed / 80);
                const targetFreq = (activePack.config.baseFrequency || 50) * rpmMultiplier;
                synthMainOscRef.current.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.1);
                if (synthSubOscRef.current) {
                    synthSubOscRef.current.frequency.setTargetAtTime(targetFreq / 2, ctx.currentTime, 0.1);
                }
                const loadFilterOffset = onGainFactor > 0 ? 1500 : 0;
                const speedFilterOffset = virtualEngineSpeed * 10;
                const targetFilter = (activePack.config.filterCutoff || 400) + loadFilterOffset + speedFilterOffset;
                synthFilterRef.current.frequency.setTargetAtTime(targetFilter, ctx.currentTime, 0.1);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [engineStarted, targetLoad, maxSpeed, uiGears, uiShiftPoint, selectedPackId, mode, gpsSpeed]);

    return { engineStarted, speed, targetLoad, setTargetLoad, startEngine, stopEngine };
}
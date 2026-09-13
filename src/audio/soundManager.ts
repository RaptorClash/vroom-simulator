import type { SoundPack, SynthConfig } from '../types/engine.types';

const wavModules = import.meta.glob('/src/sounds/*/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const synthConfigModules = import.meta.glob('/src/sounds/*/config.ts', { eager: true, import: 'default' }) as Record<string, SynthConfig>;

function loadSoundPacks(): SoundPack[] {
    const packs: SoundPack[] = [];
    const packMap = new Map<string, SoundPack>();

    for (const path in wavModules) {
        const parts = path.split('/');
        const folderName = parts[3];
        const fileName = parts[4];
        const match = fileName.match(/(\d+)?_?(on|off)\.wav$/);
        if (!match) continue;

        const rpm = match[1] ? parseInt(match[1], 10) : null;
        const state = match[2] as 'on' | 'off';

        if (!packMap.has(folderName)) {
            const config = synthConfigModules[`/src/sounds/${folderName}/config.ts`];
            packMap.set(folderName, {
                id: folderName,
                name: config?.name || folderName.toUpperCase(),
                type: rpm !== null ? 'wav-multi' : 'wav-single',
                files: [],
                config: config
            });
        }

        const pack = packMap.get(folderName)!;
        if (rpm !== null && pack.type === 'wav-single') pack.type = 'wav-multi';
        pack.files.push({ url: wavModules[path], rpm, state });
    }

    for (const path in synthConfigModules) {
        const folderName = path.split('/')[3];
        if (!packMap.has(folderName)) {
            packMap.set(folderName, {
                id: folderName,
                name: `${synthConfigModules[path].name} (Synth)`,
                type: 'synth',
                files: [],
                config: synthConfigModules[path],
            });
        }
    }

    packs.push(...Array.from(packMap.values()));
    return packs;
}

export const soundPacks = loadSoundPacks();
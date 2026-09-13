import { FormControl, InputLabel, Select, MenuItem, Stack } from '@mui/material';
import { FaCar } from 'react-icons/fa6';
import type { SoundPack } from '../types/engine.types';

interface PackSelectorProps {
    soundPacks: SoundPack[];
    selectedId: string;
    onChange: (id: string) => void;
}

export function PackSelector({ soundPacks, selectedId, onChange }: PackSelectorProps) {
    return (
        <FormControl fullWidth>
            <InputLabel>Fahrzeug (Sound) wählen</InputLabel>
            <Select
                value={selectedId}
                label="Fahrzeug (Sound) wählen"
                onChange={(e) => onChange(e.target.value)}
            >
                {soundPacks.map((pack) => (
                    <MenuItem key={pack.id} value={pack.id}>
                        <Stack sx={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                            <FaCar /> {pack.name}
                        </Stack>
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}
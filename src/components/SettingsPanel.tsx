import { Box, Typography, Slider } from '@mui/material';

interface SettingsPanelProps {
    globalVolume: number;
    setGlobalVolume: (val: number) => void;
    maxSpeed: number;
    setMaxSpeed: (val: number) => void;
    uiGears: number;
    setUiGears: (val: number) => void;
    uiShiftPoint: number;
    setUiShiftPoint: (val: number) => void;
}

export function SettingsPanel({
    globalVolume, setGlobalVolume,
    maxSpeed, setMaxSpeed,
    uiGears, setUiGears,
    uiShiftPoint, setUiShiftPoint
}: SettingsPanelProps) {
    return (
        <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>Engine & Tuning</Typography>

            <Typography variant="caption">Lautstärke ({globalVolume}%)</Typography>
            <Slider value={globalVolume} min={0} max={100} onChange={(_, v) => setGlobalVolume(v as number)} sx={{ mb: 1 }} />

            <Typography variant="caption">Maximalgeschwindigkeit ({maxSpeed} km/h)</Typography>
            <Slider value={maxSpeed} min={100} max={400} step={10} onChange={(_, v) => setMaxSpeed(v as number)} sx={{ mb: 1 }} />

            <Typography variant="caption">Gänge ({uiGears})</Typography>
            <Slider value={uiGears} min={1} max={10} step={1} onChange={(_, v) => setUiGears(v as number)} sx={{ mb: 1 }} />

            <Typography variant="caption">Schaltpunkt ({Math.round(uiShiftPoint * 100)}% Max RPM)</Typography>
            <Slider value={uiShiftPoint} min={0.5} max={1.0} step={0.05} onChange={(_, v) => setUiShiftPoint(v as number)} />
        </Box>
    );
}
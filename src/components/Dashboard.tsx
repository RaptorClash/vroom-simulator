import { Box, Typography, Button } from '@mui/material';

interface DashboardProps {
    speed: number;
    onStop: () => void;
}

export function Dashboard({ speed, onStop }: DashboardProps) {
    return (
        <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" color="text.secondary">Tacho</Typography>
                <Button color="error" variant="outlined" size="small" onClick={onStop}>Motor aus</Button>
            </Box>
            <Box sx={{ my: 4 }}>
                <Typography variant="h1" sx={{ fontWeight: '900', fontFamily: 'monospace', color: 'primary.main' }}>
                    {Math.round(speed)}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">km/h</Typography>
            </Box>
            <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary' }}>Test-Dashboard</Typography>
        </>
    );
}
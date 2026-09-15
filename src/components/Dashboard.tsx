import { Box, Typography } from '@mui/material';

interface DashboardProps {
    speed: number;
    onStop: () => void;
}

export function Dashboard({ speed }: DashboardProps) {
    return (
        <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            </Box>
            <Box sx={{ my: 4 }}>
                <Typography variant="h1" sx={{ fontWeight: '900', fontFamily: 'monospace', color: 'primary.main' }}>
                    {Math.round(speed)}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">km/h</Typography>
            </Box>
        </>
    );
}
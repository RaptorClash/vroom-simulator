import { useState } from 'react';
import { Drawer, Box, Typography, IconButton, Slider, Divider, TextField, ToggleButtonGroup, ToggleButton, Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack } from '@mui/material';
import { FaXmark, FaServer, FaShareNodes, FaCopy, FaCheck, FaArrowUpRightFromSquare } from 'react-icons/fa6';
import { PackSelector } from './PackSelector';
import { SpotifyPanel } from './SpotifyPanel';
import { soundPacks } from '../audio/soundManager';

interface SettingsDrawerProps {
    open: boolean;
    onClose: () => void;
    packId: string;
    handlePackChange: (id: string) => void;
    masterVol: number;
    setMasterVol: (val: number) => void;
    engineVol: number;
    setEngineVol: (val: number) => void;
    spotVol: number;
    setSpotVol: (val: number) => void;
    maxSpd: number;
    setMaxSpd: (val: number) => void;
    gears: number;
    setGears: (val: number) => void;
    shiftPt: number;
    setShiftPt: (val: number) => void;
    turnUrl: string;
    setTurnUrl: (val: string) => void;
    turnUser: string;
    setTurnUser: (val: string) => void;
    turnPass: string;
    setTurnPass: (val: string) => void;
    driverSide: 'left' | 'right';
    setDriverSide: (val: 'left' | 'right') => void;
    isClientRole: boolean;
}

export function SettingsDrawer({
    open, onClose, packId, handlePackChange, masterVol, setMasterVol,
    engineVol, setEngineVol, spotVol, setSpotVol, maxSpd, setMaxSpd,
    gears, setGears, shiftPt, setShiftPt, turnUrl, setTurnUrl,
    turnUser, setTurnUser, turnPass, setTurnPass, driverSide, setDriverSide,
    isClientRole
}: SettingsDrawerProps) {

    const [shareOpen, setShareOpen] = useState(false);
    const [generatedUrl, setGeneratedUrl] = useState('');
    const [copied, setCopied] = useState(false);

    const handleGenerateLink = () => {
        const url = new URL(window.location.origin + window.location.pathname);
        if (turnUrl) url.searchParams.set('turn', btoa(turnUrl));
        if (turnUser) url.searchParams.set('user', btoa(turnUser));
        if (turnPass) url.searchParams.set('pass', btoa(turnPass));

        const spotId = localStorage.getItem('spotify_client_id') || '';
        if (spotId) url.searchParams.set('spotId', btoa(spotId));

        setGeneratedUrl(url.toString());
        setShareOpen(true);
        setCopied(false);
    };

    const copyToClipboard = () => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(generatedUrl);
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = generatedUrl;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
            } catch (error) {
                console.error("Fallback Copy failed", error);
            }
            document.body.removeChild(textArea);
        }

        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <>
            <Drawer
                anchor={driverSide}
                open={open}
                onClose={onClose}
                ModalProps={{ keepMounted: true }}
            >                <Box sx={{ width: { xs: '100vw', sm: 450 }, p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>Einstellungen</Typography>
                        <IconButton onClick={onClose} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}>
                            <FaXmark />
                        </IconButton>
                    </Box>

                    <PackSelector soundPacks={soundPacks} selectedId={packId} onChange={handlePackChange} />

                    <Divider />

                    <Box>
                        <Typography variant="overline" color="primary">LAYOUT / FAHRERSEITE</Typography>
                        <Box sx={{ mt: 1 }}>
                            <ToggleButtonGroup color="primary" value={driverSide} exclusive onChange={(_, v) => v && setDriverSide(v)} fullWidth size="small">
                                <ToggleButton value="left">Links (LHD)</ToggleButton>
                                <ToggleButton value="right">Rechts (RHD)</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                    </Box>

                    <Divider />

                    <Box>
                        <Typography variant="overline" color="primary">LAUTSTÄRKE</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Gesamtlautstärke (Master)</Typography>
                        <Slider value={masterVol} min={0} max={100} onChange={(_, v) => setMasterVol(v as number)} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Motor Lautstärke</Typography>
                        <Slider value={engineVol} min={0} max={100} onChange={(_, v) => setEngineVol(v as number)} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Spotify Lautstärke</Typography>
                        <Slider value={spotVol} min={0} max={100} onChange={(_, v) => setSpotVol(v as number)} />
                    </Box>

                    <Divider />

                    <Box>
                        <Typography variant="overline" color="primary">FAHRZEUG CONFIG</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Höchstgeschwindigkeit ({maxSpd} km/h)</Typography>
                        <Slider value={maxSpd} min={100} max={400} step={10} onChange={(_, v) => setMaxSpd(v as number)} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Anzahl der Gänge ({gears})</Typography>
                        <Slider value={gears} min={1} max={10} step={1} marks onChange={(_, v) => setGears(v as number)} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Schaltpunkt bei Motorlast ({Math.round(shiftPt * 100)}%)</Typography>
                        <Slider value={shiftPt} min={0.5} max={1.0} step={0.05} onChange={(_, v) => setShiftPt(v as number)} />
                    </Box>

                    <Divider />

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="overline" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FaServer /> Netzwerk (Relay)
                        </Typography>
                        <TextField size="small" label="TURN URLs (kommagetrennt)" value={turnUrl} onChange={(e) => setTurnUrl(e.target.value)} />
                        <TextField size="small" label="Username" value={turnUser} onChange={(e) => setTurnUser(e.target.value)} />
                        <TextField size="small" label="Credential" type="password" value={turnPass} onChange={(e) => setTurnPass(e.target.value)} />
                    </Box>

                    <Divider />

                    <SpotifyPanel volume={(masterVol / 100) * (spotVol / 100)} isClientRole={isClientRole} />

                    <Button
                        variant="contained"
                        color="primary"
                        size="large"
                        startIcon={<FaShareNodes />}
                        onClick={handleGenerateLink}
                        sx={{ mt: 2 }}
                    >
                        An Tesla senden
                    </Button>

                </Box>
            </Drawer>

            <Dialog open={shareOpen} onClose={() => setShareOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 'bold' }}>An Tesla senden</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>

                    <Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            1. Kopiere deinen personalisierten Link:
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <TextField fullWidth size="small" value={generatedUrl} />
                            <Button
                                variant={copied ? "contained" : "outlined"}
                                color={copied ? "success" : "primary"}
                                onClick={copyToClipboard}
                                sx={{ minWidth: 'auto', transition: 'all 0.3s' }}
                            >
                                {copied ? <FaCheck size={18} /> : <FaCopy size={18} />}
                            </Button>
                        </Stack>
                    </Box>

                    <Divider />

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            2. Öffne im Tesla-Browser <b>teslasend.link</b><br />
                            3. Öffne hier am Handy den QR-Scanner und scanne den Code vom Tesla-Screen:
                        </Typography>

                        <Button
                            variant="contained"
                            color="primary"
                            size="large"
                            endIcon={<FaArrowUpRightFromSquare />}
                            onClick={() => window.open('https://teslasend.link/', '_blank')}
                            sx={{ py: 1.5, fontWeight: 'bold' }}
                        >
                            teslasend.link öffnen
                        </Button>
                    </Box>

                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setShareOpen(false)} variant="outlined" color="inherit">Schließen</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
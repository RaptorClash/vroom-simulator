import { useState, useEffect } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, Typography, ToggleButtonGroup, ToggleButton, LinearProgress, IconButton, Drawer, Slider, Divider, keyframes, Button, TextField, Stack } from '@mui/material';
import { FaPowerOff, FaGear, FaLink, FaMobileScreen, FaCar, FaPause, FaPlay, FaArrowsToEye } from 'react-icons/fa6';
import { soundPacks } from './audio/soundManager';
import { useEngine } from './hooks/useEngine';
import { useMotionSensor } from './hooks/useMotionSensor';
import type { SyncState } from './hooks/usePeer';
import { usePeer } from './hooks/usePeer';
import { PackSelector } from './components/PackSelector';
import { Dashboard } from './components/Dashboard';
import { Controls } from './components/Controls';
import { SpotifyPanel } from './components/SpotifyPanel';

const darkTheme = createTheme({
  palette: { mode: 'dark', background: { default: '#121212', paper: '#1e1e1e' }, primary: { main: '#f43f5e' } },
  typography: { fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif' }
});

const pulseAnim = keyframes`0% { opacity: 0.4; transform: scale(0.98); } 50% { opacity: 1; transform: scale(1.02); } 100% { opacity: 0.4; transform: scale(0.98); }`;

const getNum = (k: string, d: number) => { try { const v = localStorage.getItem(k); return v ? parseFloat(v) : d; } catch { return d; } };
const getStr = (k: string, d: string) => { try { const v = localStorage.getItem(k); return v ? v : d; } catch { return d; } };

export default function App() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [packId, setPackId] = useState(() => getStr('vr_pack', soundPacks[0]?.id || ''));
  const [masterVol, setMasterVol] = useState(() => getNum('vr_mvol', 100));
  const [engineVol, setEngineVol] = useState(() => getNum('vr_evol', 50));
  const [spotVol, setSpotVol] = useState(() => getNum('vr_svol', 50));
  const [maxSpd, setMaxSpd] = useState(() => getNum('vr_spd', 300));
  const [gears, setGears] = useState(() => getNum('vr_grs', 6));
  const [shiftPt, setShiftPt] = useState(() => getNum('vr_shft', 1.0));

  const [mode, setMode] = useState<'gps' | 'manual' | 'sensor'>('gps');
  const [gpsSpeed, setGpsSpeed] = useState(0);
  const [gpsError, setGpsError] = useState('');

  const [joinCode, setJoinCode] = useState('');

  const sensor = useMotionSensor();

  const { engineStarted, speed, targetLoad, setTargetLoad, startEngine, stopEngine } = useEngine(
    packId, (masterVol / 100) * engineVol, maxSpd, gears, shiftPt, mode === 'gps' ? 'gps' : 'manual', gpsSpeed
  );

  const handleIncomingSync = (state: SyncState) => {
    if (state.targetLoad !== undefined) setTargetLoad(state.targetLoad);
    if (state.packId !== undefined && state.packId !== packId) { setPackId(state.packId); window.location.reload(); }
    if (state.masterVol !== undefined) setMasterVol(state.masterVol);
    if (state.engineVol !== undefined) setEngineVol(state.engineVol);
    if (state.spotifyVol !== undefined) setSpotVol(state.spotifyVol);
    if (state.maxSpeed !== undefined) setMaxSpd(state.maxSpeed);
    if (state.gears !== undefined) setGears(state.gears);
    if (state.shiftPoint !== undefined) setShiftPt(state.shiftPoint);
  };

  const peer = usePeer(handleIncomingSync);

  useEffect(() => {
    if (mode !== 'gps' || !engineStarted) {
      if (mode === 'gps' && engineStarted) setTargetLoad(0);
      return;
    }

    let lastSpeedKmh = 0;
    let lastTime = Date.now();
    const speedBuffer: number[] = [];

    const watchId = navigator.geolocation.watchPosition(
      (position: GeolocationPosition) => {
        setGpsError('');
        const rawSpeed = (position.coords.speed || 0) * 3.6;

        speedBuffer.push(rawSpeed);
        if (speedBuffer.length > 3) speedBuffer.shift();
        const currentSpeedKmh = speedBuffer.reduce((a, b) => a + b, 0) / speedBuffer.length;

        setGpsSpeed(currentSpeedKmh);

        const now = Date.now();
        const dt = (now - lastTime) / 1000;

        if (dt >= 0.5) {
          const acceleration = (currentSpeedKmh - lastSpeedKmh) / dt;
          let newLoad: number;

          if (acceleration <= 0.1) {
            newLoad = 0.0;
          } else if (acceleration > 2.0) {
            newLoad = 1.0;
          } else if (acceleration > 0.5) {
            newLoad = 0.6;
          } else {
            newLoad = 0.25;
          }

          setTargetLoad(newLoad);
          lastSpeedKmh = currentSpeedKmh;
          lastTime = now;
        }
      },
      () => {
        setGpsError("GPS Signal konnte nicht abgerufen werden.");
        setTargetLoad(0);
      },
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode, engineStarted, setTargetLoad]);


  useEffect(() => {
    localStorage.setItem('vr_pack', packId); localStorage.setItem('vr_mvol', masterVol.toString());
    localStorage.setItem('vr_evol', engineVol.toString()); localStorage.setItem('vr_svol', spotVol.toString());
    localStorage.setItem('vr_spd', maxSpd.toString()); localStorage.setItem('vr_grs', gears.toString());
    localStorage.setItem('vr_shft', shiftPt.toString());

    peer.broadcastState({ packId, masterVol, engineVol, spotifyVol: spotVol, maxSpeed: maxSpd, gears, shiftPoint: shiftPt });
  }, [packId, masterVol, engineVol, spotVol, maxSpd, gears, shiftPt, peer]);

  useEffect(() => {
    if (mode === 'sensor' && peer.connected) {
      peer.broadcastState({ targetLoad: sensor.load });
    }
  }, [sensor.load, mode, peer]);

  const handleStart = async () => { setHasInteracted(true); await startEngine(); };
  const handleStop = () => { stopEngine(); setHasInteracted(false); setSettingsOpen(false); };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />

      {!hasInteracted ? (
        <Box onClick={handleStart} sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', '&:hover': { bgcolor: '#181818' }, transition: '0.3s' }}>
          <Typography variant="h2" sx={{ fontWeight: 900, letterSpacing: 4, mb: 2, color: 'primary.main' }}>VROOM</Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary', animation: `${pulseAnim} 2s infinite` }}>TAP ANYWHERE TO START</Typography>
        </Box>
      ) : (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <audio src="/silence.mp3" loop autoPlay playsInline style={{ display: 'none' }} />

          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3, position: 'relative' }}>
            <ToggleButtonGroup color="primary" value={mode} exclusive onChange={(_, m) => m && setMode(m)} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 20 }}>
              <ToggleButton value="gps"><FaCar style={{ marginRight: 8 }} /> AUTO</ToggleButton>
              <ToggleButton value="manual">MANUAL</ToggleButton>
              <ToggleButton value="sensor"><FaMobileScreen style={{ marginRight: 8 }} /> SENSOR</ToggleButton>
            </ToggleButtonGroup>

            <Box sx={{ position: 'absolute', right: 24, display: 'flex', gap: 2 }}>
              <IconButton onClick={() => setSettingsOpen(true)} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}><FaGear /></IconButton>
              <IconButton onClick={handleStop} sx={{ bgcolor: 'rgba(255,0,0,0.1)', color: '#f43f5e' }}><FaPowerOff /></IconButton>
            </Box>
          </Box>

          {/* NETZWERK & SENSOR BEREICH */}
          {mode === 'sensor' && (
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, bgcolor: 'rgba(0,0,0,0.2)' }}>
              {!peer.connected ? (
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  {peer.peerId ? (
                    <Typography variant="h5" color="primary" sx={{ letterSpacing: 5 }}>PIN: {peer.peerId}</Typography>
                  ) : (
                    <Button variant="outlined" onClick={peer.hostServer}>Als Auto (Host) starten</Button>
                  )}
                  <Typography>ODER</Typography>
                  <TextField size="small" placeholder="PIN" value={joinCode} onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  <Button variant="contained" disabled={joinCode.length < 4} onClick={() => peer.connectToServer(joinCode)}>Verbinden</Button>
                </Stack>
              ) : (
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Typography color="success.main" sx={{ fontWeight: 'bold' }}><FaLink /> VERBUNDEN</Typography>

                  {!sensor.hasPermission ? (
                    <Button variant="contained" color="secondary" onClick={sensor.requestAccess}>Sensoren freigeben</Button>
                  ) : (
                    <>
                      <Button variant="outlined" color="warning" onClick={sensor.calibrate} startIcon={<FaArrowsToEye />}>Kalibrieren (Nullpunkt)</Button>
                      <Button variant="contained" color={sensor.isPaused ? "success" : "error"} onClick={sensor.togglePause} startIcon={sensor.isPaused ? <FaPlay /> : <FaPause />}>
                        {sensor.isPaused ? "Fortsetzen" : "Pausieren"}
                      </Button>
                    </>
                  )}
                </Stack>
              )}
            </Box>
          )}

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Dashboard speed={mode === 'gps' ? gpsSpeed : speed} onStop={handleStop} />
            {mode === 'gps' && gpsError && (
              <Typography color="error" variant="body2" sx={{ mt: 2 }}>{gpsError}</Typography>
            )}
          </Box>

          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', minHeight: '120px' }}>
            {mode === 'manual' ? (
              <Controls targetLoad={targetLoad} setTargetLoad={setTargetLoad} />
            ) : (
              <Box sx={{ width: '100%', maxWidth: 600, textAlign: 'center' }}>
                <Typography variant="overline" color="text.secondary">THROTTLE / LOAD</Typography>
                <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, targetLoad * 100))} sx={{ height: 6, borderRadius: 3, mt: 1 }} />
                {targetLoad < 0 && <Typography color="error" variant="caption">Bremsend ({Math.round(targetLoad * -100)}%)</Typography>}
              </Box>
            )}
          </Box>

          {/* SETTINGS DRAWER */}
          <Drawer anchor="right" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
            <Box sx={{ width: { xs: '100vw', sm: 400 }, p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Typography variant="h5">Einstellungen</Typography>
              <PackSelector soundPacks={soundPacks} selectedId={packId} onChange={(id) => { setPackId(id); peer.broadcastState({ packId: id }); window.location.reload(); }} />
              <Divider />
              <Box>
                <Typography variant="overline" color="primary">LAUTSTÄRKE</Typography>
                <Slider value={masterVol} onChange={(_, v) => setMasterVol(v as number)} />
                <Slider value={engineVol} onChange={(_, v) => setEngineVol(v as number)} />
                <Slider value={spotVol} onChange={(_, v) => setSpotVol(v as number)} color="success" />
              </Box>
              <Divider />
              <Box>
                <Typography variant="overline" color="primary">FAHRZEUG</Typography>
                <Slider value={maxSpd} min={100} max={400} step={10} onChange={(_, v) => setMaxSpd(v as number)} />
                <Slider value={gears} min={1} max={10} step={1} marks onChange={(_, v) => setGears(v as number)} />
                <Slider value={shiftPt} min={0.5} max={1.0} step={0.05} onChange={(_, v) => setShiftPt(v as number)} />
              </Box>
              <SpotifyPanel volume={(masterVol / 100) * (spotVol / 100)} />
            </Box>
          </Drawer>
        </Box>
      )}
    </ThemeProvider>
  );
}
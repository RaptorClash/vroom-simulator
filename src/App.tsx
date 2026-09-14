import { useState, useEffect } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  LinearProgress,
  IconButton,
  Drawer,
  Slider,
  Divider,
  keyframes
} from '@mui/material';
import { FaPowerOff, FaGear } from 'react-icons/fa6';
import { soundPacks } from './audio/soundManager';
import { useEngine } from './hooks/useEngine';
import { PackSelector } from './components/PackSelector';
import { Dashboard } from './components/Dashboard';
import { Controls } from './components/Controls';
import { SpotifyPanel } from './components/SpotifyPanel';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#121212', paper: '#1e1e1e' },
    primary: { main: '#f43f5e' }
  },
  typography: { fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif' }
});

const pulseAnim = keyframes`
  0% { opacity: 0.4; transform: scale(0.98); }
  50% { opacity: 1; transform: scale(1.02); }
  100% { opacity: 0.4; transform: scale(0.98); }
`;

const getStoredNum = (key: string, defaultVal: number): number => {
  try { const val = localStorage.getItem(key); return val ? parseFloat(val) : defaultVal; }
  catch { return defaultVal; }
};
const getStoredStr = (key: string, defaultVal: string): string => {
  try { const val = localStorage.getItem(key); return val ? val : defaultVal; }
  catch { return defaultVal; }
};

export default function App() {
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const [selectedPackId, setSelectedPackId] = useState<string>(() => getStoredStr('vroom_pack', soundPacks.length > 0 ? soundPacks[0].id : ''));
  const [masterVolume, setMasterVolume] = useState<number>(() => getStoredNum('vroom_masterVol', 100));
  const [engineVolume, setEngineVolume] = useState<number>(() => getStoredNum('vroom_engineVol', 50));
  const [spotifyVolume, setSpotifyVolume] = useState<number>(() => getStoredNum('vroom_spotifyVol', 50));
  const [maxSpeed, setMaxSpeed] = useState<number>(() => getStoredNum('vroom_maxSpeed', 300));
  const [uiGears, setUiGears] = useState<number>(() => getStoredNum('vroom_gears', 6));
  const [uiShiftPoint, setUiShiftPoint] = useState<number>(() => getStoredNum('vroom_shift', 1.0));

  const [mode, setMode] = useState<'gps' | 'manual'>('gps');
  const [gpsSpeed, setGpsSpeed] = useState<number>(0);
  const [gpsError, setGpsError] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('vroom_pack', selectedPackId);
    localStorage.setItem('vroom_masterVol', masterVolume.toString());
    localStorage.setItem('vroom_engineVol', engineVolume.toString());
    localStorage.setItem('vroom_spotifyVol', spotifyVolume.toString());
    localStorage.setItem('vroom_maxSpeed', maxSpeed.toString());
    localStorage.setItem('vroom_gears', uiGears.toString());
    localStorage.setItem('vroom_shift', uiShiftPoint.toString());
  }, [selectedPackId, masterVolume, engineVolume, spotifyVolume, maxSpeed, uiGears, uiShiftPoint]);

  const effectiveEngineVolume = (masterVolume / 100) * engineVolume;
  const effectiveSpotifyVolume = (masterVolume / 100) * (spotifyVolume / 100);

  const { engineStarted, speed, targetLoad, setTargetLoad, startEngine, stopEngine } = useEngine(
    selectedPackId, effectiveEngineVolume, maxSpeed, uiGears, uiShiftPoint
  );

  const handleStart = async () => {
    setHasInteracted(true);
    await startEngine();
  };

  const handleStop = () => {
    stopEngine();
    setHasInteracted(false);
    setSettingsOpen(false);
  };

  const handlePackChange = (newPackId: string) => {
    setSelectedPackId(newPackId);
    localStorage.setItem('vroom_pack', newPackId);

    const pack = soundPacks.find(p => p.id === newPackId);
    if (pack) {
      localStorage.setItem('vroom_gears', (pack.config?.gears || 6).toString());
      localStorage.setItem('vroom_shift', (pack.config?.shiftPoint || 1.0).toString());
    }

    // Zwingt den Browser, die alten Audiodaten aus dem RAM zu werfen und die neuen sauber zu laden
    window.location.reload();
  };

  useEffect(() => {
    if (mode !== 'gps' || !engineStarted) {
      if (mode === 'manual' && engineStarted) setTargetLoad(0);
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

          let newLoad = 0.0;
          if (acceleration > 2.0) newLoad = 1.0;
          else if (acceleration > 0.5) newLoad = 0.6;
          else if (currentSpeedKmh > 5 && acceleration > -0.5) newLoad = 0.25;

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

  const displaySpeed = mode === 'gps' ? gpsSpeed : speed;

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />

      {!hasInteracted ? (
        <Box
          onClick={handleStart}
          sx={{
            height: '100vh', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', bgcolor: 'background.default',
            '&:hover': { bgcolor: '#181818' }, transition: 'background-color 0.3s'
          }}
        >
          <Typography variant="h2" sx={{ fontWeight: 900, letterSpacing: 4, mb: 2, color: 'primary.main' }}>
            VROOM
          </Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary', letterSpacing: 2, animation: `${pulseAnim} 2s infinite` }}>
            TAP ANYWHERE TO START
          </Typography>
        </Box>
      ) : (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

          {/* TESLA WORKAROUND: Echte Audio-Datei (silence.mp3) im public Ordner verhindert Stottern */}
          <audio src="/silence.mp3" loop autoPlay playsInline style={{ display: 'none' }} />

          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 3, position: 'relative' }}>
            <ToggleButtonGroup
              color="primary" value={mode} exclusive onChange={(_, newMode) => newMode && setMode(newMode)}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 20, '& .MuiToggleButton-root': { borderRadius: 20, px: 3, border: 'none' } }}
            >
              <ToggleButton value="gps">AUTO (GPS)</ToggleButton>
              <ToggleButton value="manual">MANUAL</ToggleButton>
            </ToggleButtonGroup>

            <Box sx={{ position: 'absolute', right: 24, display: 'flex', gap: 2 }}>
              <IconButton onClick={() => setSettingsOpen(true)} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}>
                <FaGear />
              </IconButton>
              <IconButton onClick={handleStop} sx={{ bgcolor: 'rgba(255,0,0,0.1)', color: '#f43f5e' }}>
                <FaPowerOff />
              </IconButton>
            </Box>
          </Box>

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Dashboard speed={displaySpeed} onStop={handleStop} />
            {mode === 'gps' && gpsError && (
              <Typography color="error" variant="body2" sx={{ mt: 2 }}>{gpsError}</Typography>
            )}
          </Box>

          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '120px' }}>
            {mode === 'manual' ? (
              <Controls targetLoad={targetLoad} setTargetLoad={setTargetLoad} />
            ) : (
              <Box sx={{ width: '100%', maxWidth: 600, textAlign: 'center', opacity: gpsError ? 0.2 : 1 }}>
                <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 2 }}>THROTTLE / LOAD</Typography>
                <LinearProgress variant="determinate" value={Math.min(100, targetLoad * 100)} sx={{ height: 6, borderRadius: 3, mt: 1, bgcolor: 'rgba(255,255,255,0.1)' }} />
              </Box>
            )}
          </Box>

          <Drawer
            anchor="right"
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            ModalProps={{ keepMounted: true }}
          >
            <Box sx={{ width: { xs: '100vw', sm: 400 }, p: 4, display: 'flex', flexDirection: 'column', gap: 4, bgcolor: 'background.paper', height: '100%' }}>
              <Typography variant="h5">Einstellungen</Typography>

              <PackSelector soundPacks={soundPacks} selectedId={selectedPackId} onChange={handlePackChange} />

              <Divider />

              <Box>
                <Typography variant="overline" color="primary">LAUTSTÄRKE</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>Gesamt-Volume ({masterVolume}%)</Typography>
                <Slider value={masterVolume} onChange={(_, v) => setMasterVolume(v as number)} />

                <Typography variant="body2" sx={{ mt: 1 }}>Motorsound ({engineVolume}%)</Typography>
                <Slider value={engineVolume} onChange={(_, v) => setEngineVolume(v as number)} />

                <Typography variant="body2" sx={{ mt: 1 }}>Spotify ({spotifyVolume}%)</Typography>
                <Slider value={spotifyVolume} onChange={(_, v) => setSpotifyVolume(v as number)} color="success" />
              </Box>

              <Divider />

              <Box>
                <Typography variant="overline" color="primary">FAHRZEUG</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>Max. Geschwindigkeit ({maxSpeed} km/h)</Typography>
                <Slider value={maxSpeed} min={100} max={400} step={10} onChange={(_, v) => setMaxSpeed(v as number)} />

                <Typography variant="body2" sx={{ mt: 1 }}>Gänge ({uiGears})</Typography>
                <Slider value={uiGears} min={1} max={10} step={1} marks onChange={(_, v) => setUiGears(v as number)} />

                <Typography variant="body2" sx={{ mt: 1 }}>Schaltpunkt ({Math.round(uiShiftPoint * 100)}% Max RPM)</Typography>
                <Slider value={uiShiftPoint} min={0.5} max={1.0} step={0.05} onChange={(_, v) => setUiShiftPoint(v as number)} />
              </Box>

              <Divider />

              <SpotifyPanel volume={effectiveSpotifyVolume} />

            </Box>
          </Drawer>

        </Box>
      )}
    </ThemeProvider>
  );
}
// src/App.tsx
import { useState, useEffect } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, Paper, Typography, Alert, Button, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { FaPowerOff, FaFolderOpen, FaSatelliteDish, FaHandPointer } from 'react-icons/fa6';
import { soundPacks } from './audio/soundManager';
import { useEngine } from './hooks/useEngine';
import { SettingsPanel } from './components/SettingsPanel';
import { PackSelector } from './components/PackSelector';
import { Dashboard } from './components/Dashboard';
import { Controls } from './components/Controls';
import { SpotifyPanel } from './components/SpotifyPanel';

const darkTheme = createTheme({
  palette: { mode: 'dark', primary: { main: '#f43f5e' } },
});

export default function App() {
  const [selectedPackId, setSelectedPackId] = useState<string>(soundPacks.length > 0 ? soundPacks[0].id : '');
  const [globalVolume, setGlobalVolume] = useState(50);
  const [maxSpeed, setMaxSpeed] = useState(300);
  const [uiGears, setUiGears] = useState(6);
  const [uiShiftPoint, setUiShiftPoint] = useState(1.0);

  const [mode, setMode] = useState<'gps' | 'manual'>('gps');
  const [gpsSpeed, setGpsSpeed] = useState<number>(0);
  const [gpsError, setGpsError] = useState<string>('');

  const { engineStarted, speed, targetLoad, setTargetLoad, startEngine, stopEngine } = useEngine(
    selectedPackId, globalVolume, maxSpeed, uiGears, uiShiftPoint
  );

  const handlePackChange = (newPackId: string) => {
    setSelectedPackId(newPackId);
    const pack = soundPacks.find(p => p.id === newPackId);
    if (pack) {
      setUiGears(pack.config?.gears || 6);
      setUiShiftPoint(pack.config?.shiftPoint || 1.0);
    }
  };

  useEffect(() => {
    if (mode !== 'gps' || !engineStarted) {
      if (mode === 'manual' && engineStarted) setTargetLoad(0);
      return;
    }

    let lastSpeedKmh = 0;
    let lastTime = Date.now();

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGpsError('');
        const currentSpeedKmh = (position.coords.speed || 0) * 3.6;
        setGpsSpeed(currentSpeedKmh);

        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt > 0) {
          const acceleration = (currentSpeedKmh - lastSpeedKmh) / dt;
          const newLoad =
            acceleration > 3 ? 1.0 :
              acceleration > 0.5 ? 0.6 :
                (currentSpeedKmh > 5 && acceleration > -1) ? 0.25 :
                  0.0;
          setTargetLoad(newLoad);
        }
        lastSpeedKmh = currentSpeedKmh;
        lastTime = now;
      },
      (error) => {
        console.error("GPS Fehler:", error);
        setGpsError("GPS Signal konnte nicht abgerufen werden. Bitte aktiviere die Standortfreigabe.");
        setTargetLoad(0);
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode, engineStarted, setTargetLoad]);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, px: 2 }}>

        {!engineStarted ? (
          <Paper elevation={6} sx={{ p: 4, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 450, width: '100%' }}>
            <Typography variant="h5" align="center" sx={{ fontWeight: 'bold' }}>
              Vroom Simulator Pro
            </Typography>

            {soundPacks.length === 0 ? (
              <Alert severity="warning" icon={<FaFolderOpen />} sx={{ borderRadius: 2 }}>
                Keine Sound-Packs gefunden!
              </Alert>
            ) : (
              <>
                <PackSelector
                  soundPacks={soundPacks}
                  selectedId={selectedPackId}
                  onChange={handlePackChange}
                />
                <SettingsPanel
                  globalVolume={globalVolume} setGlobalVolume={setGlobalVolume}
                  maxSpeed={maxSpeed} setMaxSpeed={setMaxSpeed}
                  uiGears={uiGears} setUiGears={setUiGears}
                  uiShiftPoint={uiShiftPoint} setUiShiftPoint={setUiShiftPoint}
                />
                <Button
                  variant="contained" color="primary" size="large" startIcon={<FaPowerOff />}
                  onClick={startEngine} sx={{ py: 2, borderRadius: 2, fontSize: '1.1rem', fontWeight: 'bold' }}
                >
                  Motor starten
                </Button>
              </>
            )}
          </Paper>
        ) : (
          <Paper elevation={12} sx={{ p: 4, borderRadius: 4, width: '100%', maxWidth: 500, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <ToggleButtonGroup
              color="primary"
              value={mode}
              exclusive
              onChange={(_, newMode) => newMode && setMode(newMode)}
              aria-label="Steuerungsmodus"
              fullWidth
            >
              <ToggleButton value="gps" aria-label="GPS Steuerung" sx={{ py: 1.5 }}>
                <FaSatelliteDish style={{ marginRight: 8 }} /> GPS Fahrt
              </ToggleButton>
              <ToggleButton value="manual" aria-label="Manuelle Steuerung" sx={{ py: 1.5 }}>
                <FaHandPointer style={{ marginRight: 8 }} /> Manuell / Test
              </ToggleButton>
            </ToggleButtonGroup>

            <Dashboard speed={speed} onStop={stopEngine} />

            {mode === 'manual' ? (
              <Controls targetLoad={targetLoad} setTargetLoad={setTargetLoad} />
            ) : (
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                {gpsError ? (
                  <Typography color="error" variant="body2">{gpsError}</Typography>
                ) : (
                  <>
                    <Typography variant="body1" sx={{ mb: 1, color: 'text.secondary' }}>
                      Echte Geschwindigkeit:
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      {Math.round(gpsSpeed)} <Typography component="span" variant="h6">km/h</Typography>
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.disabled' }}>
                      Fahre los, um den Motor hochzudrehen!
                    </Typography>
                  </>
                )}
              </Box>
            )}
          </Paper>
        )}

        <SpotifyPanel />

      </Box>
    </ThemeProvider>
  );
}
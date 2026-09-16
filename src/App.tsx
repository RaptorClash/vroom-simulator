import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, Typography, ToggleButtonGroup, ToggleButton, LinearProgress, IconButton, Button, TextField, Stack, Paper, Divider, Slider, Snackbar, Alert } from '@mui/material';
import { FaPowerOff, FaGear, FaLink, FaMobileScreen, FaCar, FaPause, FaPlay, FaArrowsToEye, FaVolumeHigh, FaMusic, FaGamepad } from 'react-icons/fa6';
import { QRCodeSVG } from 'qrcode.react';
import { soundPacks } from './audio/soundManager';
import { useEngine } from './hooks/useEngine';
import { useMotionSensor } from './hooks/useMotionSensor';
import type { SyncState } from './hooks/usePeer';
import { usePeer } from './hooks/usePeer';
import { Dashboard } from './components/Dashboard';
import { Controls } from './components/Controls';
import { SettingsDrawer } from './components/SettingsDrawer';

const darkTheme = createTheme({
  palette: { mode: 'dark', background: { default: '#121212', paper: '#1e1e1e' }, primary: { main: '#f43f5e' } },
  typography: { fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif' }
});

const getNum = (k: string, d: number) => { try { const v = localStorage.getItem(k); return v ? parseFloat(v) : d; } catch { return d; } };
const getStr = (k: string, d: string) => { try { const v = localStorage.getItem(k); return v ? v : d; } catch { return d; } };

export default function App() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isClientRole, setIsClientRole] = useState(false);
  const [driverSide, setDriverSide] = useState<'left' | 'right'>(() => getStr('vr_side', 'right') as 'left' | 'right');
  const [packId, setPackId] = useState(() => getStr('vr_pack', soundPacks[0]?.id || ''));
  const [masterVol, setMasterVol] = useState(() => getNum('vr_mvol', 100));
  const [engineVol, setEngineVol] = useState(() => getNum('vr_evol', 50));
  const [spotVol, setSpotVol] = useState(() => getNum('vr_svol', 50));
  const [maxSpd, setMaxSpd] = useState(() => getNum('vr_spd', 300));
  const [gears, setGears] = useState(() => getNum('vr_grs', 6));
  const [shiftPt, setShiftPt] = useState(() => getNum('vr_shft', 1.0));
  const [mode, setMode] = useState<'gps' | 'manual' | 'sensor' | 'solo'>('gps');
  const [gpsSpeed, setGpsSpeed] = useState(0);
  const [gpsError, setGpsError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const [syncedSpeed, setSyncedSpeed] = useState<number | null>(null);
  const [syncedRpm, setSyncedRpm] = useState<number | null>(null);
  const [syncedRpmRatio, setSyncedRpmRatio] = useState<number | null>(null);

  const [currentGear, setCurrentGear] = useState(1);
  const [isAutoShift, setIsAutoShift] = useState(true);

  const [remoteViewActive, setRemoteViewActive] = useState(false);

  const [snackbar, setSnackbar] = useState<{ open: boolean, msg: string, severity: 'success' | 'error' | 'warning' | 'info' }>({ open: false, msg: '', severity: 'info' });

  const [turnUrl, setTurnUrl] = useState(() => {
    try { const p = new URLSearchParams(window.location.search); if (p.has('turn')) return atob(p.get('turn')!); } catch (e) { console.error(e); } return getStr('vr_turn_url', '');
  });
  const [turnUser, setTurnUser] = useState(() => {
    try { const p = new URLSearchParams(window.location.search); if (p.has('user')) return atob(p.get('user')!); } catch (e) { console.error(e); } return getStr('vr_turn_user', '');
  });
  const [turnPass, setTurnPass] = useState(() => {
    try { const p = new URLSearchParams(window.location.search); if (p.has('pass')) return atob(p.get('pass')!); } catch (e) { console.error(e); } return getStr('vr_turn_pass', '');
  });
  const [spotifyClientId, setSpotifyClientId] = useState(() => getStr('spotify_client_id', ''));

  const isReceivingSync = useRef(false);
  const syncLockTimer = useRef<number | null>(null);

  const sensor = useMotionSensor();
  const localTrueSpeed = (mode === 'gps' || mode === 'sensor' || mode === 'solo') ? gpsSpeed : 0;

  const { engineStarted, speed, targetLoad, setTargetLoad, startEngine, stopEngine, rpm, rpmRatio } = useEngine(
    packId, isClientRole ? 0 : (masterVol / 100) * engineVol, maxSpd, gears, shiftPt, mode === 'solo' ? 'sensor' : mode, gpsSpeed, currentGear, isAutoShift
  );

  const stateRefs = useRef({ engineStarted, packId, isPaused: sensor.isPaused });
  useEffect(() => {
    stateRefs.current = { engineStarted, packId, isPaused: sensor.isPaused };
  }, [engineStarted, packId, sensor.isPaused]);

  const restartEngineSmoothly = () => {
    if (stateRefs.current.engineStarted) { stopEngine(); setIsRestarting(true); }
  };

  useEffect(() => {
    if (isRestarting) {
      const timer = setTimeout(() => { startEngine(); setIsRestarting(false); }, 400);
      return () => clearTimeout(timer);
    }
  }, [isRestarting, startEngine]);

  const showSnackbar = useCallback((msg: string, severity: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setSnackbar({ open: true, msg, severity });
  }, []);

  const handleCloseSnackbar = (_?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleIncomingSync = useCallback((state: SyncState) => {
    isReceivingSync.current = true;
    if (syncLockTimer.current) window.clearTimeout(syncLockTimer.current);

    if (state.targetLoad !== undefined) setTargetLoad(state.targetLoad);
    if (state.masterVol !== undefined) setMasterVol(state.masterVol);
    if (state.engineVol !== undefined) setEngineVol(state.engineVol);
    if (state.spotifyVol !== undefined) setSpotVol(state.spotifyVol);
    if (state.maxSpeed !== undefined) setMaxSpd(state.maxSpeed);
    if (state.gears !== undefined) setGears(state.gears);
    if (state.shiftPoint !== undefined) setShiftPt(state.shiftPoint);
    if (state.turnUrl !== undefined) setTurnUrl(state.turnUrl);
    if (state.turnUser !== undefined) setTurnUser(state.turnUser);
    if (state.turnPass !== undefined) setTurnPass(state.turnPass);
    if (state.spotifyClientId !== undefined) setSpotifyClientId(state.spotifyClientId);

    if (state.engineStarted !== undefined && state.engineStarted !== stateRefs.current.engineStarted) {
      if (state.engineStarted) startEngine(); else stopEngine();
    }
    if (state.isPaused !== undefined && state.isPaused !== stateRefs.current.isPaused) {
      sensor.togglePause();
    }
    if (state.syncedSpeed !== undefined) {
      setSyncedSpeed(state.syncedSpeed);
    }
    if (state.rpm !== undefined) setSyncedRpm(state.rpm);
    if (state.rpmRatio !== undefined) setSyncedRpmRatio(state.rpmRatio);
    if (state.packId !== undefined && state.packId !== stateRefs.current.packId) {
      setPackId(state.packId);
      restartEngineSmoothly();
    }
    if (state.currentGear !== undefined) setCurrentGear(state.currentGear);
    if (state.isAutoShift !== undefined) setIsAutoShift(state.isAutoShift);
    if (state.doCalibrate !== undefined) {
      sensor.calibrate();
    }

    syncLockTimer.current = window.setTimeout(() => { isReceivingSync.current = false; }, 50);
  }, [gears, maxSpd, shiftPt, sensor, startEngine, stopEngine]);

  const peer = usePeer(handleIncomingSync);

  const wasConnected = useRef(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttempts = useRef(0);
  const reconnectInterval = useRef<number | null>(null);

  const cancelReconnection = () => {
    if (reconnectInterval.current) {
      clearInterval(reconnectInterval.current);
      reconnectInterval.current = null;
    }
    setIsReconnecting(false);
    peer.disconnect();
    setIsClientRole(false);
    showSnackbar("Verbindungsaufbau abgebrochen.", "info");
  };

  useEffect(() => {
    if (peer.connected) {
      if (!wasConnected.current) {
        setTimeout(() => showSnackbar("Erfolgreich verbunden!", "success"), 0);
      }
      wasConnected.current = true;
      if (isReconnecting) {
        setTimeout(() => {
          setIsReconnecting(false);
          showSnackbar("Verbindung wiederhergestellt!", "success");
        }, 0);
        if (reconnectInterval.current) {
          clearInterval(reconnectInterval.current);
          reconnectInterval.current = null;
        }
      }
    } else if (wasConnected.current) {
      wasConnected.current = false;

      if (isClientRole && joinCode) {
        setTimeout(() => {
          setIsReconnecting(true);
          showSnackbar("Verbindung verloren. Versuche Reconnect...", "warning");
        }, 0);
        reconnectAttempts.current = 0;

        reconnectInterval.current = window.setInterval(() => {
          reconnectAttempts.current += 1;
          if (reconnectAttempts.current > 5) {
            cancelReconnection();
            setTimeout(() => showSnackbar("Verbindung endgültig abgebrochen. Host hat vermutlich neu geladen.", "error"), 0);
          } else {
            peer.connectToServer(joinCode);
          }
        }, 3000);
      } else {
        setTimeout(() => showSnackbar("Verbindung zum Gerät verloren.", "warning"), 0);
      }
    }
  }, [peer.connected, isClientRole, joinCode, isReconnecting, peer, showSnackbar]);

  useEffect(() => {
    if (peer.error) {
      setTimeout(() => showSnackbar(`Fehler: ${peer.error}`, "error"), 0);
    }
  }, [peer.error, showSnackbar]);

  const handleVolumeChange = (type: 'master' | 'engine' | 'spotify', newValue: number) => {
    if (type === 'master') { setMasterVol(newValue); if (peer.connected) peer.broadcastState({ masterVol: newValue }); }
    if (type === 'engine') { setEngineVol(newValue); if (peer.connected) peer.broadcastState({ engineVol: newValue }); }
    if (type === 'spotify') { setSpotVol(newValue); if (peer.connected) peer.broadcastState({ spotifyVol: newValue }); }
  };

  const handleCalibrate = () => {
    sensor.calibrate();
    if (peer.connected) {
      peer.broadcastState({ doCalibrate: Date.now() });
    }
  };

  const finalDisplaySpeed = (isClientRole && syncedSpeed !== null) ? syncedSpeed : (mode === 'manual' ? speed : localTrueSpeed);
  const absSpeed = Math.abs(finalDisplaySpeed);

  const speedPerGear = maxSpd / gears;
  const autoCalculatedGear = Math.min(gears, Math.max(1, Math.ceil(absSpeed / speedPerGear)));
  const activeGear = isAutoShift ? autoCalculatedGear : currentGear;

  const displayRpm = (isClientRole && syncedRpm !== null) ? syncedRpm : rpm;
  const displayRpmRatio = (isClientRole && syncedRpmRatio !== null) ? syncedRpmRatio : rpmRatio;

  useEffect(() => {
    if (isAutoShift || !engineStarted) return;

    const maxSpeedForCurrentGear = currentGear * speedPerGear;
    const minSpeedForCurrentGear = (currentGear - 1) * speedPerGear;

    if (absSpeed > maxSpeedForCurrentGear * 1.15 && currentGear < gears) {
      setTimeout(() => {
        const next = currentGear + 1;
        setCurrentGear(next);
        if (peer.connected) peer.broadcastState({ currentGear: next, isAutoShift: false });
      }, 0);
    }
    else if (absSpeed < minSpeedForCurrentGear * 0.8 && currentGear > 1) {
      setTimeout(() => {
        const prev = currentGear - 1;
        setCurrentGear(prev);
        if (peer.connected) peer.broadcastState({ currentGear: prev, isAutoShift: false });
      }, 0);
    }
  }, [absSpeed, currentGear, gears, speedPerGear, isAutoShift, engineStarted, peer]);

  const shiftUp = () => {
    setIsAutoShift(false);
    const minRequiredSpeed = (currentGear - 1) * speedPerGear + (speedPerGear * 0.35);

    if (currentGear < gears && absSpeed >= minRequiredSpeed) {
      const newGear = currentGear + 1;
      setCurrentGear(newGear);
      if (peer.connected) peer.broadcastState({ currentGear: newGear, isAutoShift: false });
    }
  };

  const shiftDown = () => {
    setIsAutoShift(false);
    const maxAllowedSpeedForLowerGear = ((currentGear - 1) * speedPerGear) * 1.25;

    if (currentGear > 1 && absSpeed <= maxAllowedSpeedForLowerGear) {
      const newGear = currentGear - 1;
      setCurrentGear(newGear);
      if (peer.connected) peer.broadcastState({ currentGear: newGear, isAutoShift: false });
    }
  };

  const handleAutoShiftToggle = (_: React.MouseEvent<HTMLElement>, val: string | null) => {
    if (val !== null) {
      const newAuto = val === 'auto';
      setIsAutoShift(newAuto);
      if (newAuto) setCurrentGear(autoCalculatedGear);
      if (peer.connected) peer.broadcastState({ isAutoShift: newAuto, currentGear: autoCalculatedGear });
    }
  };

  useEffect(() => {
    localStorage.setItem('vr_pack', packId);
    localStorage.setItem('vr_mvol', masterVol.toString());
    localStorage.setItem('vr_evol', engineVol.toString());
    localStorage.setItem('vr_svol', spotVol.toString());
    localStorage.setItem('vr_spd', maxSpd.toString());
    localStorage.setItem('vr_grs', gears.toString());
    localStorage.setItem('vr_shft', shiftPt.toString());
    localStorage.setItem('vr_turn_url', turnUrl);
    localStorage.setItem('vr_turn_user', turnUser);
    localStorage.setItem('vr_turn_pass', turnPass);
    localStorage.setItem('vr_side', driverSide);
    if (spotifyClientId) localStorage.setItem('spotify_client_id', spotifyClientId);

    if (peer.connected && !isReceivingSync.current) {
      peer.broadcastState({
        packId, masterVol, engineVol, spotifyVol: spotVol, maxSpeed: maxSpd,
        gears, shiftPoint: shiftPt, turnUrl, turnUser, turnPass, spotifyClientId, currentGear, isAutoShift
      });
    }
  }, [packId, masterVol, engineVol, spotVol, maxSpd, gears, shiftPt, turnUrl, turnUser, turnPass, spotifyClientId, driverSide, currentGear, isAutoShift, peer]);

  useEffect(() => {
    if (mode === 'solo' || (mode === 'sensor' && isClientRole) || (mode === 'gps' && sensor.hasPermission)) {
      setTargetLoad(sensor.load);
    }
  }, [sensor.load, mode, isClientRole, setTargetLoad, sensor.hasPermission]);

  useEffect(() => {
    if (peer.connected && isClientRole && !isReceivingSync.current) {
      peer.broadcastState({
        targetLoad: sensor.load,
        isPaused: sensor.isPaused
      });
    }
  }, [sensor.load, sensor.isPaused, peer, isClientRole]);

  useEffect(() => {
    if ((mode !== 'gps' && mode !== 'sensor' && mode !== 'solo') || !engineStarted) {
      if (mode === 'manual' && engineStarted) setTargetLoad(0);
      return;
    }
    let lastSpeedKmh = 0; let lastTime = Date.now(); const speedBuffer: number[] = [];
    const watchId = navigator.geolocation.watchPosition(
      (position: GeolocationPosition) => {
        setGpsError('');
        const rawSpeed = (position.coords.speed || 0) * 3.6;
        speedBuffer.push(rawSpeed);
        if (speedBuffer.length > 3) speedBuffer.shift();
        const currentSpeedKmh = speedBuffer.reduce((a, b) => a + b, 0) / speedBuffer.length;
        setGpsSpeed(currentSpeedKmh);

        if (mode === 'gps') {
          const now = Date.now();
          const dt = (now - lastTime) / 1000;
          if (dt >= 0.5) {
            if (!sensor.hasPermission) {
              const acceleration = (currentSpeedKmh - lastSpeedKmh) / dt;
              const newLoad = acceleration <= 0.1 ? 0.0 : acceleration > 2.0 ? 1.0 : acceleration > 0.5 ? 0.6 : 0.25;
              setTargetLoad(newLoad);
            }
            lastSpeedKmh = currentSpeedKmh; lastTime = now;
          }
        }
      },
      () => {
        setGpsError("GPS Signal konnte nicht abgerufen werden.");
        if (mode === 'gps' && !sensor.hasPermission) setTargetLoad(0);
      },
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode, engineStarted, setTargetLoad, sensor.hasPermission]);

  const speedRef = useRef(localTrueSpeed);
  const rpmStateRef = useRef({ rpm: 0, rpmRatio: 0 });

  useEffect(() => {
    speedRef.current = localTrueSpeed;
  }, [localTrueSpeed]);

  useEffect(() => {
    rpmStateRef.current = { rpm, rpmRatio };
  }, [rpm, rpmRatio]);

  const loadRef = useRef(sensor.load);
  useEffect(() => { loadRef.current = sensor.load; }, [sensor.load]);

  useEffect(() => {
    if (peer.connected && isClientRole) {
      const interval = setInterval(() => {
        if (!isReceivingSync.current) {
          peer.broadcastState({
            targetLoad: loadRef.current,
            isPaused: sensor.isPaused
          });
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [peer.connected, isClientRole, sensor.isPaused, peer]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let urlChanged = false;

    if (params.has('turn') || params.has('user') || params.has('pass')) {
      urlChanged = true;
    }

    if (params.has('spotId')) {
      try {
        const decodedSpot = atob(params.get('spotId')!);
        localStorage.setItem('spotify_client_id', decodedSpot);
        setTimeout(() => setSpotifyClientId(decodedSpot), 0);
      } catch (e) { console.error(e) }
      urlChanged = true;
    }

    if (params.has('pin')) {
      const autoPin = params.get('pin')!;
      setTimeout(() => {
        setMode('sensor');
        setJoinCode(autoPin);
        setIsClientRole(true);
        peer.connectToServer(autoPin);
      }, 300);
      urlChanged = true;
    }

    if (urlChanged) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [peer]);

  const handleStart = async () => { setHasInteracted(true); await startEngine(); };

  const toggleEngine = async () => {
    const newState = !engineStarted;
    if (engineStarted) {
      stopEngine();
    } else {
      await startEngine();
    }
    if (peer.connected) peer.broadcastState({ engineStarted: newState });
  };

  const handlePackChange = (id: string) => {
    setPackId(id);
    const pack = soundPacks.find(p => p.id === id);
    let newGears = gears; let newShiftPt = shiftPt;
    if (pack) {
      newGears = pack.config?.gears || 6;
      newShiftPt = pack.config?.shiftPoint || 1.0;
      setGears(newGears); setShiftPt(newShiftPt);
    }
    if (peer.connected) peer.broadcastState({ packId: id, gears: newGears, shiftPoint: newShiftPt });
    restartEngineSmoothly();
  };

  const isShiftUpDisabled = currentGear >= gears || absSpeed < ((currentGear - 1) * speedPerGear + (speedPerGear * 0.35));
  const isShiftDownDisabled = currentGear <= 1 || absSpeed > (((currentGear - 1) * speedPerGear) * 1.25);

  const gearControlsUI = (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3, width: '100%', maxWidth: 300, mx: 'auto' }}>
      <ToggleButtonGroup
        value={isAutoShift ? 'auto' : 'manual'}
        exclusive
        onChange={handleAutoShiftToggle}
        size="small"
        sx={{ mb: 2, bgcolor: 'background.paper' }}
      >
        <ToggleButton value="auto">Auto-Shift</ToggleButton>
        <ToggleButton value="manual">Manual</ToggleButton>
      </ToggleButtonGroup>

      <Paper sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <Button variant="outlined" size="large" onClick={shiftDown} disabled={isAutoShift ? currentGear <= 1 : isShiftDownDisabled} sx={{ fontSize: '1.5rem', minWidth: '64px', height: '64px', borderRadius: 4 }}>-</Button>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="overline" color="text.secondary">GANG</Typography>
          <Typography variant="h4" color="primary" sx={{ fontWeight: 'bold' }}>{activeGear}</Typography>
        </Box>
        <Button variant="outlined" size="large" onClick={shiftUp} disabled={isAutoShift ? currentGear >= gears : isShiftUpDisabled} sx={{ fontSize: '1.5rem', minWidth: '64px', height: '64px', borderRadius: 4 }}>+</Button>
      </Paper>
    </Box>
  );

  const showSensorButtons = mode === 'solo' || mode === 'gps' || (mode === 'sensor' && isClientRole);

  const sensorControlsUI = (
    <Stack direction="column" spacing={2} sx={{ width: '100%', alignItems: 'center' }}>
      {mode === 'sensor' && <Typography color="success.main" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}><FaLink /> Erfolgreich verbunden</Typography>}

      {showSensorButtons && (
        !sensor.hasPermission ? (
          <Button variant="contained" color="primary" size="large" fullWidth onClick={sensor.requestAccess}>Sensoren für G-Kräfte aktivieren</Button>
        ) : (
          <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
            <Button fullWidth variant="outlined" color="inherit" onClick={handleCalibrate} startIcon={<FaArrowsToEye />}>Kalibrieren</Button>
            <Button fullWidth variant={sensor.isPaused ? "contained" : "outlined"} color={sensor.isPaused ? "primary" : "inherit"} onClick={sensor.togglePause} startIcon={sensor.isPaused ? <FaPlay /> : <FaPause />}>
              {sensor.isPaused ? "Fortsetzen" : "Pausieren"}
            </Button>
          </Stack>
        )
      )}
    </Stack>
  );

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      {!hasInteracted ? (
        <Box onClick={handleStart} sx={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', '&:hover': { bgcolor: '#181818' }, transition: '0.3s' }}>
          <Typography variant="h2" sx={{ fontWeight: 900, letterSpacing: 4, mb: 2, color: 'primary.main' }}>VROOM</Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary' }}>TAP ANYWHERE TO START</Typography>
        </Box>
      ) : (
        <Box sx={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
          <audio src="/silence.mp3" loop autoPlay playsInline style={{ display: 'none' }} />

          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            px: { xs: 2, sm: 4 },
            flexDirection: driverSide === 'left' ? 'row-reverse' : 'row',
            borderBottom: '1px solid rgba(255,255,255,0.05)'
          }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, letterSpacing: 3, color: 'text.secondary', opacity: 0.5 }}>
                VROOM
              </Typography>

              {(isClientRole || mode === 'sensor' || mode === 'solo' || mode === 'gps') && (
                <ToggleButtonGroup
                  size="small"
                  value={remoteViewActive ? 'remote' : 'cockpit'}
                  exclusive
                  onChange={(_, val) => val !== null && setRemoteViewActive(val === 'remote')}
                >
                  <ToggleButton value="cockpit"><FaCar style={{ marginRight: 6 }} /> Cockpit</ToggleButton>
                  <ToggleButton value="remote"><FaGamepad style={{ marginRight: 6 }} /> Remote</ToggleButton>
                </ToggleButtonGroup>
              )}
            </Stack>

            <Stack direction="row" spacing={2}>
              <IconButton onClick={() => setSettingsOpen(true)} sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.1)' }}>
                <FaGear />
              </IconButton>
              {!remoteViewActive && (
                <IconButton
                  onClick={toggleEngine}
                  sx={{
                    bgcolor: engineStarted ? 'rgba(255,0,0,0.1)' : 'rgba(16,185,129,0.1)',
                    color: engineStarted ? '#f43f5e' : '#10b981',
                    border: engineStarted ? '1px solid rgba(244,63,94,0.2)' : '1px solid rgba(16,185,129,0.2)'
                  }}
                >
                  <FaPowerOff />
                </IconButton>
              )}
            </Stack>
          </Box>

          {remoteViewActive ? (
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 600, margin: '0 auto', width: '100%' }}>

              <Stack direction="row" spacing={2}>
                <Paper sx={{ p: 2, flex: 1, bgcolor: 'background.paper', borderRadius: 3, textAlign: 'center' }}>
                  <Typography variant="overline" color="text.secondary">Speed</Typography>
                  <Typography variant="h4" color="primary" sx={{ fontWeight: 'bold' }}>{Math.round(absSpeed)} <Typography component="span" variant="caption">km/h</Typography></Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1, bgcolor: 'background.paper', borderRadius: 3, textAlign: 'center' }}>
                  <Typography variant="overline" color="text.secondary">RPM</Typography>
                  <Typography variant="h4" color="primary" sx={{ fontWeight: 'bold' }}>{displayRpm || 0}</Typography>
                </Paper>
              </Stack>

              <Button
                variant="contained"
                size="large"
                onClick={toggleEngine}
                sx={{
                  py: 3, borderRadius: 3, fontSize: '1.2rem', fontWeight: 'bold',
                  bgcolor: engineStarted ? 'error.main' : 'success.main',
                  '&:hover': { bgcolor: engineStarted ? 'error.dark' : 'success.dark' }
                }}
                startIcon={<FaPowerOff />}
              >
                {engineStarted ? 'MOTOR AUSSCHALTEN' : 'MOTOR STARTEN'}
              </Button>

              {gearControlsUI}

              {(mode === 'solo' || mode === 'gps' || (mode === 'sensor' && peer.connected)) && (
                <Paper sx={{ p: 3, bgcolor: 'background.paper', borderRadius: 3, width: '100%' }}>
                  {sensorControlsUI}
                </Paper>
              )}

              <Paper sx={{ p: 3, bgcolor: 'background.paper', borderRadius: 3, mt: 1 }}>
                <Typography variant="overline" color="text.secondary" sx={{ mb: 2, display: 'block' }}>Audio Mixer</Typography>

                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                      <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><FaVolumeHigh /> Master</Typography>
                      <Typography variant="caption">{masterVol}%</Typography>
                    </Stack>
                    <Slider value={masterVol} onChange={(_, v) => handleVolumeChange('master', v as number)} />
                  </Box>
                  <Box>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                      <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><FaCar /> Engine</Typography>
                      <Typography variant="caption">{engineVol}%</Typography>
                    </Stack>
                    <Slider value={engineVol} onChange={(_, v) => handleVolumeChange('engine', v as number)} color="secondary" />
                  </Box>
                  <Box>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                      <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><FaMusic /> Spotify</Typography>
                      <Typography variant="caption">{spotVol}%</Typography>
                    </Stack>
                    <Slider value={spotVol} onChange={(_, v) => handleVolumeChange('spotify', v as number)} sx={{ color: '#1DB954' }} />
                  </Box>
                </Stack>
              </Paper>

            </Box>
          ) : (
            <>
              <Box sx={{ px: { xs: 2, sm: 4 }, pb: 2, pt: 2, display: 'flex', justifyContent: 'center' }}>
                <ToggleButtonGroup
                  color="primary"
                  value={mode}
                  exclusive
                  onChange={(_, m) => m && setMode(m)}
                  size="small"
                  fullWidth
                  sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    maxWidth: 600,
                    '& .MuiToggleButton-root': { py: 1, fontSize: { xs: '0.7rem', sm: '0.875rem' }, whiteSpace: 'nowrap' }
                  }}
                >
                  <ToggleButton value="gps"><FaCar style={{ marginRight: 6 }} /> AUTO</ToggleButton>
                  <ToggleButton value="manual">MANUAL</ToggleButton>
                  <ToggleButton value="sensor"><FaMobileScreen style={{ marginRight: 6 }} /> SENSOR</ToggleButton>
                  <ToggleButton value="solo">SOLO</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {mode === 'sensor' && !peer.connected && (
                <Box sx={{ display: 'flex', justifyContent: 'center', px: 3, mt: 2 }}>
                  <Paper elevation={0} sx={{ p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, maxWidth: 500, width: '100%' }}>
                    <Stack direction="column" spacing={3} sx={{ width: '100%', alignItems: 'center' }}>
                      {peer.peerId ? (
                        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <Box>
                            <Typography variant="overline" color="text.secondary">DEIN HOST-PIN</Typography>
                            <Typography variant="h3" color="primary" sx={{ letterSpacing: 8, fontWeight: 'bold' }}>{peer.peerId}</Typography>
                          </Box>

                          <Box sx={{ p: 2, bgcolor: '#ffffff', borderRadius: 2 }}>
                            <QRCodeSVG
                              value={`${window.location.origin}${window.location.pathname}?pin=${peer.peerId}`}
                              size={160}
                            />
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            Mit dem Handy scannen zum automatischen Verbinden
                          </Typography>
                        </Box>
                      ) : (
                        <Button variant="outlined" size="large" onClick={peer.hostServer} sx={{ width: '100%' }}>Als Auto (Host) starten</Button>
                      )}
                      <Divider sx={{ width: '100%' }}>ODER</Divider>
                      <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
                        <TextField fullWidth size="small" placeholder="Handy-PIN eingeben" value={joinCode} onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                        <Button variant="contained" disabled={joinCode.length < 4} onClick={() => { setIsClientRole(true); peer.connectToServer(joinCode); }}>Verbinden</Button>
                      </Stack>
                    </Stack>
                  </Paper>
                </Box>
              )}

              {(mode === 'solo' || mode === 'gps' || (mode === 'sensor' && peer.connected)) && (
                <Box sx={{ display: 'flex', justifyContent: 'center', px: 3, mt: 2 }}>
                  <Paper elevation={0} sx={{ p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, maxWidth: 500, width: '100%' }}>
                    {sensorControlsUI}
                  </Paper>
                </Box>
              )}

              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Dashboard speed={finalDisplaySpeed} onStop={toggleEngine} />
                {(mode === 'gps' || mode === 'sensor') && gpsError && (
                  <Typography color="error" variant="body2" sx={{ mt: 2 }}>{gpsError}</Typography>
                )}
              </Box>

              <Box sx={{ p: { xs: 2, sm: 4 }, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '120px', pb: { xs: 4, sm: 4 } }}>

                {gearControlsUI}

                {mode === 'manual' ? (
                  <Box sx={{ width: '100%', maxWidth: 600, textAlign: 'center' }}>
                    <Typography variant="overline" color="primary" sx={{ lineHeight: 1, fontWeight: 'bold', display: 'block', mb: 1 }}>
                      {displayRpm || 0} RPM
                    </Typography>
                    <Controls targetLoad={targetLoad} setTargetLoad={setTargetLoad} />
                  </Box>
                ) : (
                  <Box sx={{ width: '100%', maxWidth: 600, textAlign: 'center' }}>
                    <Stack sx={{ mb: 1, px: 1 }}>
                      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
                        THROTTLE / LOAD
                      </Typography>
                      <Typography variant="overline" color="primary" sx={{ lineHeight: 1, fontWeight: 'bold' }}>
                        {displayRpm || 0} RPM
                      </Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, (displayRpmRatio || 0) * 100))} sx={{ height: 8, borderRadius: 4 }} />
                    {targetLoad < 0 && <Typography color="error" variant="caption" sx={{ display: 'block', mt: 1 }}>Bremsend ({Math.round(targetLoad * -100)}%)</Typography>}
                  </Box>
                )}
              </Box>
            </>
          )}

          <SettingsDrawer
            open={settingsOpen} onClose={() => setSettingsOpen(false)}
            packId={packId} handlePackChange={handlePackChange}
            masterVol={masterVol} setMasterVol={setMasterVol}
            engineVol={engineVol} setEngineVol={setEngineVol}
            spotVol={spotVol} setSpotVol={setSpotVol}
            maxSpd={maxSpd} setMaxSpd={setMaxSpd}
            gears={gears} setGears={setGears}
            shiftPt={shiftPt} setShiftPt={setShiftPt}
            turnUrl={turnUrl} setTurnUrl={setTurnUrl}
            turnUser={turnUser} setTurnUser={setTurnUser}
            turnPass={turnPass} setTurnPass={setTurnPass}
            driverSide={driverSide} setDriverSide={setDriverSide}
            isClientRole={isClientRole}
          />

          <Snackbar
            open={snackbar.open}
            autoHideDuration={isReconnecting ? undefined : 4000}
            onClose={handleCloseSnackbar}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            <Alert
              onClose={isReconnecting ? undefined : handleCloseSnackbar}
              severity={snackbar.severity}
              sx={{ width: '100%', alignItems: 'center' }}
              action={
                isReconnecting && (
                  <Button color="inherit" size="small" onClick={cancelReconnection}>
                    ABBRECHEN
                  </Button>
                )
              }
            >
              {snackbar.msg}
            </Alert>
          </Snackbar>

        </Box>
      )}
    </ThemeProvider>
  );
}
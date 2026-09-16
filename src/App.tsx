import { useState, useEffect, useRef } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, Typography, ToggleButtonGroup, ToggleButton, LinearProgress, IconButton, Button, TextField, Stack, Paper, Divider } from '@mui/material';
import { FaPowerOff, FaGear, FaLink, FaMobileScreen, FaCar, FaPause, FaPlay, FaArrowsToEye } from 'react-icons/fa6';
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
  const { engineStarted, speed, targetLoad, setTargetLoad, startEngine, stopEngine, rpm, rpmRatio } = useEngine(
    packId, isClientRole ? 0 : (masterVol / 100) * engineVol, maxSpd, gears, shiftPt, mode === 'solo' ? 'sensor' : mode, gpsSpeed, currentGear
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

  const handleIncomingSync = (state: SyncState) => {
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
    if (state.doCalibrate !== undefined) {
      sensor.calibrate();
    }
    if (state.currentGear !== undefined) setCurrentGear(state.currentGear);

    syncLockTimer.current = window.setTimeout(() => { isReceivingSync.current = false; }, 50);
  };

  const peer = usePeer(handleIncomingSync);

  const handleCalibrate = () => {
    sensor.calibrate();
    if (peer.connected) {
      peer.broadcastState({ doCalibrate: Date.now() });
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
        gears, shiftPoint: shiftPt, turnUrl, turnUser, turnPass, spotifyClientId, currentGear
      });
    }
  }, [packId, masterVol, engineVol, spotVol, maxSpd, gears, shiftPt, turnUrl, turnUser, turnPass, spotifyClientId, driverSide, currentGear, peer]);

  useEffect(() => {
    if (mode === 'solo' || (mode === 'sensor' && isClientRole)) {
      setTargetLoad(sensor.load);
    }
  }, [sensor.load, mode, isClientRole, setTargetLoad]);

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
            const acceleration = (currentSpeedKmh - lastSpeedKmh) / dt;
            const newLoad = acceleration <= 0.1 ? 0.0 : acceleration > 2.0 ? 1.0 : acceleration > 0.5 ? 0.6 : 0.25;
            setTargetLoad(newLoad);
            lastSpeedKmh = currentSpeedKmh; lastTime = now;
          }
        }
      },
      () => { setGpsError("GPS Signal konnte nicht abgerufen werden."); if (mode === 'gps') setTargetLoad(0); },
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode, engineStarted, setTargetLoad]);


  const localDisplaySpeed = (mode === 'gps' || mode === 'sensor' || mode === 'solo') ? gpsSpeed : speed;
  const speedRef = useRef(localDisplaySpeed);
  const rpmStateRef = useRef({ rpm: 0, rpmRatio: 0 });

  useEffect(() => {
    speedRef.current = localDisplaySpeed;
  }, [localDisplaySpeed]);

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

  const finalDisplaySpeed = (isClientRole && syncedSpeed !== null) ? syncedSpeed : localDisplaySpeed;

  const displayRpm = (isClientRole && syncedRpm !== null) ? syncedRpm : rpm;
  const displayRpmRatio = (isClientRole && syncedRpmRatio !== null) ? syncedRpmRatio : rpmRatio;

  const shiftUp = () => {
    if (currentGear < gears) {
      const newGear = currentGear + 1;
      setCurrentGear(newGear);
      if (peer.connected) peer.broadcastState({ currentGear: newGear });
    }
  };

  const shiftDown = () => {
    if (currentGear > 1) {
      const newGear = currentGear - 1;
      setCurrentGear(newGear);
      if (peer.connected) peer.broadcastState({ currentGear: newGear });
    }
  };

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
            flexDirection: driverSide === 'left' ? 'row-reverse' : 'row'
          }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, letterSpacing: 3, color: 'text.secondary', opacity: 0.5 }}>
              VROOM
            </Typography>

            <Stack direction="row" spacing={2}>
              <IconButton
                onClick={() => setSettingsOpen(true)}
                sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <FaGear />
              </IconButton>

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
            </Stack>
          </Box>

          <Box sx={{ px: { xs: 2, sm: 4 }, pb: 2, display: 'flex', justifyContent: 'center' }}>
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
                '& .MuiToggleButton-root': {
                  py: 1,
                  fontSize: { xs: '0.7rem', sm: '0.875rem' },
                  whiteSpace: 'nowrap'
                }
              }}
            >
              <ToggleButton value="gps"><FaCar style={{ marginRight: 6 }} /> AUTO</ToggleButton>
              <ToggleButton value="manual">MANUAL</ToggleButton>
              <ToggleButton value="sensor"><FaMobileScreen style={{ marginRight: 6 }} /> SENSOR</ToggleButton>
              <ToggleButton value="solo">SOLO</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {(mode === 'sensor' || mode === 'solo') && (
            <Box sx={{ display: 'flex', justifyContent: 'center', px: 3, mt: 2 }}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, maxWidth: 500, width: '100%' }}>

                {mode === 'sensor' && !peer.connected && (
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
                )}

                {(mode === 'solo' || (mode === 'sensor' && peer.connected)) && (
                  <Stack direction="column" spacing={2} sx={{ width: '100%', alignItems: 'center' }}>
                    {mode === 'sensor' && <Typography color="success.main" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}><FaLink /> Erfolgreich verbunden</Typography>}

                    {(!sensor.hasPermission && (mode === 'solo' || isClientRole)) ? (
                      <Button variant="contained" color="primary" size="large" fullWidth onClick={sensor.requestAccess}>Sensoren aktivieren</Button>
                    ) : (
                      <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
                        <Button fullWidth variant="outlined" color="inherit" onClick={handleCalibrate} startIcon={<FaArrowsToEye />}>Kalibrieren</Button>
                        <Button fullWidth variant={sensor.isPaused ? "contained" : "outlined"} color={sensor.isPaused ? "primary" : "inherit"} onClick={sensor.togglePause} startIcon={sensor.isPaused ? <FaPlay /> : <FaPause />}>
                          {sensor.isPaused ? "Fortsetzen" : "Pausieren"}
                        </Button>
                      </Stack>
                    )}
                  </Stack>
                )}
              </Paper>
            </Box>
          )}

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Dashboard speed={finalDisplaySpeed} onStop={toggleEngine} />
            {(mode === 'gps' || mode === 'sensor') && gpsError && (
              <Typography color="error" variant="body2" sx={{ mt: 2 }}>{gpsError}</Typography>
            )}
          </Box>

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Dashboard speed={finalDisplaySpeed} onStop={toggleEngine} />
            {(mode === 'gps' || mode === 'sensor') && gpsError && (
              <Typography color="error" variant="body2" sx={{ mt: 2 }}>{gpsError}</Typography>
            )}
          </Box>

          <Box sx={{ p: { xs: 2, sm: 4 }, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '120px', pb: { xs: 4, sm: 4 } }}>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, mb: 3, width: '100%', maxWidth: 300 }}>
              <Button variant="outlined" size="large" onClick={shiftDown} disabled={currentGear <= 1} sx={{ fontSize: '1.5rem', minWidth: '64px', borderRadius: 3 }}>-</Button>
              <Typography variant="h4" sx={{ fontWeight: 'bold', minWidth: '100px', textAlign: 'center', color: 'primary.main' }}>
                G {currentGear}
              </Typography>
              <Button variant="outlined" size="large" onClick={shiftUp} disabled={currentGear >= gears} sx={{ fontSize: '1.5rem', minWidth: '64px', borderRadius: 3 }}>+</Button>
            </Box>

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
        </Box>
      )}
    </ThemeProvider>
  );
}
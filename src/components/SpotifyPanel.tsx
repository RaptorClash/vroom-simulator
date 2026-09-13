import { useState, useEffect, useCallback, useRef } from 'react';
import { Paper, Typography, Button, Box, CircularProgress, Alert, TextField, Avatar, IconButton } from '@mui/material';
import { FaSpotify, FaPlay, FaPause, FaForward, FaBackward } from 'react-icons/fa6';

interface Playlist {
    id: string;
    uri: string;
    name: string;
    images: { url: string }[];
    tracks: { total: number };
}

interface SpotifyTrack {
    name: string;
    album: { images: { url: string }[] };
    artists: { name: string }[];
}

interface SpotifyState {
    paused: boolean;
    track_window: { current_track: SpotifyTrack };
}

interface SpotifyPlayer {
    connect: () => Promise<boolean>;
    disconnect: () => void;
    addListener: (eventName: string, cb: (data: unknown) => void) => void;
    getCurrentState: () => Promise<SpotifyState | null>;
    previousTrack: () => Promise<void>;
    nextTrack: () => Promise<void>;
    togglePlay: () => Promise<void>;
}

declare global {
    interface Window {
        onSpotifyWebPlaybackSDKReady: () => void;
        Spotify: {
            Player: new (options: { name: string; getOAuthToken: (cb: (token: string) => void) => void; volume: number; }) => SpotifyPlayer;
        };
    }
}

const generateRandomString = (length: number) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
};

const sha256 = async (plain: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
};

const base64encode = (input: ArrayBuffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
};

export function SpotifyPanel() {
    const [clientId, setClientId] = useState<string>(() => window.localStorage.getItem("spotify_client_id") || "");
    const [inputClientId, setInputClientId] = useState<string>("");
    const [token, setToken] = useState<string | null>(() => window.localStorage.getItem("spotify_token"));
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const playerRef = useRef<SpotifyPlayer | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
    const [isPaused, setPaused] = useState<boolean>(true);

    const logout = useCallback(() => {
        setToken(null);
        setPlaylists([]);
        setSelectedPlaylist(null);
        if (playerRef.current) {
            playerRef.current.disconnect();
            playerRef.current = null;
        }
        setDeviceId(null);
        setCurrentTrack(null);
        window.localStorage.removeItem("spotify_token");
        window.localStorage.removeItem("code_verifier");
    }, []);

    const fetchPlaylists = useCallback(async (authToken: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("https://api.spotify.com/v1/me/playlists", {
                headers: { Authorization: `Bearer ${authToken}` },
            });

            if (res.status === 401) {
                logout();
                throw new Error("Token abgelaufen. Bitte neu verbinden.");
            }
            if (!res.ok) throw new Error("Fehler beim Laden der Playlists");

            const data = await res.json();
            setPlaylists(data.items || []);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Ein unbekannter Fehler ist aufgetreten.");
        } finally {
            setLoading(false);
        }
    }, [logout]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code && clientId && !window.localStorage.getItem("spotify_token")) {
            const exchangeCodeForToken = async () => {
                setLoading(true);
                const codeVerifier = window.localStorage.getItem("code_verifier");
                const redirectUri = window.location.origin + window.location.pathname;

                try {
                    const response = await fetch("https://accounts.spotify.com/api/token", {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({
                            client_id: clientId,
                            grant_type: "authorization_code",
                            code: code,
                            redirect_uri: redirectUri,
                            code_verifier: codeVerifier || "",
                        }),
                    });

                    const data = await response.json();
                    if (data.access_token) {
                        window.localStorage.setItem("spotify_token", data.access_token);
                        setToken(data.access_token);
                        window.history.replaceState({}, document.title, window.location.pathname);
                    } else {
                        setError("Authentifizierungsfehler: " + (data.error_description || data.error));
                    }
                } catch {
                    setError("Netzwerkfehler beim Token-Austausch.");
                } finally {
                    setLoading(false);
                }
            };

            setTimeout(() => {
                exchangeCodeForToken();
            }, 0);
        }
    }, [clientId]);

    useEffect(() => {
        if (token) {
            setTimeout(() => {
                fetchPlaylists(token);
            }, 0);
        }
    }, [token, fetchPlaylists]);

    useEffect(() => {
        if (!token) return;

        const initSDK = () => {
            const spotifyPlayer = new window.Spotify.Player({
                name: 'Vroom Simulator Web Player',
                getOAuthToken: (cb) => { cb(token); },
                volume: 0.5
            });

            playerRef.current = spotifyPlayer;

            spotifyPlayer.addListener('ready', (e: unknown) => {
                const { device_id } = e as { device_id: string };
                console.log('Player Ready with Device ID', device_id);
                setDeviceId(device_id);
            });

            spotifyPlayer.addListener('not_ready', (e: unknown) => {
                const { device_id } = e as { device_id: string };
                console.log('Device ID has gone offline', device_id);
                setDeviceId(null);
            });

            spotifyPlayer.addListener('player_state_changed', (state: unknown) => {
                const playerState = state as SpotifyState | null;
                if (!playerState) {
                    return;
                }
                setCurrentTrack(playerState.track_window.current_track);
                setPaused(playerState.paused);
            });

            spotifyPlayer.connect();
        };

        if (window.Spotify) {
            initSDK();
        } else {
            window.onSpotifyWebPlaybackSDKReady = initSDK;
        }

        return () => {
            if (playerRef.current) playerRef.current.disconnect();
        };
    }, [token]);

    const handleSaveClientId = () => {
        if (inputClientId.trim()) {
            const trimmed = inputClientId.trim();
            window.localStorage.setItem("spotify_client_id", trimmed);
            setClientId(trimmed);
        }
    };

    const handleResetClientId = () => {
        window.localStorage.clear();
        setClientId("");
        logout();
        setInputClientId("");
    };

    const handleLogin = async () => {
        const codeVerifier = generateRandomString(64);
        window.localStorage.setItem("code_verifier", codeVerifier);

        const hashed = await sha256(codeVerifier);
        const codeChallenge = base64encode(hashed);
        const REDIRECT_URI = window.location.origin + window.location.pathname;

        const scopes = ["playlist-read-private", "streaming", "user-read-playback-state", "user-modify-playback-state", "user-read-email", "user-read-private"];

        const authUrl = new URL("https://accounts.spotify.com/authorize");
        authUrl.search = new URLSearchParams({
            client_id: clientId,
            response_type: "code",
            redirect_uri: REDIRECT_URI,
            scope: scopes.join(" "),
            code_challenge_method: "S256",
            code_challenge: codeChallenge,
            show_dialog: "true"
        }).toString();

        window.location.href = authUrl.toString();
    };

    const playPlaylist = async (playlist: Playlist) => {
        setSelectedPlaylist(playlist);
        if (!deviceId || !token) return;

        try {
            await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ context_uri: playlist.uri })
            });
        } catch (e) {
            console.error("Konnte Playlist nicht starten:", e);
        }
    };

    return (
        <Paper elevation={12} sx={{ p: 3, borderRadius: 4, width: '100%', maxWidth: 500, mt: 3, bgcolor: '#121212' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FaSpotify size={24} color="#1DB954" />
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#fff' }}>
                        Spotify Integration
                    </Typography>
                </Box>
                {clientId && (
                    <Button size="small" variant="text" onClick={handleResetClientId} sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        Client ID zurücksetzen
                    </Button>
                )}
            </Box>

            {!clientId ? (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary', textAlign: 'left' }}>
                        Trage hier einmalig deine Spotify Client ID ein (wird im Browser gespeichert):
                    </Typography>
                    <TextField
                        fullWidth size="small" variant="outlined" placeholder="Spotify Client ID eingeben..."
                        value={inputClientId} onChange={(e) => setInputClientId(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: '#333' }, '&:hover fieldset': { borderColor: '#1DB954' }, '&.Mui-focused fieldset': { borderColor: '#1DB954' } },
                        }}
                    />
                    <Button variant="contained" fullWidth onClick={handleSaveClientId} disabled={!inputClientId.trim()} sx={{ bgcolor: '#1DB954', '&:hover': { bgcolor: '#1ed760' }, fontWeight: 'bold', color: '#000', py: 1.2 }}>
                        Client ID speichern
                    </Button>
                </Box>
            ) : !token ? (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                    {loading && <CircularProgress size={24} sx={{ mb: 2 }} />}
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                        Verbinde deinen Spotify-Account, um deine Playlists zu laden.
                    </Typography>
                    <Button variant="contained" startIcon={<FaSpotify />} onClick={handleLogin} sx={{ bgcolor: '#1DB954', '&:hover': { bgcolor: '#1ed760' }, fontWeight: 'bold', color: '#000', py: 1.5 }}>
                        Mit Spotify verbinden
                    </Button>
                </Box>
            ) : (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                        <Button size="small" variant="outlined" color="error" onClick={logout}>
                            Abmelden
                        </Button>
                    </Box>

                    {loading && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 2 }} />}
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, textAlign: 'center' }}>
                        {currentTrack ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                <Avatar src={currentTrack.album.images[0]?.url} variant="rounded" sx={{ width: 80, height: 80, boxShadow: 3 }} />
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mt: 1, lineHeight: 1.2 }}>{currentTrack.name}</Typography>
                                <Typography variant="body2" color="text.secondary">{currentTrack.artists.map(a => a.name).join(', ')}</Typography>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                                    <IconButton onClick={() => playerRef.current?.previousTrack()} sx={{ color: 'white' }}>
                                        <FaBackward />
                                    </IconButton>
                                    <IconButton onClick={() => playerRef.current?.togglePlay()} sx={{ bgcolor: '#1DB954', color: 'black', '&:hover': { bgcolor: '#1ed760' } }}>
                                        {isPaused ? <FaPlay /> : <FaPause />}
                                    </IconButton>
                                    <IconButton onClick={() => playerRef.current?.nextTrack()} sx={{ color: 'white' }}>
                                        <FaForward />
                                    </IconButton>
                                </Box>
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                {deviceId ? "Player bereit! Wähle eine Playlist oder starte die Wiedergabe auf dem Handy." : "Verbinde Player..."}
                            </Typography>
                        )}
                    </Box>

                    <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary', textAlign: 'left' }}>
                        Deine Playlists ({playlists.length}):
                    </Typography>

                    {playlists.length > 0 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 220, overflowY: 'auto', pr: 1 }}>
                            {playlists.map((playlist) => (
                                <Box
                                    key={playlist.id}
                                    onClick={() => playPlaylist(playlist)}
                                    sx={{
                                        p: 1.5, borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, transition: 'all 0.2s',
                                        bgcolor: selectedPlaylist?.id === playlist.id ? 'rgba(29, 185, 84, 0.2)' : 'background.default',
                                        border: selectedPlaylist?.id === playlist.id ? '1px solid #1DB954' : '1px solid transparent',
                                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)' }
                                    }}
                                >
                                    {playlist.images?.[0]?.url && (
                                        <img src={playlist.images[0].url} alt={playlist.name} style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                                    )}
                                    <Box sx={{ overflow: 'hidden', textAlign: 'left' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                            {playlist.name}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                            {playlist.tracks?.total || 0} Titel
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>
            )}
        </Paper>
    );
}
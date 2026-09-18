import { useState, useEffect, useCallback, useRef } from 'react';
import { Typography, Button, Box, CircularProgress, Alert, TextField, Avatar, IconButton } from '@mui/material';
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

interface WebPlaybackReadyParams {
    device_id: string;
}

interface SpotifyPlayer {
    connect: () => Promise<boolean>;
    disconnect: () => void;
    addListener(eventName: 'ready' | 'not_ready', cb: (data: WebPlaybackReadyParams) => void): void;
    addListener(eventName: 'player_state_changed', cb: (state: SpotifyState | null) => void): void;
    getCurrentState: () => Promise<SpotifyState | null>;
    previousTrack: () => Promise<void>;
    nextTrack: () => Promise<void>;
    togglePlay: () => Promise<void>;
    setVolume: (volume: number) => Promise<void>;
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

interface SpotifyPanelProps {
    volume: number;
    isClientRole: boolean;
}

export function SpotifyPanel({ volume, isClientRole }: SpotifyPanelProps) {
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

    const [isPlayerReady, setIsPlayerReady] = useState(false);

    const hasFetchedToken = useRef<boolean>(false);

    const logout = useCallback(() => {
        setToken(null);
        setPlaylists([]);
        setSelectedPlaylist(null);
        setIsPlayerReady(false);
        if (playerRef.current) {
            playerRef.current.disconnect();
            playerRef.current = null;
        }
        setDeviceId(null);
        setCurrentTrack(null);
        window.localStorage.removeItem("spotify_token");
        window.localStorage.removeItem("code_verifier");
        window.history.replaceState({}, document.title, window.location.pathname);
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

        if (code && clientId && !token && !hasFetchedToken.current) {
            hasFetchedToken.current = true;
            window.history.replaceState({}, document.title, window.location.pathname);

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
                    } else {
                        setError("Authentifizierungsfehler: " + (data.error_description || data.error));
                    }
                } catch {
                    setError("Netzwerkfehler beim Token-Austausch.");
                } finally {
                    setLoading(false);
                }
            };

            exchangeCodeForToken();
        }
    }, [clientId, token]);

    useEffect(() => {
        if (token) {
            setTimeout(() => { fetchPlaylists(token); }, 0);
        }
    }, [token, fetchPlaylists]);

    useEffect(() => {
        if (!token) return;

        const initSDK = () => {
            if (playerRef.current) return;

            const spotifyPlayer = new window.Spotify.Player({
                name: 'Vroom Simulator Web Player',
                getOAuthToken: (cb) => { cb(token); },
                volume: isClientRole ? 0 : volume
            });

            playerRef.current = spotifyPlayer;

            spotifyPlayer.addListener('ready', (data: WebPlaybackReadyParams) => {
                console.log('Player Ready with Device ID', data.device_id);
                setDeviceId(data.device_id);
                setIsPlayerReady(true);
                setError(null);

                spotifyPlayer.setVolume(isClientRole ? 0 : volume).catch(console.error);
            });

            spotifyPlayer.addListener('not_ready', (data: WebPlaybackReadyParams) => {
                console.log('Device ID has gone offline', data.device_id);
                setIsPlayerReady(false);
                setDeviceId(null);
            });

            spotifyPlayer.addListener('player_state_changed', (state: SpotifyState | null) => {
                if (!state) return;

                const track = state.track_window.current_track;
                setCurrentTrack(track);
                setPaused(state.paused);

                if ('mediaSession' in navigator && track) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: track.name,
                        artist: track.artists?.map(a => a.name).join(', ') || 'Unbekannter Künstler',
                        album: 'Spotify',
                        artwork: track.album?.images?.map(img => ({
                            src: img.url,
                            sizes: '512x512',
                            type: 'image/jpeg'
                        })) || []
                    });
                }
            });

            spotifyPlayer.connect();
        };

        if (window.Spotify) {
            initSDK();
        } else {
            window.onSpotifyWebPlaybackSDKReady = initSDK;
        }

        return () => {
            setIsPlayerReady(false);
            if (playerRef.current) playerRef.current.disconnect();
            playerRef.current = null;
        };
    }, [token]);

    useEffect(() => {
        if (playerRef.current && isPlayerReady) {
            playerRef.current.setVolume(isClientRole ? 0 : volume).catch(console.error);
        }
    }, [volume, isClientRole, isPlayerReady]);

    useEffect(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => {
                playerRef.current?.togglePlay();
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                playerRef.current?.togglePlay();
            });

            navigator.mediaSession.setActionHandler('previoustrack', () => {
                playerRef.current?.previousTrack();
            });

            navigator.mediaSession.setActionHandler('nexttrack', () => {
                playerRef.current?.nextTrack();
            });
        }

        return () => {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.setActionHandler('play', null);
                navigator.mediaSession.setActionHandler('pause', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
                navigator.mediaSession.setActionHandler('nexttrack', null);
            }
        };
    }, []);

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

        const scopes = ["playlist-read-private", "playlist-read-collaborative", "streaming", "user-read-playback-state", "user-modify-playback-state", "user-read-email", "user-read-private"];

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
        if (!deviceId || !token) {
            setError("Player ist noch nicht bereit.");
            return;
        }

        setError(null);

        try {
            const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ context_uri: playlist.uri })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (errData.error?.reason === "PREMIUM_REQUIRED") {
                    setError("Spotify Premium wird für diesen Player benötigt.");
                } else {
                    setError(`Wiedergabe-Fehler: ${errData.error?.message || res.status}`);
                }
            }
        } catch (e) {
            console.error("Konnte Playlist nicht starten:", e);
            setError("Netzwerkfehler beim Starten der Wiedergabe.");
        }
    };

    return (
        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FaSpotify size={24} color="#1DB954" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Spotify
                    </Typography>
                </Box>
                {clientId && (
                    <Button size="small" variant="text" onClick={handleResetClientId} sx={{ color: 'text.secondary', fontSize: '0.70rem' }}>
                        ID Reset
                    </Button>
                )}
            </Box>

            {!clientId ? (
                <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                    <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                        Trage hier einmalig deine Spotify Client ID ein:
                    </Typography>
                    <TextField
                        fullWidth size="small" variant="outlined" placeholder="Client ID..."
                        value={inputClientId} onChange={(e) => setInputClientId(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: '#333' }, '&:hover fieldset': { borderColor: '#1DB954' }, '&.Mui-focused fieldset': { borderColor: '#1DB954' } },
                        }}
                    />
                    <Button variant="contained" fullWidth onClick={handleSaveClientId} disabled={!inputClientId.trim()} sx={{ bgcolor: '#1DB954', '&:hover': { bgcolor: '#1ed760' }, color: '#000', fontWeight: 'bold' }}>
                        Speichern
                    </Button>
                </Box>
            ) : !token ? (
                <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, textAlign: 'center' }}>
                    {loading && <CircularProgress size={24} sx={{ mb: 2 }} />}
                    {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.75rem' }}>{error}</Alert>}
                    <Button variant="contained" startIcon={<FaSpotify />} onClick={handleLogin} sx={{ bgcolor: '#1DB954', '&:hover': { bgcolor: '#1ed760' }, color: '#000', fontWeight: 'bold' }}>
                        Mit Spotify verbinden
                    </Button>
                </Box>
            ) : (
                <Box>
                    <Box sx={{ mb: 2, p: 2, bgcolor: 'rgba(29, 185, 84, 0.1)', borderRadius: 2, border: '1px solid rgba(29, 185, 84, 0.2)' }}>
                        {currentTrack ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Avatar src={currentTrack.album?.images?.[0]?.url} variant="rounded" sx={{ width: 56, height: 56 }} />
                                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                        {currentTrack.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'block' }}>
                                        {currentTrack.artists?.map(a => a.name).join(', ') || 'Unbekannter Künstler'}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    <IconButton size="small" onClick={() => playerRef.current?.previousTrack()} sx={{ color: 'white' }}>
                                        <FaBackward size={14} />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => playerRef.current?.togglePlay()} sx={{ color: '#1DB954' }}>
                                        {isPaused ? <FaPlay size={18} /> : <FaPause size={18} />}
                                    </IconButton>
                                    <IconButton size="small" onClick={() => playerRef.current?.nextTrack()} sx={{ color: 'white' }}>
                                        <FaForward size={14} />
                                    </IconButton>
                                </Box>
                            </Box>
                        ) : (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                                {deviceId ? "Player bereit! Wähle eine Playlist." : "Verbinde Player..."}
                            </Typography>
                        )}
                    </Box>

                    {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.75rem', wordBreak: 'break-word' }}>{error}</Alert>}

                    <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, overflow: 'hidden' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', height: 280 }}>
                            <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>Deine Playlists</Typography>
                                <Typography variant="caption" sx={{ color: '#1DB954', cursor: 'pointer' }} onClick={logout}>Abmelden</Typography>
                            </Box>
                            <Box sx={{ flex: 1, overflowY: 'auto', p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {loading ? (
                                    <CircularProgress size={20} sx={{ m: 'auto' }} />
                                ) : (
                                    playlists.map((playlist) => (
                                        <Box
                                            key={playlist.id}
                                            onClick={() => playPlaylist(playlist)}
                                            sx={{
                                                p: 1, borderRadius: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5,
                                                bgcolor: selectedPlaylist?.id === playlist.id ? 'rgba(29, 185, 84, 0.2)' : 'transparent',
                                                border: selectedPlaylist?.id === playlist.id ? '1px solid #1DB954' : '1px solid transparent',
                                                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' }
                                            }}
                                        >
                                            {playlist.images?.[0]?.url ? (
                                                <Avatar src={playlist.images[0].url} variant="rounded" sx={{ width: 40, height: 40 }} />
                                            ) : (
                                                <Box sx={{ width: 40, height: 40, bgcolor: '#333', borderRadius: 1 }} />
                                            )}
                                            <Box sx={{ overflow: 'hidden' }}>
                                                <Typography variant="body2" sx={{ color: '#fff', fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                    {playlist.name}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                                                    {playlist.tracks?.total || 0} Titel
                                                </Typography>
                                            </Box>
                                        </Box>
                                    ))
                                )}
                            </Box>
                        </Box>
                    </Box>
                </Box>
            )}
        </Box>
    );
}
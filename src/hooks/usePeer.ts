import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

export type SyncState = {
    targetLoad?: number;
    packId?: string;
    masterVol?: number;
    engineVol?: number;
    spotifyVol?: number;
    maxSpeed?: number;
    gears?: number;
    shiftPoint?: number;
};

export type PeerStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'error'
    | 'disconnected';

const PEER_PREFIX = 'vroom-';

const PEER_CONFIG = {
    config: {
        iceServers: [
            {
                urls: 'stun:stun.l.google.com:19302',
            },
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10,
        sdpSemantics: 'unified-plan',
    },
    debug: 1,
};

const CONNECTION_TIMEOUT = 15_000;

/**
 * Kleine WebRTC-/ICE-Diagnose.
 *
 * Zeigt in der Browser-Konsole:
 * - ICE Gathering State
 * - ICE Connection State
 * - RTCPeerConnection State
 * - gefundene ICE-Kandidaten (host / srflx / relay)
 * - den erfolgreichen ICE-Pfad inklusive RTT
 */
function attachIceDiagnostics(conn: DataConnection) {
    let attempts = 0;

    const attach = () => {
        attempts += 1;

        const rtc = (
            conn as DataConnection & {
                peerConnection?: RTCPeerConnection;
            }
        ).peerConnection;

        // PeerJS erstellt die RTCPeerConnection eventuell erst kurz nach
        // dem Anlegen der DataConnection.
        if (!rtc) {
            if (attempts < 10) {
                window.setTimeout(attach, 100);
            } else {
                console.warn(
                    '[Vroom] ICE-Diagnose: RTCPeerConnection nicht gefunden'
                );
            }

            return;
        }

        const logState = () => {
            console.log('[Vroom] ICE:', {
                gathering: rtc.iceGatheringState,
                connection: rtc.iceConnectionState,
                peerConnection: rtc.connectionState,
            });
        };

        rtc.addEventListener('icegatheringstatechange', logState);
        rtc.addEventListener('iceconnectionstatechange', logState);
        rtc.addEventListener('connectionstatechange', logState);

        rtc.addEventListener('icecandidate', (event) => {
            if (!event.candidate) {
                console.log(
                    '[Vroom] ICE: Kandidatensammlung abgeschlossen'
                );
                return;
            }

            const type =
                event.candidate.type ||
                event.candidate.candidate.match(/ typ ([a-z0-9]+)/)?.[1] ||
                'unknown';

            console.log('[Vroom] ICE-Kandidat:', {
                type,
                protocol: event.candidate.protocol,
                address: event.candidate.address ?? 'versteckt',
                port: event.candidate.port,
            });
        });

        rtc.addEventListener('iceconnectionstatechange', async () => {
            if (
                rtc.iceConnectionState !== 'connected' &&
                rtc.iceConnectionState !== 'completed'
            ) {
                return;
            }

            try {
                const stats = await rtc.getStats();

                stats.forEach((report) => {
                    if (
                        report.type === 'candidate-pair' &&
                        report.state === 'succeeded' &&
                        report.nominated
                    ) {
                        console.log('[Vroom] ICE-Pfad gewählt:', {
                            localCandidateId: report.localCandidateId,
                            remoteCandidateId: report.remoteCandidateId,
                            currentRoundTripTime:
                                report.currentRoundTripTime,
                        });
                    }
                });
            } catch (err) {
                console.warn(
                    '[Vroom] ICE-Stats konnten nicht gelesen werden:',
                    err
                );
            }
        });

        rtc.addEventListener('icecandidateerror', (event) => {
            const iceError = event as RTCPeerConnectionIceErrorEvent;

            console.error('[Vroom] ICE-Server-Fehler:', {
                url: iceError.url,
                errorCode: iceError.errorCode,
                errorText: iceError.errorText,
                address: iceError.address,
                port: iceError.port,
            });
        });

        console.log('[Vroom] ICE-Diagnose aktiviert');

        // Zustand direkt beim Start einmal ausgeben.
        logState();
    };

    attach();
}

export function usePeer(
    onStateReceived: (state: SyncState) => void
) {
    const [peerId, setPeerId] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const [status, setStatus] = useState<PeerStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const peerRef = useRef<Peer | null>(null);
    const connRef = useRef<DataConnection | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const callbackRef = useRef(onStateReceived);

    useEffect(() => {
        callbackRef.current = onStateReceived;
    }, [onStateReceived]);

    const clearConnectionTimeout = useCallback(() => {
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const startConnectionTimeout = useCallback(() => {
        clearConnectionTimeout();

        timeoutRef.current = window.setTimeout(() => {
            setConnected(false);
            setStatus('error');
            setError(
                'Die WebRTC-Verbindung konnte nicht aufgebaut werden. ' +
                'Direkte P2P-Verbindungen und der TURN-Fallback sind fehlgeschlagen.'
            );
        }, CONNECTION_TIMEOUT);
    }, [clearConnectionTimeout]);

    const setupConnection = useCallback(
        (conn: DataConnection) => {
            if (connRef.current && connRef.current !== conn) {
                try {
                    connRef.current.close();
                } catch {
                    // ignorieren
                }
            }

            connRef.current = conn;

            setStatus('connecting');
            setError(null);

            // ICE-Diagnose aktivieren.
            attachIceDiagnostics(conn);

            startConnectionTimeout();

            conn.on('open', () => {
                clearConnectionTimeout();

                setConnected(true);
                setStatus('connected');
                setError(null);

                console.log(
                    '[Vroom] WebRTC DataConnection geöffnet'
                );
            });

            conn.on('data', (data) => {
                try {
                    callbackRef.current(data as SyncState);
                } catch (err) {
                    console.error(
                        '[Vroom] Fehler beim Verarbeiten von Daten:',
                        err
                    );
                }
            });

            conn.on('close', () => {
                clearConnectionTimeout();

                setConnected(false);
                setStatus('disconnected');

                console.log(
                    '[Vroom] Verbindung geschlossen'
                );
            });

            conn.on('error', (err) => {
                clearConnectionTimeout();

                setConnected(false);
                setStatus('error');
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Fehler bei der WebRTC-Verbindung.'
                );

                console.error(
                    '[Vroom] DataConnection-Fehler:',
                    err
                );
            });
        },
        [clearConnectionTimeout, startConnectionTimeout]
    );

    const hostServer = useCallback(() => {
        if (peerRef.current) {
            try {
                peerRef.current.destroy();
            } catch {
                // ignorieren
            }

            peerRef.current = null;
        }

        setConnected(false);
        setStatus('connecting');
        setError(null);
        setPeerId(null);

        const id = Math.floor(
            1000 + Math.random() * 9000
        ).toString();

        const peer = new Peer(
            `${PEER_PREFIX}${id}`,
            PEER_CONFIG
        );

        peer.on('open', (openedId) => {
            const cleanId = openedId.replace(
                PEER_PREFIX,
                ''
            );

            setPeerId(cleanId);
            setStatus('idle');
            setError(null);

            console.log(
                '[Vroom] Host gestartet:',
                openedId
            );
        });

        peer.on('connection', (conn) => {
            console.log(
                '[Vroom] Host: eingehende Verbindung von:',
                conn.peer
            );

            setupConnection(conn);
        });

        peer.on('disconnected', () => {
            setConnected(false);
            setStatus('disconnected');

            console.log(
                '[Vroom] Host: PeerServer getrennt'
            );
        });

        peer.on('error', (err) => {
            clearConnectionTimeout();

            setConnected(false);
            setStatus('error');

            let message =
                'Unbekannter PeerJS-Fehler.';

            switch (err.type) {
                case 'unavailable-id':
                    message =
                        'Die generierte Sitzungs-ID ist bereits vergeben. Bitte erneut versuchen.';
                    break;

                case 'network':
                    message =
                        'Netzwerkfehler beim Starten der Verbindung.';
                    break;

                default:
                    message =
                        err.message || message;
                    break;
            }

            setError(message);

            console.error(
                '[Vroom] Host-Fehler:',
                err
            );
        });

        peerRef.current = peer;
    }, [
        clearConnectionTimeout,
        setupConnection,
    ]);

    const connectToServer = useCallback(
        (id: string) => {
            const cleanId = id.trim();

            if (!/^\d{4}$/.test(cleanId)) {
                setError(
                    'Der Vroom-Code muss aus 4 Ziffern bestehen.'
                );
                setStatus('error');
                return;
            }

            if (peerRef.current) {
                try {
                    peerRef.current.destroy();
                } catch {
                    // ignorieren
                }

                peerRef.current = null;
            }

            if (connRef.current) {
                try {
                    connRef.current.close();
                } catch {
                    // ignorieren
                }

                connRef.current = null;
            }

            setConnected(false);
            setStatus('connecting');
            setError(null);
            setPeerId(cleanId);

            const peer = new Peer(
                PEER_CONFIG
            );

            peer.on('open', () => {
                console.log(
                    '[Vroom] Client bereit, verbinde mit Host:',
                    cleanId
                );

                const conn = peer.connect(
                    `${PEER_PREFIX}${cleanId}`,
                    {
                        reliable: true,
                    }
                );

                setupConnection(conn);
            });

            peer.on('disconnected', () => {
                setConnected(false);
                setStatus('disconnected');

                console.log(
                    '[Vroom] Client: PeerServer getrennt'
                );
            });

            peer.on('close', () => {
                setConnected(false);
                setStatus('disconnected');
            });

            peer.on('error', (err) => {
                clearConnectionTimeout();

                setConnected(false);
                setStatus('error');

                let message =
                    'Unbekannter PeerJS-Fehler.';

                switch (err.type) {
                    case 'peer-unavailable':
                        message =
                            'Der Vroom-Code wurde nicht gefunden. Prüfe, ob der Host noch verbunden ist.';
                        break;

                    case 'network':
                        message =
                            'Netzwerkfehler beim Verbindungsaufbau.';
                        break;

                    default:
                        message =
                            err.message || message;
                        break;
                }

                setError(message);

                console.error(
                    '[Vroom] Client-Fehler:',
                    err
                );
            });

            peerRef.current = peer;
        },
        [
            clearConnectionTimeout,
            setupConnection,
        ]
    );

    const broadcastState = useCallback(
        (state: SyncState) => {
            const connection = connRef.current;

            if (
                !connection ||
                !connection.open
            ) {
                return;
            }

            try {
                connection.send(state);
            } catch (err) {
                console.error(
                    '[Vroom] Fehler beim Senden:',
                    err
                );
            }
        },
        []
    );

    useEffect(() => {
        return () => {
            clearConnectionTimeout();

            if (connRef.current) {
                try {
                    connRef.current.close();
                } catch {
                    // ignorieren
                }
            }

            if (peerRef.current) {
                try {
                    peerRef.current.destroy();
                } catch {
                    // ignorieren
                }
            }
        };
    }, [clearConnectionTimeout]);

    return {
        peerId,
        connected,
        status,
        error,
        hostServer,
        connectToServer,
        broadcastState,
    };
}

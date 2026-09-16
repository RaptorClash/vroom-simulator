import { useState, useEffect, useCallback } from 'react';
import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';

export interface SyncState {
    targetLoad?: number;
    isPaused?: boolean;
    masterVol?: number;
    engineVol?: number;
    spotifyVol?: number;
    maxSpeed?: number;
    gears?: number;
    shiftPoint?: number;
    turnUrl?: string;
    turnUser?: string;
    turnPass?: string;
    spotifyClientId?: string;
    engineStarted?: boolean;
    syncedSpeed?: number;
    packId?: string;
    doCalibrate?: number;
    rpm?: number;
    rpmRatio?: number;
    currentGear?: number;
    isAutoShift?: boolean;
}

export function usePeer(onIncomingSync: (state: SyncState) => void) {
    const [peer, setPeer] = useState<Peer | null>(null);
    const [peerId, setPeerId] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connection, setConnection] = useState<DataConnection | null>(null);

    const getIceServers = (): RTCIceServer[] => {
        const iceServers: RTCIceServer[] = [
            { urls: 'stun:stun.l.google.com:19302' }
        ];

        const turnUrl = localStorage.getItem('vr_turn_url');
        const turnUser = localStorage.getItem('vr_turn_user');
        const turnPass = localStorage.getItem('vr_turn_pass');

        if (turnUrl && turnUser && turnPass) {
            const urls = turnUrl.includes(',') ? turnUrl.split(',').map(u => u.trim()) : [turnUrl.trim()];

            iceServers.push({
                urls: urls,
                username: turnUser.trim(),
                credential: turnPass.trim()
            });
            console.log('[Vroom] Verwende benutzerdefinierten TURN-Server:', urls);
        } else {
            console.log('[Vroom] Kein TURN-Server konfiguriert, nutze nur STUN.');
        }

        return iceServers;
    };

    const hostServer = useCallback(() => {
        try {
            const id = 'vroom-' + Math.floor(1000 + Math.random() * 9000).toString();

            const newPeer = new Peer(id, {
                config: { iceServers: getIceServers() },
                debug: 2
            });

            newPeer.on('open', (id) => {
                console.log('[Vroom] Host gestartet:', id);
                setPeerId(id.replace('vroom-', ''));
            });

            newPeer.on('connection', (conn: DataConnection) => {
                console.log('[Vroom] Host: eingehende Verbindung von:', conn.peer);
                conn.on('open', () => {
                    console.log('[Vroom] Datenkanal ist jetzt offen zu:', conn.peer);
                    setConnection(conn);
                    setConnected(true);
                });
                conn.on('data', (data: unknown) => {
                    onIncomingSync(data as SyncState);
                });
                conn.on('close', () => {
                    setConnected(false);
                    setConnection(null);
                });
            });

            newPeer.on('error', (err: Error & { type?: string }) => {
                setError((err.type || err.name) + ': ' + err.message);
            });

            setPeer(newPeer);
        } catch {
            setError("Fehler beim Starten des Hosts.");
        }
    }, [onIncomingSync]);

    const connectToServer = useCallback((pin: string) => {
        if (!pin) return;
        try {
            const fullId = 'vroom-' + pin;

            const newPeer = new Peer({
                config: { iceServers: getIceServers() },
                debug: 2
            });

            newPeer.on('open', () => {
                const conn = newPeer.connect(fullId);
                conn.on('open', () => {
                    console.log('[Vroom] Client: Verbunden mit Host');
                    setConnection(conn);
                    setConnected(true);
                });
                conn.on('data', (data: unknown) => {
                    onIncomingSync(data as SyncState);
                });
                conn.on('close', () => {
                    setConnected(false);
                    setConnection(null);
                });
            });

            newPeer.on('error', (err: Error & { type?: string }) => {
                setError((err.type || err.name) + ': ' + err.message);
            });

            setPeer(newPeer);
        } catch {
            setError("Fehler bei der Verbindung.");
        }
    }, [onIncomingSync]);

    const broadcastState = useCallback((state: SyncState) => {
        if (connection && connected) {
            connection.send(state);
        }
    }, [connection, connected]);

    const disconnect = useCallback(() => {
        if (connection) connection.close();
        if (peer) peer.destroy();

        setConnection(null);
        setConnected(false);
        setPeerId(null);
        setError(null);
    }, [connection, peer]);

    useEffect(() => {
        return () => {
            if (peer) peer.destroy();
        };
    }, [peer]);

    return { hostServer, connectToServer, broadcastState, disconnect, peerId, connected, error };
}
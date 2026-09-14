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

export function usePeer(onStateReceived: (state: SyncState) => void) {
    const [peerId, setPeerId] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const peerRef = useRef<Peer | null>(null);
    const connRef = useRef<DataConnection | null>(null);

    const hostServer = () => {
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        const peer = new Peer(`vroom-${id}`);

        peer.on('open', (id) => setPeerId(id.replace('vroom-', '')));

        peer.on('connection', (conn) => {
            connRef.current = conn;
            setConnected(true);

            conn.on('data', (data) => onStateReceived(data as SyncState));
            conn.on('close', () => setConnected(false));
        });

        peerRef.current = peer;
    };

    const connectToServer = (id: string) => {
        const peer = new Peer();
        peer.on('open', () => {
            const conn = peer.connect(`vroom-${id}`);
            connRef.current = conn;

            conn.on('open', () => {
                setConnected(true);
                setPeerId(id);
            });

            conn.on('data', (data) => onStateReceived(data as SyncState));
            conn.on('close', () => setConnected(false));
        });
        peerRef.current = peer;
    };

    const broadcastState = useCallback((state: SyncState) => {
        if (connRef.current && connRef.current.open) {
            connRef.current.send(state);
        }
    }, []);

    useEffect(() => {
        return () => {
            peerRef.current?.destroy();
        };
    }, []);

    return { peerId, connected, hostServer, connectToServer, broadcastState };
}
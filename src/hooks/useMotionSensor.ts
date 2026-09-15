import { useState, useEffect, useCallback, useRef } from 'react';

export function useMotionSensor() {
    const [hasPermission, setHasPermission] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [load, setLoad] = useState(0);

    const baselineRef = useRef<number | null>(null);

    const requestAccess = async () => {
        const DeviceOrientation = window.DeviceOrientationEvent as unknown as {
            requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
        };

        if (typeof DeviceOrientation.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientation.requestPermission();
                if (permission === 'granted') {
                    setHasPermission(true);
                } else {
                    alert('Sensor-Zugriff verweigert.');
                }
            } catch (error) {
                console.error(error);
            }
        } else {
            setHasPermission(true);
        }
    };

    const calibrate = useCallback(() => {
        baselineRef.current = null;
        setLoad(0);
    }, []);

    const togglePause = useCallback(() => {
        setIsPaused(p => !p);
        setLoad(0);
    }, []);

    useEffect(() => {
        if (!hasPermission || isPaused) {
            return;
        }

        const handleOrientation = (event: DeviceOrientationEvent) => {
            const pitch = event.beta;
            if (pitch === null) return;

            if (baselineRef.current === null) {
                baselineRef.current = pitch;
                setLoad(0);
                return;
            }

            const diff = baselineRef.current - pitch;

            const maxTilt = 30;
            let calculatedLoad = diff / maxTilt;

            calculatedLoad = Math.max(-1, Math.min(1, calculatedLoad));

            if (Math.abs(calculatedLoad) < 0.1) {
                calculatedLoad = 0;
            }

            setLoad(calculatedLoad);
        };

        window.addEventListener('deviceorientation', handleOrientation);
        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, [hasPermission, isPaused]);

    return { hasPermission, requestAccess, load, calibrate, isPaused, togglePause };
}
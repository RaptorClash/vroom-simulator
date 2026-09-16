import { useState, useEffect, useCallback, useRef } from 'react';

export function useMotionSensor() {
    const [hasPermission, setHasPermission] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [load, setLoad] = useState(0);

    const baselineRef = useRef<number | null>(null);
    
    const tiltLoadRef = useRef(0);
    const accelLoadRef = useRef(0);

    const requestAccess = async () => {
        const DeviceOrientation = window.DeviceOrientationEvent as unknown as {
            requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
        };

        if (typeof DeviceOrientation.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientation.requestPermission();
                if (permission === 'granted') {
                    
                    const DeviceMotion = window.DeviceMotionEvent as unknown as {
                        requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
                    };
                    if (typeof DeviceMotion.requestPermission === 'function') {
                        await DeviceMotion.requestPermission();
                    }
                    
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
        tiltLoadRef.current = 0;
        accelLoadRef.current = 0;
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
                tiltLoadRef.current = 0;
                return;
            }

            const diff = pitch - baselineRef.current;
            const maxTilt = 30;
            let calculatedLoad = diff / maxTilt;

            calculatedLoad = Math.max(-1, Math.min(1, calculatedLoad));

            if (Math.abs(calculatedLoad) < 0.05) {
                calculatedLoad = 0;
            }

            tiltLoadRef.current = calculatedLoad;
            updateCombinedLoad();
        };

        const handleMotion = (event: DeviceMotionEvent) => {
            const accelX = event.acceleration?.x || 0;
            const accelY = event.acceleration?.y || 0;
            const accelZ = event.acceleration?.z || 0;

            const rawAccel = Math.sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ);
            
            const effectiveAccel = rawAccel > 0.5 ? rawAccel : 0;
            
            const targetAccelLoad = Math.min(1.0, effectiveAccel / 4.0);
            
            accelLoadRef.current += (targetAccelLoad - accelLoadRef.current) * 0.15;
            updateCombinedLoad();
        };

        const updateCombinedLoad = () => {
            let finalLoad = tiltLoadRef.current;
            
            if (accelLoadRef.current > Math.abs(tiltLoadRef.current)) {
                finalLoad = accelLoadRef.current;
            }

            setLoad(finalLoad);
        };

        window.addEventListener('deviceorientation', handleOrientation);
        window.addEventListener('devicemotion', handleMotion);

        return () => {
            window.removeEventListener('deviceorientation', handleOrientation);
            window.removeEventListener('devicemotion', handleMotion);
        };
    }, [hasPermission, isPaused]);

    return { hasPermission, requestAccess, load, calibrate, isPaused, togglePause };
}
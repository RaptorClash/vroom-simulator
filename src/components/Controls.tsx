import { Stack, Button } from '@mui/material';
import { FaPause, FaForward, FaGaugeHigh, FaBackward } from 'react-icons/fa6';

interface ControlsProps {
  targetLoad: number;
  setTargetLoad: (val: number) => void;
}

export function Controls({ targetLoad, setTargetLoad }: ControlsProps) {
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap' }} spacing={2}>
      <Button
        variant={targetLoad === 0 ? "contained" : "outlined"}
        onMouseDown={() => setTargetLoad(0)}
        onTouchStart={() => setTargetLoad(0)}
        sx={{ flex: '1 1 40%' }} startIcon={<FaPause />}
      >
        Standgas
      </Button>
      <Button
        variant={targetLoad === 0.3 ? "contained" : "outlined"} color="success"
        onMouseDown={() => setTargetLoad(0.3)}
        onTouchStart={() => setTargetLoad(0.3)}
        sx={{ flex: '1 1 40%' }} startIcon={<FaForward />}
      >
        Cruisen (30%)
      </Button>
      <Button
        variant={targetLoad === 1 ? "contained" : "outlined"} color="warning"
        onMouseDown={() => setTargetLoad(1)}
        onTouchStart={() => setTargetLoad(1)}
        onMouseUp={() => setTargetLoad(0)}
        onMouseLeave={() => setTargetLoad(0)}
        sx={{ flex: '1 1 40%' }} startIcon={<FaGaugeHigh />}
      >
        Vollgas (Hold)
      </Button>
      <Button
        variant={targetLoad === -1 ? "contained" : "outlined"} color="error"
        onMouseDown={() => setTargetLoad(-1)}
        onTouchStart={() => setTargetLoad(-1)}
        onMouseUp={() => setTargetLoad(0)}
        sx={{ flex: '1 1 40%' }} startIcon={<FaBackward />}
      >
        Bremsen (Hold)
      </Button>
    </Stack>
  );
}
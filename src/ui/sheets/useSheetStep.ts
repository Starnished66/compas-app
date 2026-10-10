import { useState } from 'react';

export function useSheetStep<Step extends string>(visible: boolean, firstStep: Step, onOpen?: () => void) {
  const [step, setStep] = useState<Step>(firstStep);
  const [wasVisible, setWasVisible] = useState(visible);
  const [openCount, setOpenCount] = useState(0);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStep(firstStep);
      setOpenCount((count) => count + 1);
      onOpen?.();
    }
  }

  return { step, setStep, sheetKey: `sheet-${openCount}` };
}

import { useSimpleModeContext, SIMPLE_MODE_TABS } from '@/contexts/SimpleModeContext';

export const useSimpleMode = () => {
  return useSimpleModeContext();
};

export { SIMPLE_MODE_TABS };

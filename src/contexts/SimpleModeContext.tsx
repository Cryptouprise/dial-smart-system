import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface SimpleModeContextType {
  isSimpleMode: boolean;
  toggleMode: () => void;
  setSimpleMode: (value: boolean) => void;
  onModeChange: (callback: (isSimple: boolean) => void) => () => void;
}

const SimpleModeContext = createContext<SimpleModeContextType | undefined>(undefined);

const STORAGE_KEY = 'smart-dialer-simple-mode';

// Pilot-focused tabs. Simple Mode intentionally excludes unready contact paths;
// users can still reach the complete product from Full Mode.
export const SIMPLE_MODE_TABS = [
  'command-center',
  'launch-readiness',
  'leads',
  'autonomous-agent',
  'campaign-results',
  'settings',
  // Simple Mode defaults to ON for first-time users, so the two tabs a brand-new
  // account must be able to reach have to live here too. Without 'onboarding'
  // the first-run redirect into the setup wizard was bounced straight back to
  // command-center — for exactly the users who needed the wizard.
  'onboarding',
  'plan-billing',
] as const;

export const SimpleModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isSimpleMode, setIsSimpleMode] = useState(() => {
    // Default to simple mode for first-time users
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return true; // Default to simple mode
    }
    return saved === 'true';
  });

  const [listeners] = useState<Set<(isSimple: boolean) => void>>(new Set());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isSimpleMode));
  }, [isSimpleMode]);

  const toggleMode = useCallback(() => {
    setIsSimpleMode(prev => {
      const newValue = !prev;
      // Notify all listeners
      listeners.forEach(cb => cb(newValue));
      return newValue;
    });
  }, [listeners]);

  const setSimpleMode = useCallback((value: boolean) => {
    setIsSimpleMode(value);
    listeners.forEach(cb => cb(value));
  }, [listeners]);

  const onModeChange = useCallback((callback: (isSimple: boolean) => void) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, [listeners]);

  return (
    <SimpleModeContext.Provider value={{ isSimpleMode, toggleMode, setSimpleMode, onModeChange }}>
      {children}
    </SimpleModeContext.Provider>
  );
};

export const useSimpleModeContext = () => {
  const context = useContext(SimpleModeContext);
  if (context === undefined) {
    throw new Error('useSimpleModeContext must be used within a SimpleModeProvider');
  }
  return context;
};

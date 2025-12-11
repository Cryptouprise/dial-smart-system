import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface SimpleModeContextType {
  isSimpleMode: boolean;
  toggleMode: () => void;
  setSimpleMode: (value: boolean) => void;
  onModeChange: (callback: (isSimple: boolean) => void) => () => void;
}

const SimpleModeContext = createContext<SimpleModeContextType | undefined>(undefined);

const STORAGE_KEY = 'smart-dialer-simple-mode';

// Simple mode tabs - used for redirect logic
export const SIMPLE_MODE_TABS = ['overview', 'broadcast', 'predictive', 'sms', 'campaign-results'];

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

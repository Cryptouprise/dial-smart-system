import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SimpleModeContextType {
  isSimpleMode: boolean;
  toggleMode: () => void;
  setSimpleMode: (value: boolean) => void;
}

const SimpleModeContext = createContext<SimpleModeContextType | undefined>(undefined);

const STORAGE_KEY = 'smart-dialer-simple-mode';

export const SimpleModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isSimpleMode, setIsSimpleMode] = useState(() => {
    // Default to simple mode for first-time users
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return true; // Default to simple mode
    }
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isSimpleMode));
  }, [isSimpleMode]);

  const toggleMode = () => {
    setIsSimpleMode(prev => !prev);
  };

  const setSimpleMode = (value: boolean) => {
    setIsSimpleMode(value);
  };

  return (
    <SimpleModeContext.Provider value={{ isSimpleMode, toggleMode, setSimpleMode }}>
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

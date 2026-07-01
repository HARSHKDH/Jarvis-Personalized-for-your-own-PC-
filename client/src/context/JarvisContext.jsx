import { createContext, useContext } from 'react';
import { useJarvis } from '../hooks/useJarvis';

const JarvisContext = createContext(null);

export const JarvisProvider = ({ children }) => {
  const jarvis = useJarvis();
  return (
    <JarvisContext.Provider value={jarvis}>
      {children}
    </JarvisContext.Provider>
  );
};

export const useJarvisContext = () => {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error('useJarvisContext must be used within JarvisProvider');
  return ctx;
};

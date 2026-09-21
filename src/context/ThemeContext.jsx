import { createContext, useContext, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('bo_theme', 'light');
  const [textSize, setTextSize] = useLocalStorage('bo_text', 'normal'); // normal | large

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#120d24' : '#f6f4fb');
  }, [theme]);

  useEffect(() => { document.documentElement.setAttribute('data-text', textSize); }, [textSize]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const toggleTextSize = () => setTextSize((t) => (t === 'large' ? 'normal' : 'large'));
  return <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark', textSize, toggleTextSize, isLargeText: textSize === 'large' }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

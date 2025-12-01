import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes, defaultThemeName, setLegacyTheme } from './theme';

const THEME_STORAGE_KEY = 'talepify.theme';

const ThemeContext = createContext({
  theme: themes[defaultThemeName],
  themeName: defaultThemeName,
  setThemeName: () => {},
  isDark: true,
});

export const ThemeProvider = ({ children }) => {
  const systemScheme = Appearance.getColorScheme();
  const systemDefault = systemScheme === 'dark' ? 'dark' : 'light';
  const [themeName, setThemeNameState] = useState(defaultThemeName || systemDefault);

  // Load persisted theme
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') {
          setThemeNameState(stored);
        } else if (!defaultThemeName && systemDefault) {
          setThemeNameState(systemDefault);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [systemDefault]);

  // Persist changes
  const setThemeName = useCallback(async (next) => {
    try {
      const value = typeof next === 'function' ? next(themeName) : next;
      if (value === 'dark' || value === 'light') {
        setThemeNameState(value);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, value);
      }
    } catch (e) {
      // ignore
    }
  }, [themeName]);

  const theme = useMemo(() => themes[themeName] || themes[defaultThemeName], [themeName]);
  const isDark = themeName === 'dark';

  // Manage status bar automatically
  useEffect(() => {
    StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content');
    // Sync legacy export for components still importing { theme }
    setLegacyTheme(theme);
  }, [theme, isDark]);

  const value = useMemo(() => ({ theme, themeName, setThemeName, isDark }), [theme, themeName, setThemeName, isDark]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;



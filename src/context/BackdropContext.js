import React, { createContext, useContext, useMemo, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Portal } from 'react-native-paper';
import { useTheme } from '../theme/ThemeContext';

const BackdropContext = createContext({
  showBackdrop: (_opts) => {},
  hideBackdrop: () => {},
});

export const BackdropProvider = ({ children }) => {
  const { theme, isDark } = useTheme();
  const opacityRef = useRef(new Animated.Value(0));
  const colorRef = useRef(isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.22)');

  // Sync default color with theme changes (unless explicitly overridden via showBackdrop)
  React.useEffect(() => {
    colorRef.current = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.22)';
  }, [isDark]);

  const showBackdrop = ({
    toOpacity = 1,
    duration = 180,
    color,
  } = {}) => {
    if (color) {
      colorRef.current = color;
    }
    try { opacityRef.current.stopAnimation?.(); } catch {}
    Animated.timing(opacityRef.current, {
      toValue: toOpacity,
      duration,
      useNativeDriver: true,
    }).start();
  };

  const hideBackdrop = ({ duration = 50 } = {}) => {
    try { opacityRef.current.stopAnimation?.(); } catch {}
    Animated.timing(opacityRef.current, {
      toValue: 0,
      duration,
      useNativeDriver: true,
    }).start();
  };

  const value = useMemo(() => ({ showBackdrop, hideBackdrop }), []);

  return (
    <BackdropContext.Provider value={value}>
      {children}
      {/* Global backdrop rendered via Portal (beneath native Modal content) */}
      <Portal>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: colorRef.current,
              opacity: opacityRef.current,
            },
          ]}
        />
      </Portal>
    </BackdropContext.Provider>
  );
};

export const useBackdrop = () => useContext(BackdropContext);



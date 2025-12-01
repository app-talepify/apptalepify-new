import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import GradientBandingFree from './GradientBandingFree';

const GlassmorphismView = ({
  children,
  style,
  borderRadius = 20,
  blurEnabled = true,
  config = {},
  borderWidth = 0,       // Yeni prop
  borderColor = 'transparent', // Yeni prop
  width: propWidth,
  height: propHeight,
}) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const defaultConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 255, 255, 0.07)',
    startColor: 'rgb(255, 255, 255)',
    endColor: 'rgba(255, 255, 255, 0)',
    gradientAlpha: 0.9,
    gradientType: 'linear',
    gradientDirection: 45,
    gradientCenter: { x: 0.5, y: 0.5 },
    gradientRadius: 0.5,
    gradientSpread: 7.0,
    ditherStrength: 2.0,
  }), []);

  const finalConfig = useMemo(() => ({ ...defaultConfig, ...config }), [defaultConfig, config]);

  const onLayout = (event) => {
    // Eğer width ve height prop olarak gelmediyse onLayout kullan
    if (propWidth === undefined || propHeight === undefined) {
      const { width, height } = event.nativeEvent.layout;
      setSize({ width, height });
    }
  };

  const renderWidth = propWidth !== undefined ? propWidth : size.width;
  const renderHeight = propHeight !== undefined ? propHeight : size.height;

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderWidth,  // Stile eklendi
          borderColor,  // Stile eklendi
        },
        style,
      ]}
      onLayout={onLayout}
    >
      {blurEnabled && (
        <BlurView
          style={styles.absolute}
          blurType="light"
          blurAmount={15}
          reducedTransparencyFallbackColor="white"
          overlayColor={finalConfig.overlayColor}
        />
      )}
      {renderWidth > 0 && renderHeight > 0 && (
        <GradientBandingFree
          width={renderWidth}
          height={renderHeight}
          start={finalConfig.startColor}
          end={finalConfig.endColor}
          alpha={finalConfig.gradientAlpha}
          type={finalConfig.gradientType}
          direction={finalConfig.gradientDirection}
          center={finalConfig.gradientCenter}
          radius={finalConfig.gradientRadius}
          spread={finalConfig.gradientSpread / 10}
          ditherStrength={finalConfig.ditherStrength}
          style={styles.absolute}
        />
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  absolute: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default GlassmorphismView;

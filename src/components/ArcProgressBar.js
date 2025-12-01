import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';

const ArcProgressBar = ({
  size = 100,
  strokeWidth = 12,
  progress = 0,
  activeColor = '#2ecc71',
  inactiveColor = '#ecf0f1',
  children,
}) => {
  const radius = (size - strokeWidth) / 2;
  const rect = useMemo(
    () => ({ x: strokeWidth / 2, y: strokeWidth / 2, width: radius * 2, height: radius * 2 }),
    [strokeWidth, radius],
  );
  const startAngle = 180;
  const sweepAngle = 180;

  // Memoize background and foreground paths for render optimization
  const backgroundPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addArc(rect, startAngle, sweepAngle);
    return path;
  }, [rect, startAngle, sweepAngle]);

  const clampedProgress = Math.max(0, Math.min(progress, 100));
  const progressSweepAngle = sweepAngle * (clampedProgress / 100);
  const foregroundPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addArc(rect, startAngle, progressSweepAngle);
    return path;
  }, [rect, startAngle, progressSweepAngle]);

  const componentHeight = size / 2 + strokeWidth / 2;

  return (
    <View style={{ width: size, height: componentHeight }}>
      <Canvas style={styles.canvas}>
        <Path
          path={backgroundPath}
          color={inactiveColor}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
        />
        {/* Render foreground arc only if progress > 0 */}
        {clampedProgress > 0 && (
          <Path
            path={foregroundPath}
            color={activeColor}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
          />
        )}
      </Canvas>
      <View style={styles.contentContainerWithFullHeight}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
  contentContainerWithFullHeight: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
});

ArcProgressBar.propTypes = {
  size: PropTypes.number,
  strokeWidth: PropTypes.number,
  progress: PropTypes.number,
  activeColor: PropTypes.string,
  inactiveColor: PropTypes.string,
  children: PropTypes.node,
};

export default ArcProgressBar;

import React from 'react';
import { View } from 'react-native';
import MapboxPool from './providers/MapboxPool';
import { MAPBOX_PUBLIC_TOKEN, MAPBOX_STYLE_URL } from '@env';

/**
 * Unified Pool Map Component - Uses Mapbox only
 * Props: { center, zoom, pins, onPinPress, enableDraw, drawnPolygon, drawingPoints, onPolygonComplete, styleURL, onMapLoaded }
 */
const UnifiedPoolMap = React.forwardRef(({
  center,
  zoom,
  pins,
  onPinPress,
  viewedPortfolios,
  viewedCounter,
  currentUserId,
  enableDraw = false,
  drawnPolygon,
  drawingPoints = [],
  onPolygonComplete,
  styleURL,
  cancelToken,
  onCameraChanged,
  onMapLoaded,
  initialInstant = false,
  enable3D = false,
  pitch = 0,
  heading = 0,
  userLocation = null,
  onMapPress,
}, ref) => {
  // .env dosyasından Mapbox token ve style URL oku
  const token = MAPBOX_PUBLIC_TOKEN;
  const styleUrl = styleURL || MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/streets-v12';

  // React.memo comparison fonksiyonuna güveniyoruz, useMemo gereksiz
  const commonProps = {
    center,
    zoom,
    pins,
    onPinPress,
    viewedPortfolios,
    viewedCounter,
    currentUserId,
    enableDraw,
    drawnPolygon,
    onPolygonComplete,
    enable3D,
    pitch,
    heading,
    userLocation,
    onMapPress,
  };

  return (
    <View style={{ flex: 1 }}>
      <MapboxPool
        ref={ref}
        {...commonProps}
        accessToken={token}
        styleURL={styleUrl}
        drawingPoints={drawingPoints}
        cancelToken={cancelToken}
        onCameraChanged={onCameraChanged}
        onMapLoaded={onMapLoaded}
        initialInstant={initialInstant}
      />
    </View>
  );
});

UnifiedPoolMap.displayName = 'UnifiedPoolMap';

export default UnifiedPoolMap;



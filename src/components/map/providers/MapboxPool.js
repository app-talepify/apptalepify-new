import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, Animated, Platform } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLE_URL } from '@env';

const MapboxPool = React.forwardRef(({ 
  accessToken,
  styleURL,
  center,
  zoom = 12,
  pins = [],
  onPinPress,
  viewedPortfolios,
  viewedCounter = 0,
  currentUserId,
  enableDraw = false,
  drawnPolygon,
  drawingPoints = [],
  onPolygonComplete,
  onInitError,
  onCameraChanged,
  onMapLoaded,
  enable3D = false,
  pitch = 0,
  heading = 0,
  userLocation = null,
  initialInstant = false,
  onMapPress,
}, ref) => {
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [innerBoxGeo, setInnerBoxGeo] = useState(null);
  const [showLocationTooltip, setShowLocationTooltip] = useState(false);
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const wasDrawingRef = useRef(enableDraw);

  // Resolve access token and style URL from props or env
  const effectiveAccessToken = accessToken || MAPBOX_ACCESS_TOKEN || '';
  const resolvedStyleURL = typeof styleURL === 'string' && styleURL.length > 0 ? styleURL : (MAPBOX_STYLE_URL || styleURL);

  // Init
  useEffect(() => {
    try {
      if (effectiveAccessToken) {
        MapboxGL.setAccessToken(effectiveAccessToken);
      } else if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[MapboxPool] Mapbox access token missing');
      }
      MapboxGL.setTelemetryEnabled(false);
    } catch (e) {
      onInitError && onInitError(e);
    }
  }, [effectiveAccessToken, onInitError]);

  // Map yüklendiğinde parent'a bildir
  useEffect(() => {
    if (mapLoaded && onMapLoaded) {
      onMapLoaded();
    }
  }, [mapLoaded, onMapLoaded]);

  // Türkiye dışındaki alanı maskelemek için GeoJSON
  const turkeyMaskGeoJson = useMemo(() => {
    // Dünya koordinatları (dış çerçeve)
    const worldBounds = [
      [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
    ];
    
    // Türkiye sınırları (iç delik - basitleştirilmiş)
    const turkeyBounds = [
      [25.5, 35.8], // Güneybatı
      [44.8, 35.8], // Güneydoğu
      [44.8, 42.1], // Kuzeydoğu
      [25.5, 42.1], // Kuzeybatı
      [25.5, 35.8], // Kapalı polygon
    ];

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          // İlk array dış sınır, ikinci array iç delik (Türkiye)
          coordinates: [worldBounds, turkeyBounds],
        },
        properties: {},
      }],
    };
  }, []);

  const pinsGeoJson = useMemo(() => {
    const validPins = pins.filter((p) => {
      return p && p.coordinates &&
             !Number.isNaN(Number(p.coordinates.longitude)) &&
             !Number.isNaN(Number(p.coordinates.latitude));
    });

    const features = validPins.map((p, idx) => {
      const coords = [Number(p.coordinates.longitude), Number(p.coordinates.latitude)];
      const isViewed = viewedPortfolios && viewedPortfolios.has && viewedPortfolios.has(p.id);
      // Listing tipi tespiti: önce status'tan çıkar, yoksa listingType alanını kullan
      const statusStr = String(p.listingStatus || '').toLowerCase();
      const inferredFromStatus = statusStr.includes('sat') ? 'Satılık' : (statusStr.includes('kira') ? 'Kiralık' : '');
      const normalizedType = p.listingType || inferredFromStatus;
      const isForSale = normalizedType === 'Satılık';
      const isForRent = normalizedType === 'Kiralık';
      const isOwnPortfolio = currentUserId && (p.userId === currentUserId || p.ownerId === currentUserId);
      const isOwnForSale = isOwnPortfolio && isForSale; // Kullanıcının kendi satılık portföyü
      const isOwnForRent = isOwnPortfolio && isForRent; // Kullanıcının kendi kiralık portföyü

      const hasMatch = !!p.hasMatch;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: {
          id: String(p.id ?? idx),
          title: p.title || 'Portföy',
          isForSale: isForSale ? 1 : 0,
          isViewed: isViewed ? 1 : 0,
          isOwnForSale: isOwnForSale ? 1 : 0, // Kullanıcının kendi satılık portföyü için özel pin
          isOwnForRent: isOwnForRent ? 1 : 0, // Kullanıcının kendi kiralık portföyü için özel pin
          hasMatch: hasMatch ? 1 : 0,
        },
      };
    });

    return {
      type: 'FeatureCollection',
      features: features,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, viewedCounter, viewedPortfolios, currentUserId]); // viewedCounter force update için gerekli

  // enableDraw true->false geçişinde polygonu tamamla (artık parent kontrol ediyor)
  useEffect(() => {
    wasDrawingRef.current = enableDraw;
  }, [enableDraw]);

  // Her kamera hareketi sonrası sınırları kontrol et
  const checkAndClampCamera = useCallback(async () => {
    try {
      if (!mapRef.current) return;
      
      const mapCenter = await mapRef.current.getCenter();
      if (!mapCenter || !mapCenter[0] || !mapCenter[1]) return;
      
      const [lng, lat] = mapCenter;
      
      // Türkiye sınırları - 3D için çok geniş
      const minLng = 25.5, maxLng = 44.8, minLat = 35.8, maxLat = 42.1;
      
      // Sınır kontrolü
      const needsClamp = lng < minLng || lng > maxLng || lat < minLat || lat > maxLat;
      
      if (needsClamp && cameraRef.current) {
        // Sınırların içine çek
        const clampedLng = Math.max(minLng, Math.min(maxLng, lng));
        const clampedLat = Math.max(minLat, Math.min(maxLat, lat));
        
        cameraRef.current.setCamera({
          centerCoordinate: [clampedLng, clampedLat],
          animationDuration: 200,
          mode: 'easeTo',
        });
      }
    } catch (error) {
      // Silent fail
    }
  }, []);

  const handleSymbolPress = useCallback((e) => {
    try {
      const feature = e?.features?.[0];
      if (!feature) return;
      const id = feature.properties?.id;
      const matched = pins.find((p, idx) => String(p.id ?? idx) === String(id));
      matched && onPinPress && onPinPress(matched);
    } catch {}
  }, [pins, onPinPress]);

  const handleMapPress = useCallback((e) => {
    // Haritaya tıklama olayını dışarıya bildir
    if (onMapPress) {
      onMapPress(e);
    }
    
    // Mevcut konum pinine tıklama kontrolü
    if (userLocation && e && e.geometry && e.geometry.coordinates) {
      const [lng, lat] = e.geometry.coordinates;
      const [userLng, userLat] = userLocation;
      
      // Konum pinine yakın tıklama kontrolü (50 metre tolerans)
      const distance = Math.sqrt(
        Math.pow(lng - userLng, 2) + Math.pow(lat - userLat, 2)
      );
      
      if (distance < 0.0005) { // Yaklaşık 50 metre
        handleLocationPinPress();
      }
    }
  }, [userLocation, handleLocationPinPress, onMapPress]);

  // Konum pinine tıklama handler'ı
  const tooltipTimeoutRef = useRef(null);

  const handleLocationPinPress = useCallback(() => {
    setShowLocationTooltip(true);
    
    // Fade in animasyonu
    Animated.timing(tooltipOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // 3 saniye sonra otomatik kapat
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    tooltipTimeoutRef.current = setTimeout(() => {
      // Fade out animasyonu
      Animated.timing(tooltipOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setShowLocationTooltip(false);
      });
    }, 3000);
  }, [tooltipOpacity]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  // Expose mapRef and cameraRef to parent via forwardRef
  React.useImperativeHandle(ref, () => ({
    getMapRef: () => mapRef.current,
    getCameraRef: () => cameraRef.current,
    setCamera: (config) => {
      if (cameraRef.current) {
        cameraRef.current.setCamera(config);
      }
    },
    getCoordinateFromView: (point) => {
      if (mapRef.current) {
        return mapRef.current.getCoordinateFromView(point);
      }
      return Promise.reject(new Error('Map not ready'));
    },
    showLocationTooltip: () => {
      handleLocationPinPress();
    },
  }), [handleLocationPinPress]);

  return (
    <View style={{ flex: 1 }}>
      <MapboxGL.MapView
        ref={mapRef}
        style={{ flex: 1 }}
        styleURL={resolvedStyleURL}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        pitchEnabled={enable3D}
        rotateEnabled={enable3D}
        renderWorldCopies={false}
        scrollEnabled={true}
        zoomEnabled={true}
        zoomTapEnabled={true}
        // iOS jestürlerinin daha akıcı algılanması için
        // zoom/pan hızlarını doğal his verecek şekilde iyileştir
        // (RNMapbox native varsayılanları kullanır; transform uygulanmadığında daha akıcıdır)
        localizeLabels={Platform.OS === 'ios' ? { locale: 'en-US' } : true}
        onDidFinishLoadingMap={() => setMapLoaded(true)}
        onPress={handleMapPress}
        onMapIdle={async () => {
          try {
            let center = null, zoom = null, pitchVal = null, headingVal = null;
            if (mapRef.current) {
              try { center = await mapRef.current.getCenter(); } catch {}
              try { zoom = await mapRef.current.getZoom(); } catch {}
              try { pitchVal = await mapRef.current.getPitch(); } catch {}
              try { headingVal = await mapRef.current.getDirection(); } catch {}
            }
            onCameraChanged && onCameraChanged({
              centerCoordinate: center,
              zoomLevel: zoom,
              pitch: pitchVal,
              heading: headingVal,
            });
            checkAndClampCamera();
          } catch {}
        }}
        maxBounds={[
          [25.5, 35.8],  // Southwest: [lng, lat] - 3D için çok genişletildi
          [44.8, 42.1],  // Northeast: [lng, lat] - 3D için çok genişletildi
        ]}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={center}
          zoomLevel={zoom}
          pitch={enable3D ? pitch : 0}
          heading={heading}
          animationDuration={initialInstant ? 0 : 250}
          animationMode={initialInstant ? 'immediate' : 'easeTo'}
          minZoomLevel={5.5}
          maxZoomLevel={20}
          allowUpdates={true}
        />

        {/* 3D Buildings layer - shown when 3D is enabled */}
        {enable3D && styleURL && styleURL.includes('streets') && (
          <MapboxGL.FillExtrusionLayer
            id="3d-buildings"
            sourceID="composite"
            sourceLayerID="building"
            filter={['==', 'extrude', 'true']}
            style={{
              fillExtrusionColor: [
                'interpolate',
                ['linear'],
                ['get', 'height'],
                0, '#e0e0e0',
                50, '#999999',
                100, '#666666',
              ],
              fillExtrusionHeight: ['get', 'height'],
              fillExtrusionBase: ['get', 'min_height'],
              fillExtrusionOpacity: 0.6,
              fillExtrusionVerticalGradient: true,
            }}
          />
        )}

        {/* Drawn polygon overlay */}
        {drawnPolygon && (
          <MapboxGL.ShapeSource
            id="drawn-poly"
            shape={{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [drawnPolygon] }, properties: {} }}
          >
            <MapboxGL.FillLayer id="drawn-poly-fill" style={{ fillColor: 'rgba(220, 20, 60, 0.25)' }} />
            <MapboxGL.LineLayer id="drawn-poly-line" style={{ lineColor: '#DC143C', lineWidth: 3 }} />
          </MapboxGL.ShapeSource>
        )}

        {/* Active drawing line - shown while user is drawing */}
        {drawingPoints.length > 1 && (
          <MapboxGL.ShapeSource
            id="active-drawing-line"
            shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: drawingPoints }, properties: {} }}
          >
            <MapboxGL.LineLayer 
              id="active-drawing-line-layer" 
              style={{ 
                lineColor: '#E31E24', 
                lineWidth: 5, 
                lineOpacity: 1.0,
                lineCap: 'round',
                lineJoin: 'round',
              }} 
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Türkiye Dışı Alan Maskesi - Sadece Türkiye görünsün */}
        <MapboxGL.ShapeSource
          id="turkey-mask"
          shape={turkeyMaskGeoJson}
        >
          <MapboxGL.FillLayer
            id="turkey-mask-fill"
            style={{
              fillColor: '#85d7ff', // Özel deniz mavisi
              fillOpacity: 1.0, // %100 opak - Türkiye dışı tamamen kapalı
            }}
          />
        </MapboxGL.ShapeSource>

        {/* Pin Images - Satılık, Kiralık ve Kullanıcının Kendi Portföyleri ikonları */}
        <MapboxGL.Images
          images={{
            'pin-satilik': require('../../../assets/images/icons/spin.png'),
            'pin-kiralik': require('../../../assets/images/icons/kpin.png'),
            'pin-own-satilik': require('../../../assets/images/icons/smypin.png'),
            'pin-own-kiralik': require('../../../assets/images/icons/kmypin.png'),
            'user-location-pin': require('../../../assets/images/icons/ppin.png'),
            'pin-match-star': require('../../../assets/images/icons/star.png'),
          }}
        />

        {/* Kullanıcının mevcut konumu - ppin.png ikonu */}
        {userLocation && (
          <MapboxGL.ShapeSource
            id="user-location"
            shape={{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: userLocation },
              properties: {},
            }}
          >
            <MapboxGL.SymbolLayer
              id="user-location-icon"
              style={{
                iconImage: 'user-location-pin',
                iconSize: 0.12,
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
                iconPitchAlignment: 'viewport',
                iconRotationAlignment: 'viewport',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        

        {/* Pin layer - Görüntülenen pinler soluklaşır (inner box dışı cluster) */}
        <MapboxGL.ShapeSource 
          key={`pins-source-${viewedCounter}`}
          id="pins"
          shape={pinsGeoJson}
          cluster={false}
          onPress={handleSymbolPress}
        >
          
          <MapboxGL.SymbolLayer
            key={`pins-layer-${viewedCounter}`}
            id="pin-icons"
            filter={["!", ["has", "point_count"]]}
            style={{
              iconImage: [
                'case',
                ['==', ['get', 'isOwnForSale'], 1],
                'pin-own-satilik', // Kullanıcının kendi satılık portföyü için özel pin
                ['==', ['get', 'isOwnForRent'], 1],
                'pin-own-kiralik', // Kullanıcının kendi kiralık portföyü için özel pin
                ['==', ['get', 'isForSale'], 1],
                'pin-satilik', // Normal satılık portföyler
                'pin-kiralik', // Normal kiralık portföyler
              ],
              iconSize: [
                'case',
                ['==', ['get', 'isViewed'], 1],
                0.12, // Görüntülenen pinler küçük
                0.15, // Normal pinler
              ],
              iconAnchor: 'bottom',
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: 'viewport',
              iconRotationAlignment: 'viewport',
              iconOpacity: [
                'case',
                ['==', ['get', 'isViewed'], 1],
                0.4, // Görüntülenen pinler soluk
                1.0, // Görüntülenmemiş pinler tam opak
              ],
            }}
          />
          {/* Eşleşme yıldızı overlay */}
          <MapboxGL.SymbolLayer
            id="pin-match-star-layer"
            filter={["==", ["get", "hasMatch"], 1]}
            style={{
              iconImage: 'pin-match-star',
              iconSize: 0.18,
              iconAnchor: 'bottom',
              iconOffset: [0, -28],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: 'viewport',
              iconRotationAlignment: 'viewport',
            }}
          />
        </MapboxGL.ShapeSource>
        </MapboxGL.MapView>
        
        {/* Konum Tooltip - "Burdasınız" baloncuğu */}
        {showLocationTooltip && userLocation && (
          <Animated.View
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: [
                { translateX: -60 },
                { translateY: -80 },
              ],
              opacity: tooltipOpacity,
            }}
          >
            <View
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 2,
                borderColor: '#2196F3',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                📍 Burdasınız
              </Text>
            </View>
            
            {/* Ok işareti */}
            <View
              style={{
                position: 'absolute',
                bottom: -8,
                left: '50%',
                transform: [{ translateX: -8 }],
                width: 0,
                height: 0,
                borderLeftWidth: 8,
                borderRightWidth: 8,
                borderTopWidth: 8,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: '#2196F3',
              }}
            />
          </Animated.View>
        )}
      </View>
    );
  });

MapboxPool.displayName = 'MapboxPool';

// Gereksiz re-render'ları önlemek için React.memo
export default React.memo(MapboxPool, (prevProps, nextProps) => {
  // Sadece önemli prop'lar değiştiğinde re-render et
  return (
    prevProps.styleURL === nextProps.styleURL &&
    prevProps.enable3D === nextProps.enable3D &&
    prevProps.pitch === nextProps.pitch &&
    prevProps.heading === nextProps.heading &&
    prevProps.enableDraw === nextProps.enableDraw &&
    prevProps.viewedCounter === nextProps.viewedCounter &&
    prevProps.viewedPortfolios === nextProps.viewedPortfolios &&
    prevProps.currentUserId === nextProps.currentUserId &&
    JSON.stringify(prevProps.center) === JSON.stringify(nextProps.center) &&
    JSON.stringify(prevProps.userLocation) === JSON.stringify(nextProps.userLocation) &&
    JSON.stringify(prevProps.pins) === JSON.stringify(nextProps.pins) &&
    JSON.stringify(prevProps.drawnPolygon) === JSON.stringify(nextProps.drawnPolygon) &&
    JSON.stringify(prevProps.drawingPoints) === JSON.stringify(nextProps.drawingPoints)
  );
});

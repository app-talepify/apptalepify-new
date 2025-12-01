// src/components/GradientBandingFree.js
// Shopify Skia ile banding sorunu çözülmüş basit gradient component
// Simplified version - Compatible with all SkSL versions

import React from 'react';
import { Canvas, Rect, Skia } from '@shopify/react-native-skia';

// Basit SkSL Shader - Maksimum uyumluluk için
const SIMPLE_GRADIENT_SHADER = `
uniform float2 uResolution;
uniform float4 uStartColor;
uniform float4 uEndColor;
uniform float uAngleRad; // For linear gradient
uniform float2 uCenter;   // For radial gradient
uniform float uRadius;    // For radial gradient size
uniform int uType;        // 0 for linear, 1 for radial
uniform float uAlpha;
uniform float uSpread;
uniform float uDitherStrength;

half4 main(float2 coord) {
  float gradientPos;
  
  if (uType == 0) { // Linear Gradient
    float aspect = uResolution.x / uResolution.y;
    float2 grad_dir = float2(cos(uAngleRad), sin(uAngleRad));
    
    float max_proj = 0.5 * (abs(grad_dir.x * aspect) + abs(grad_dir.y));
    
    float2 uv = (coord - 0.5 * uResolution) / uResolution.y;

    float proj = dot(uv, grad_dir);

    gradientPos = (proj + max_proj) / (2.0 * max_proj);
  } else { // Radial Gradient
    float aspect = uResolution.x / uResolution.y;
    float2 uv = coord / uResolution;
    
    float2 center = uCenter;
    
    // Adjust uv and center for aspect ratio to make the circle a true circle
    uv.x *= aspect;
    center.x *= aspect;
    
    // The distance is the gradient position. We normalize by the radius to control the size.
    gradientPos = distance(uv, center) / uRadius;
  }
  
  // Apply spread for a more controlled transition curve.
  float spreadPos = pow(gradientPos, uSpread);
  
  // Re-introduce a single smoothstep to eliminate banding.
  float smoothPos = smoothstep(0.0, 1.0, spreadPos);
  
  float4 color = mix(uStartColor, uEndColor, smoothPos);
  
  // Apply alpha before dithering.
  float finalAlpha = color.a * uAlpha;

  // Add final dithering pass.
  float noise = fract(sin(dot(coord, float2(12.9898, 78.233))) * 43758.5453);
  float dither = (noise - 0.5) * uDitherStrength / 255.0;
  color.rgb += dither;
  
  // Clamp RGB and apply premultiplied alpha.
  float3 finalRGB = clamp(color.rgb, 0.0, 1.0) * finalAlpha;
  
  return half4(finalRGB, finalAlpha);
}
`;

// Color string (hex, rgb, rgba) to normalized RGBA array conversion
const parseColor = (colorString) => {
  if (typeof colorString !== 'string') {
    console.warn(`GradientBandingFree: Invalid color format, expected a string but got:`, colorString);
    return [0, 0, 0, 1];
  }
  
  // RGBA string: rgba(255, 255, 255, 0.5)
  let match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return [
      parseInt(match[1], 10) / 255.0,
      parseInt(match[2], 10) / 255.0,
      parseInt(match[3], 10) / 255.0,
      match[4] !== undefined ? parseFloat(match[4]) : 1.0,
    ];
  }

  // Hex string: #RRGGBB
  match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorString);
  if (match) {
    return [
      parseInt(match[1], 16) / 255.0,
      parseInt(match[2], 16) / 255.0,
      parseInt(match[3], 16) / 255.0,
      1.0, // Default alpha for hex is 1.0
    ];
  }
  
  console.warn(`GradientBandingFree: Invalid color format: ${colorString}`);
  return [0, 0, 0, 1]; // Fallback to opaque black
};

// Main component
const GradientBandingFree = ({
  width = 320,
  height = 200,
  start = '#0B1320',
  end = '#1E2A3A',
  alpha = 0.88,
  type = 'linear', // 'linear' or 'radial'
  direction = 0, // For linear gradient
  center = { x: 0.5, y: 0.5 }, // For radial gradient
  radius = 0.5, // For radial gradient size
  spread = 1.0, // > 1.0 eases-in (spreads start), < 1.0 eases-out (spreads end)
  ditherStrength = 1.0, // A subtle value like 1.0 is usually enough.
  borderRadius = 0,
  style,
}) => {
  // Validate props
  if (width <= 0 || height <= 0) {
    console.warn('GradientBandingFree: width and height must be positive numbers');
    return null;
  }
  
  if (alpha < 0.0 || alpha > 1.0) {
    console.warn('GradientBandingFree: alpha should be between 0.0 and 1.0');
  }

  // Create shader
  const shader = React.useMemo(() => {
    try {
      return Skia.RuntimeEffect.Make(SIMPLE_GRADIENT_SHADER);
    } catch (error) {
      console.error('GradientBandingFree: Failed to create shader:', error);
      return null;
    }
  }, []);

  // Create paint with shader
  const paint = React.useMemo(() => {
    if (!shader) return null;

    try {
      const startRgba = parseColor(start);
      const endRgba = parseColor(end);

      // Convert user-friendly direction (0=top-to-bottom) to mathematical angle (0=right)
      const mathAngleDeg = (direction + 270) % 360;
      const angleRad = (mathAngleDeg * Math.PI) / 180;
      
      const gradientType = type === 'radial' ? 1 : 0;
      const centerX = center?.x ?? 0.5;
      const centerY = center?.y ?? 0.5;

      // Clamp potentially unsafe values to avoid shader edge cases
      const safeAlpha = Math.min(1, Math.max(0, alpha));
      const safeRadius = Math.max(0.0001, radius); // avoid division by zero in radial
      const safeSpread = Math.max(0.0001, spread); // pow(x, 0) edge
      const safeDither = Math.max(0, ditherStrength);


      const paint = Skia.Paint();
      paint.setShader(
        shader.makeShader([
          width, height,                    // uResolution
          ...startRgba,                     // uStartColor
          ...endRgba,                       // uEndColor
          angleRad,                         // uAngleRad
          centerX, centerY,                 // uCenter
          safeRadius,                       // uRadius
          gradientType,                     // uType
          safeAlpha,                        // uAlpha
          safeSpread,                       // uSpread
          safeDither,                       // uDitherStrength
        ])
      );
      
      // Enable anti-aliasing for smooth edges
      paint.setAntiAlias(true);
      
      return paint;
    } catch (error) {
      console.error('GradientBandingFree: Failed to create paint:', error);
      return null;
    }
  }, [shader, width, height, start, end, alpha, type, direction, center, radius, spread, ditherStrength]);

  // Fallback if shader creation failed
  if (!shader || !paint) {
    console.error('GradientBandingFree: Shader not available, falling back to transparent view');
    return (
      <Canvas style={[{ width, height }, style]}>
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          color="transparent"
        />
      </Canvas>
    );
  }

  return (
    <Canvas style={[{ width, height }, style]}>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        paint={paint}
        rx={borderRadius}
        ry={borderRadius}
      />
    </Canvas>
  );
};

export default GradientBandingFree;

// Örnek kullanım:
/*
import GradientBandingFree from './src/components/GradientBandingFree';

// Temel kullanım
<GradientBandingFree 
  width={320} 
  height={200} 
  start="#0B1320" 
  end="#1E2A3A" 
  alpha={0.88} 
  direction={0} 
  borderRadius={24} 
/>

// Yatay gradient
<GradientBandingFree 
  width={300} 
  height={150} 
  start="#FF6B6B" 
  end="#4ECDC4" 
  alpha={0.75} 
  direction={1} 
  borderRadius={16} 
/>

// Şeffaf overlay
<GradientBandingFree 
  width={280} 
  height={400} 
  start="#000000" 
  end="#FFFFFF" 
  alpha={0.3} 
  direction={0} 
  borderRadius={12} 
/>
*/
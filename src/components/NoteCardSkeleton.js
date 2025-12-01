import React, { memo } from 'react';
import { View } from 'react-native';
import SkeletonPlaceholder from 'react-native-skeleton-placeholder';
import { useTheme } from '../theme/ThemeContext';

const NoteCardSkeleton = () => {
  const { isDark } = useTheme();
  const backgroundColor = isDark ? '#2C2C2E' : '#EAEAEA';
  const highlightColor = isDark ? '#3A3A3C' : '#F5F5F5';
  const borderColor = isDark ? '#3A3A3C' : '#E0E0E0';

  return (
    <View style={{ marginBottom: 15 }}>
      <SkeletonPlaceholder 
        borderRadius={12} 
        highlightColor={highlightColor} 
        backgroundColor={backgroundColor}
        speed={1500}
      >
        <SkeletonPlaceholder.Item 
          height={120} 
          borderRadius={12}
          borderWidth={2}
          borderColor={borderColor}
        >
          <SkeletonPlaceholder.Item 
            flexDirection="row" 
            justifyContent="space-between" 
            alignItems="center" 
            padding={15}
          >
            <SkeletonPlaceholder.Item flexDirection="row" alignItems="center">
              <SkeletonPlaceholder.Item width={20} height={20} borderRadius={4} />
              <SkeletonPlaceholder.Item width={80} height={12} marginLeft={10} />
            </SkeletonPlaceholder.Item>
            <SkeletonPlaceholder.Item flexDirection="row" alignItems="center">
              <SkeletonPlaceholder.Item width={50} height={24} borderRadius={4} marginRight={10} />
              <SkeletonPlaceholder.Item width={30} height={30} borderRadius={4} />
            </SkeletonPlaceholder.Item>
          </SkeletonPlaceholder.Item>
          <SkeletonPlaceholder.Item 
            flex={1} 
            paddingHorizontal={15}
          >
            <SkeletonPlaceholder.Item width="100%" height={8} marginTop={10} />
            <SkeletonPlaceholder.Item width="70%" height={8} marginTop={6} />
          </SkeletonPlaceholder.Item>
        </SkeletonPlaceholder.Item>
      </SkeletonPlaceholder>
    </View>
  );
};

export default memo(NoteCardSkeleton);

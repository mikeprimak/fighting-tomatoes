import React from 'react';
import { TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';

interface TappableHeaderLogoProps {
  onPress?: () => void;
  marginLeft?: number;
}

export function TappableHeaderLogo({ onPress, marginLeft = 16 }: TappableHeaderLogoProps) {
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.back();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Image
        source={require('../assets/app-icon.png')}
        style={{ width: 48, height: 48, marginLeft }}
        resizeMode="contain"
      />
    </TouchableOpacity>
  );
}

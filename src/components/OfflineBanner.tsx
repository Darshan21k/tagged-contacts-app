import React, { useEffect, useState, useRef } from 'react';
import { Text, StyleSheet, Animated, Platform, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  
  // Use the actual safe area top inset so it sits right below the phone's clock/battery
  const topPadding = Platform.OS === 'android' ? Math.max(insets.top, 24) : insets.top;
  const bannerContentHeight = 28;
  const totalHeight = bannerContentHeight + topPadding;

  const slideAnim = useRef(new Animated.Value(-totalHeight)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected || state.isInternetReachable === false;

      if (offline) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsOffline(true);
        setWasOffline(true);

        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start();
      } else if (wasOffline) {
        setIsOffline(false);

        timeoutRef.current = setTimeout(() => {
          Animated.timing(slideAnim, {
            toValue: -totalHeight,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            setWasOffline(false);
          });
        }, 1800);
      }
    });

    return () => {
      unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [wasOffline, slideAnim, totalHeight]);

  if (!isOffline && !wasOffline) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.banner,
        {
          paddingTop: topPadding,
          height: totalHeight,
          transform: [{ translateY: slideAnim }],
          backgroundColor: isOffline ? '#DC2626' : '#10B981',
        },
      ]}
    >
      <View style={styles.contentRow}>
        <Ionicons
          name={isOffline ? 'cloud-offline-outline' : 'checkmark-circle-outline'}
          size={14}
          color="#FFFFFF"
        />
        <Text style={styles.text}>
          {isOffline ? 'No internet connection — working offline' : 'Back online'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 99999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 6,
    paddingHorizontal: 16,
    gap: 6,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
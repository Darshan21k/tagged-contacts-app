import React, { useEffect, useState, useRef } from 'react';
import { Text, StyleSheet, Animated, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-60)).current;
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
          duration: 250,
          useNativeDriver: true,
        }).start();
      } else if (wasOffline) {
        setIsOffline(false);

        timeoutRef.current = setTimeout(() => {
          Animated.timing(slideAnim, {
            toValue: -60,
            duration: 250,
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
  }, [wasOffline, slideAnim]);

  if (!isOffline && !wasOffline) return null;

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 8 : 12);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.banner,
        {
          paddingTop: topInset,
          transform: [{ translateY: slideAnim }],
          backgroundColor: isOffline ? '#DC2626' : '#10B981',
        },
      ]}
    >
      <Ionicons
        name={isOffline ? 'cloud-offline-outline' : 'checkmark-circle-outline'}
        size={15}
        color="#FFFFFF"
      />
      <Text style={styles.text}>
        {isOffline ? 'No internet connection — working offline' : 'Back online'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 7,
    paddingHorizontal: 16,
    gap: 7,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
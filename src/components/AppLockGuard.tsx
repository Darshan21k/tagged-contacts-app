import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  StatusBar,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

export default function AppLockGuard({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [isAuthenticatingSuccess, setIsAuthenticatingSuccess] = useState(false);

  const appState = useRef(AppState.currentState);

  // Animation drivers
  const cardScale = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  const checkLockAndAuthenticate = async () => {
    try {
      const lockSetting = await AsyncStorage.getItem('app_lock_enabled');
      const enabled = lockSetting === 'true';
      setIsLockEnabled(enabled);

      if (!enabled) {
        setIsUnlocked(true);
        return;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        setIsUnlocked(true);
        return;
      }

      setIsUnlocked(false);
      setIsAuthenticatingSuccess(false);
      cardScale.setValue(1);
      cardOpacity.setValue(1);

      promptUnlock();
    } catch (err) {
      console.warn('AppLockGuard error:', err);
      setIsUnlocked(true);
    }
  };

  const handleSuccessAnimation = () => {
    setIsAuthenticatingSuccess(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    Animated.sequence([
      // Subtle spring pop
      Animated.timing(cardScale, {
        toValue: 1.03,
        duration: 140,
        useNativeDriver: true,
      }),
      // Smooth fade-scale reveal into the app
      Animated.parallel([
        Animated.timing(cardScale, {
          toValue: 0.94,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setIsUnlocked(true);
      setIsAuthenticatingSuccess(false);
    });
  };

  const promptUnlock = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock ContactNow',
        fallbackLabel: 'Use Device PIN / Pattern',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        handleSuccessAnimation();
      }
    } catch (err) {
      console.warn('Authentication error:', err);
    }
  };

  useEffect(() => {
    checkLockAndAuthenticate();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        checkLockAndAuthenticate();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

  if (isLockEnabled && !isUnlocked) {
    return (
      <View style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

        <Animated.View
          style={[
            styles.authCard,
            {
              opacity: cardOpacity,
              transform: [{ scale: cardScale }],
            },
          ]}
        >
          {/* Logo Frame with layered shadow */}
          <View style={styles.logoFrame}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.appIcon}
              resizeMode="contain"
            />
          </View>

          {/* Dual-Tone Typography */}
          <Text style={styles.appTitle}>
            <Text style={styles.brandPrimary}>Contact</Text>
            <Text style={styles.brandAccent}>Now</Text>
          </Text>

          {/* Dynamic Status Pill */}
          <View
            style={[
              styles.statusPill,
              isAuthenticatingSuccess && styles.statusPillSuccess,
            ]}
          >
            {isAuthenticatingSuccess ? (
              <>
                <Ionicons name="checkmark-circle" size={13} color="#059669" />
                <Text style={styles.unlockedText}>Unlocked</Text>
              </>
            ) : (
              <>
                <View style={styles.statusDot} />
                <Text style={styles.lockedText}>Locked</Text>
              </>
            )}
          </View>

          <Text style={styles.subtitle}>
            {isAuthenticatingSuccess
              ? 'Welcome back'
              : 'Unlock using your fingerprint, face, or device PIN'}
          </Text>

          {/* Action Button */}
          <TouchableOpacity
            style={[
              styles.unlockBtn,
              isAuthenticatingSuccess && styles.unlockBtnSuccess,
            ]}
            onPress={promptUnlock}
            activeOpacity={0.88}
            disabled={isAuthenticatingSuccess}
          >
            <View style={styles.btnIconCircle}>
              <Ionicons
                name={isAuthenticatingSuccess ? 'checkmark' : 'finger-print'}
                size={18}
                color={isAuthenticatingSuccess ? '#059669' : '#2563EB'}
              />
            </View>
            <Text style={styles.unlockBtnText}>
              {isAuthenticatingSuccess ? 'Opening...' : 'Unlock App'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  authCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  logoFrame: {
    position: 'relative',
    marginBottom: 18,
  },
  appIcon: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
  },
  appTitle: {
    fontSize: 26,
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  brandPrimary: {
    fontWeight: '600',
    color: '#0F172A',
  },
  brandAccent: {
    fontWeight: '900',
    color: '#2563EB',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 3.5,
    borderRadius: 12,
    gap: 6,
    marginBottom: 14,
  },
  statusPillSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
  },
  lockedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  unlockedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 26,
    paddingHorizontal: 8,
    fontWeight: '400',
  },
  unlockBtn: {
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 16,
    gap: 10,
    elevation: 4,
    shadowColor: '#2563EB',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  unlockBtnSuccess: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  btnIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
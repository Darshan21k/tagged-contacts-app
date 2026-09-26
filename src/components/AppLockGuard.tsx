import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';

export default function AppLockGuard({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(true); // Default unlocked until preference is read
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const appState = useRef(AppState.currentState);

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
        // If device has no screen lock set up, fail gracefully
        setIsUnlocked(true);
        return;
      }

      setIsUnlocked(false);
      promptUnlock();
    } catch (err) {
      console.warn('AppLockGuard error:', err);
      setIsUnlocked(true);
    }
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
        setIsUnlocked(true);
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
      <View style={styles.lockContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={42} color="#2563EB" />
        </View>
        <Text style={styles.appTitle}>ContactNow is Locked</Text>
        <Text style={styles.subtitle}>Unlock using your fingerprint, face, or device PIN</Text>

        <TouchableOpacity style={styles.unlockBtn} onPress={promptUnlock} activeOpacity={0.8}>
          <Ionicons name="finger-print-outline" size={20} color="#FFFFFF" />
          <Text style={styles.unlockBtnText}>Unlock App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
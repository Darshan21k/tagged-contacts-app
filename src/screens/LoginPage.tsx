import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

export default function LoginPage({ navigation }: any) {
  const [mobileNumber, setMobileNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [mailId, setMailId] = useState('');
  const [userName, setUserName] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkSavedSession();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOtpSent && countdown > 0) {
      timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isOtpSent, countdown]);

  const checkSavedSession = async () => {
    const savedPhone = await AsyncStorage.getItem('user_phone');
    if (savedPhone && savedPhone.length === 10) {
      verifyUserAccess(savedPhone);
    }
  };

  const verifyUserAccess = async (phone: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Userprofile')
        .select('*')
        .eq('Phonenumber', phone)
        .single();

      if (error || !data) {
        await AsyncStorage.removeItem('user_phone');
        return;
      }

      if (data.Login_Access !== 'yes') {
        navigation.reset({ index: 0, routes: [{ name: 'AccessBlocked' }] });
        return;
      }

      await AsyncStorage.setItem('user_phone', data.Phonenumber);
      await AsyncStorage.setItem('user_name', data.Name);
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Session verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    const cleanNumber = mobileNumber.trim();
    if (cleanNumber.length !== 10 || !/^\d{10}$/.test(cleanNumber)) {
      Alert.alert('Alert', 'Phone number must be exactly 10 digits.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Userprofile')
        .select('*')
        .eq('Phonenumber', cleanNumber);

      if (error) throw error;

      if (!data || data.length === 0) {
        navigation.navigate('Registration', { phone: cleanNumber });
        return;
      }

      const user = data[0];
      if (user.Login_Access !== 'yes') {
        navigation.navigate('AccessBlocked');
        return;
      }

      if (!user.Mail_id) {
        navigation.navigate('Registration', { phone: cleanNumber });
        return;
      }

      setUserName(user.Name);
      setMailId(user.Mail_id);
      sendEmailOtp(user.Mail_id);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const sendEmailOtp = async (email: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;

      setIsOtpSent(true);
      setCountdown(60);
      Alert.alert('Success', `OTP sent successfully to ${email}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert('Alert', 'Enter the OTP received on your email.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: mailId,
        token: otp.trim(),
        type: 'email',
      });

      if (error) throw error;

      await AsyncStorage.setItem('user_phone', mobileNumber.trim());
      await AsyncStorage.setItem('user_name', userName);
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err: any) {
      Alert.alert('Error', 'OTP is incorrect, try again.');
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Contact Now</Text>
        <Text style={styles.subtitle}>Sign in to access your tagged contacts</Text>

        <Text style={styles.label}>Mobile Number (10 digits)</Text>
        <TextInput
          style={[styles.input, isOtpSent && styles.disabledInput]}
          placeholder="Enter 10-digit number"
          keyboardType="numeric"
          maxLength={10}
          value={mobileNumber}
          editable={!isOtpSent}
          onChangeText={setMobileNumber}
        />

        {isOtpSent && (
          <>
            <Text style={styles.label}>Email OTP</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter 6-digit OTP"
              keyboardType="numeric"
              value={otp}
              onChangeText={setOtp}
            />

            {countdown > 0 ? (
              <Text style={styles.resendText}>Resend OTP in {countdown}s</Text>
            ) : (
              <TouchableOpacity onPress={() => sendEmailOtp(mailId)}>
                <Text style={styles.resendBtn}>Resend OTP</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={isOtpSent ? handleVerifyOtp : handleVerifyPhone}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{isOtpSent ? 'Verify OTP' : 'Continue'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 16, elevation: 3 },
  title: { fontSize: 24, fontWeight: '700', color: '#1E293B', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 24, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, height: 48, paddingHorizontal: 12, fontSize: 16 },
  disabledInput: { backgroundColor: '#F1F5F9', color: '#94A3B8' },
  resendText: { fontSize: 13, color: '#64748B', marginTop: 8, textAlign: 'center' },
  resendBtn: { fontSize: 13, color: '#2563EB', fontWeight: '600', marginTop: 8, textAlign: 'center' },
  button: { backgroundColor: '#2563EB', height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
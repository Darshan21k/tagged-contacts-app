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

export default function RegistrationPage({ route, navigation }: any) {
  const initialPhone = route?.params?.phone || '';
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOtpSent && countdown > 0) {
      timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isOtpSent, countdown]);

  const handleSendOtp = async () => {
    if (!fullName.trim()) {
      Alert.alert('Alert', 'Enter Full Name');
      return;
    }
    if (!email.trim() || !email.includes('@') || !email.includes('.')) {
      Alert.alert('Alert', 'Enter a valid Email address');
      return;
    }
    if (phone.trim().length !== 10) {
      Alert.alert('Alert', 'Phone number must be 10 digits');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Userprofile')
        .select('Mail_id')
        .eq('Mail_id', email.trim());

      if (error) throw error;
      if (data && data.length > 0) {
        Alert.alert('Notice', 'This Email Id is already registered');
        setLoading(false);
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (otpError) throw otpError;

      setIsOtpSent(true);
      setCountdown(60);
      Alert.alert('Success', `OTP sent to ${email.trim()}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!otp.trim()) {
      Alert.alert('Alert', 'Enter OTP');
      return;
    }

    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email',
      });
      if (verifyError) throw verifyError;

      const { error: insertError } = await supabase.from('Userprofile').insert([
        {
          Name: fullName.trim(),
          Phonenumber: phone.trim(),
          Mail_id: email.trim(),
          Login_Access: 'yes',
        },
      ]);
      if (insertError) throw insertError;

      await AsyncStorage.setItem('user_phone', phone.trim());
      await AsyncStorage.setItem('user_name', fullName.trim());
      Alert.alert('Success', 'Registered successfully!');
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Create Account</Text>

        <Text style={styles.label}>Full Name</Text>
        <TextInput style={styles.input} placeholder="John Doe" value={fullName} onChangeText={setFullName} />

        <Text style={styles.label}>Mobile Number (10 digits)</Text>
        <TextInput style={[styles.input, styles.disabledInput]} value={phone} editable={false} />

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={[styles.input, isOtpSent && styles.disabledInput]}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          editable={!isOtpSent}
          onChangeText={setEmail}
        />

        {isOtpSent && (
          <>
            <Text style={styles.label}>Email OTP</Text>
            <TextInput style={styles.input} placeholder="6-digit OTP" keyboardType="numeric" value={otp} onChangeText={setOtp} />
            {countdown > 0 ? (
              <Text style={styles.timer}>Resend in {countdown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleSendOtp}>
                <Text style={styles.resend}>Resend OTP</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={isOtpSent ? handleRegister : handleSendOtp}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>{isOtpSent ? 'Register' : 'Send OTP'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 16, elevation: 3 },
  title: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, height: 46, paddingHorizontal: 12, fontSize: 15 },
  disabledInput: { backgroundColor: '#F1F5F9', color: '#94A3B8' },
  timer: { fontSize: 13, color: '#64748B', marginTop: 8, textAlign: 'center' },
  resend: { fontSize: 13, color: '#2563EB', fontWeight: '600', marginTop: 8, textAlign: 'center' },
  button: { backgroundColor: '#2563EB', height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
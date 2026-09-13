import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

export default function AccessBlockedPage({ navigation }: any) {
  const handleLogout = async () => {
    await AsyncStorage.clear();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <View style={styles.container}>
      <Ionicons name="lock-closed" size={72} color="#DC2626" />
      <Text style={styles.title}>Access Blocked</Text>
      <Text style={styles.message}>
        Your account access has been restricted by the administrator. Please contact support.
      </Text>
      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Text style={styles.btnText}>Return to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 24, fontWeight: '700', color: '#1E293B', marginTop: 16 },
  message: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  button: { backgroundColor: '#2563EB', paddingHorizontal: 24, height: 46, borderRadius: 8, justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: '600' },
});
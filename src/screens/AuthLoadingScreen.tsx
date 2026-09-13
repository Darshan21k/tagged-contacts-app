import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

export default function AuthLoadingScreen({ navigation }: any) {
  useEffect(() => {
    checkAppSession();
  }, []);

  const checkAppSession = async () => {
    try {
      const savedPhone = await AsyncStorage.getItem('user_phone');

      if (!savedPhone || savedPhone.trim().length !== 10) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      const { data, error } = await supabase
        .from('Userprofile')
        .select('Login_Access, Name')
        .eq('Phonenumber', savedPhone.trim())
        .single();

      if (error || !data) {
        await AsyncStorage.removeItem('user_phone');
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      if (data.Login_Access === 'yes') {
        if (data.Name) {
          await AsyncStorage.setItem('user_name', data.Name);
        }
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'AccessBlocked' }] });
      }
    } catch (err) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563EB" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
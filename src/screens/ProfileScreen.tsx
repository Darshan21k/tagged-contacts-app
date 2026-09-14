import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { UserProfile } from '../types';

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    setLoading(true);
    try {
      const activePhone = (await AsyncStorage.getItem('user_phone')) || '9999999999';
      const { data, error } = await supabase
        .from('Userprofile')
        .select('*')
        .eq('Phonenumber', activePhone)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setProfile(data);
      } else {
        setProfile({
          Name: 'User Admin',
          Phonenumber: activePhone,
          Mail_id: 'admin@example.com',
          Login_Access: 'yes',
          User_type: 'User',
        } as UserProfile);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch profile details');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  // Case-insensitive check for Admin role from Userprofile table
  const isAdmin = (profile as any)?.User_type?.trim().toLowerCase() === 'admin';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={44} color="#2563EB" />
        </View>
        <Text style={styles.profileName}>{profile?.Name || 'User'}</Text>
        <Text style={styles.profileSubtitle}>+91 {profile?.Phonenumber}</Text>

        <View style={styles.badgeRow}>
          <View style={styles.badgeContainer}>
            <Ionicons
              name={profile?.Login_Access === 'yes' ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={profile?.Login_Access === 'yes' ? '#16A34A' : '#DC2626'}
            />
            <Text
              style={[
                styles.badgeText,
                { color: profile?.Login_Access === 'yes' ? '#16A34A' : '#DC2626' },
              ]}
            >
              {profile?.Login_Access === 'yes' ? 'Access Active' : 'Access Restricted'}
            </Text>
          </View>

          {isAdmin && (
            <View style={styles.adminRoleBadge}>
              <Text style={styles.adminRoleBadgeText}>ADMIN</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.detailsCard}>
        <Text style={styles.sectionHeader}>Account Information</Text>

        <View style={styles.infoRow}>
          <View style={styles.iconBox}>
            <Ionicons name="call-outline" size={18} color="#64748B" />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>Phone Number</Text>
            <Text style={styles.infoValue}>+91 {profile?.Phonenumber}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={styles.iconBox}>
            <Ionicons name="mail-outline" size={18} color="#64748B" />
          </View>
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{profile?.Mail_id || 'Not provided'}</Text>
          </View>
        </View>
      </View>

      {/* Button renders ONLY if User_type === 'Admin' */}
      {isAdmin && (
        <TouchableOpacity
          style={styles.adminButton}
          onPress={() => navigation.navigate('Admin')}
          activeOpacity={0.8}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color="#2563EB" />
          <Text style={styles.adminText}>Admin User Control</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={20} color="#DC2626" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileName: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  profileSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  adminRoleBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  adminRoleBadgeText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    marginBottom: 16,
  },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoTextContainer: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#94A3B8' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1E293B', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 6 },
  adminButton: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  adminText: { color: '#2563EB', fontSize: 15, fontWeight: '600' },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  logoutText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
});
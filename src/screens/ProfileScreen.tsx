import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { UserProfile } from '../types';

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // App Lock Toggle State
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit Modal State
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMail, setEditMail] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchUserProfile();
    loadLockPreference();
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const loadLockPreference = async () => {
    try {
      const storedVal = await AsyncStorage.getItem('app_lock_enabled');
      setIsLockEnabled(storedVal === 'true');
    } catch {
      // Quiet fail
    }
  };

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    toastTimeoutRef.current = setTimeout(() => {
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setToastMessage(null));
    }, 2000);
  };

  const handleToggleLock = async (value: boolean) => {
    try {
      if (value) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware || !isEnrolled) {
          Alert.alert(
            'Security Unavailable',
            'Please set up a screen lock (PIN, Pattern, Fingerprint, or Face) in your phone settings first.'
          );
          return;
        }

        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Verify to enable App Lock',
          fallbackLabel: 'Use Device PIN',
          cancelLabel: 'Cancel',
          disableDeviceFallback: false,
        });

        if (auth.success) {
          await AsyncStorage.setItem('app_lock_enabled', 'true');
          setIsLockEnabled(true);
          showToast('App lock enabled successfully');
        }
      } else {
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Verify to turn off App Lock',
          fallbackLabel: 'Use Device PIN',
          cancelLabel: 'Cancel',
          disableDeviceFallback: false,
        });

        if (auth.success) {
          await AsyncStorage.setItem('app_lock_enabled', 'false');
          setIsLockEnabled(false);
          showToast('App lock disabled');
        }
      }
    } catch (err: any) {
      Alert.alert('Authentication Error', err.message || 'Unable to authenticate device.');
    }
  };

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

  const openEditModal = () => {
    setEditName(profile?.Name || '');
    setEditMail(profile?.Mail_id || '');
    setIsEditModalVisible(true);
  };

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleUpdateProfile = async () => {
    const trimmedName = editName.trim();
    const trimmedMail = editMail.trim().toLowerCase();

    if (!trimmedName) {
      Alert.alert('Validation Error', 'Please enter your full name.');
      return;
    }

    if (!validateEmail(trimmedMail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address (e.g. name@example.com).');
      return;
    }

    Alert.alert(
      'Verify Your Email Address',
      `Login OTPs will be sent to:\n\n${trimmedMail}\n\nIf this email is incorrect or inaccessible, you will not receive OTPs to login and will need to contact the admin. Do you want to proceed?`,
      [
        { text: 'Review Email', style: 'cancel' },
        {
          text: 'Confirm & Save',
          onPress: async () => {
            setIsSaving(true);
            try {
              const activePhone = profile?.Phonenumber || (await AsyncStorage.getItem('user_phone'));
              const { error } = await supabase
                .from('Userprofile')
                .update({
                  Name: trimmedName,
                  Mail_id: trimmedMail,
                })
                .eq('Phonenumber', activePhone);

              if (error) throw error;

              setProfile((prev: any) => ({
                ...prev,
                Name: trimmedName,
                Mail_id: trimmedMail,
              }));

              setIsEditModalVisible(false);
              Alert.alert('Success', 'Profile details updated successfully!');
            } catch (err: any) {
              Alert.alert('Update Failed', err.message || 'Could not update profile details.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ]
    );
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        {/* Profile Card */}
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

        {/* Account Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Account Information</Text>
            <TouchableOpacity
              style={styles.editIconBtn}
              onPress={openEditModal}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="create-outline" size={18} color="#2563EB" />
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Ionicons name="person-outline" size={18} color="#64748B" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue}>{profile?.Name || 'Not provided'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Ionicons name="call-outline" size={18} color="#64748B" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Phone Number (Locked)</Text>
              <Text style={styles.infoValue}>+91 {profile?.Phonenumber}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Ionicons name="mail-outline" size={18} color="#64748B" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Email (Used for Login OTP)</Text>
              <Text style={styles.infoValue}>{profile?.Mail_id || 'Not provided'}</Text>
            </View>
          </View>
        </View>

        {/* Security / App Lock Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionHeader}>Security</Text>

          <View style={[styles.infoRow, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
              <View style={styles.iconBox}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#2563EB" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.securityTitle}>Require Screen Lock</Text>
                <Text style={styles.securitySubtitle}>
                  Biometric or PIN unlock when opening ContactNow
                </Text>
              </View>
            </View>
            <Switch
              value={isLockEnabled}
              onValueChange={handleToggleLock}
              trackColor={{ false: '#CBD5E1', true: '#BFDBFE' }}
              thumbColor={isLockEnabled ? '#2563EB' : '#FFFFFF'}
            />
          </View>
        </View>

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
      </ScrollView>

      {/* Toast Notification */}
      {toastMessage && (
        <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !isSaving && setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile Details</Text>
              <TouchableOpacity
                onPress={() => !isSaving && setIsEditModalVisible(false)}
                disabled={isSaving}
              >
                <Ionicons name="close-circle" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Critical Notice */}
              <View style={styles.warningBox}>
                <Ionicons name="warning" size={18} color="#B45309" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>Important Notice</Text>
                  <Text style={styles.warningDesc}>
                    Login OTP is sent to this Mail ID. Please verify you can access this inbox. If an invalid or unreachable email is provided, you will be locked out and must contact the admin.
                  </Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter full name"
                placeholderTextColor="#94A3B8"
                value={editName}
                onChangeText={setEditName}
              />

              <Text style={styles.inputLabel}>Mail ID (For Login OTP) *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. yourname@gmail.com"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={editMail}
                onChangeText={setEditMail}
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsEditModalVisible(false)}
                  disabled={isSaving}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleUpdateProfile}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContainer: { padding: 16, paddingBottom: 32 },
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 8 },
  editIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
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
  securityTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  securitySubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
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

  toastContainer: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  toastText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  warningTitle: { fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 2 },
  warningDesc: { fontSize: 12, color: '#B45309', lineHeight: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: { color: '#475569', fontSize: 14, fontWeight: '600' },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    minWidth: 110,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
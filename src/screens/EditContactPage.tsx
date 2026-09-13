import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';

export default function EditContactPage({ route, navigation }: any) {
  const { id } = route.params;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitleAlign: 'left',
      headerShadowVisible: false,
      headerStyle: {
        backgroundColor: '#F1F5F9',
      },
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
      ),
      headerTitle: () => (
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitleText}>Edit Contact</Text>
          <View style={styles.badgeIndicator} />
        </View>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    loadContact();
  }, [id]);

  const loadContact = async () => {
    try {
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (data) {
        setName(data.Name || '');
        setPhone(data.Phonenumber || '');
        setTags(data.Tags || '');
        setNotes(data.OtherDetails || '');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load contact');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!name.trim()) return Alert.alert('Alert', 'Enter Name');
    if (phone.trim().length !== 10) return Alert.alert('Alert', 'Phone number must be 10 digits.');
    if (!tags.trim()) return Alert.alert('Alert', 'Enter Tags');

    setSaving(true);
    try {
      const sanitizedTags = tags.split(',').map((t) => t.trim()).filter(Boolean).join(', ');
      const { error } = await supabase
        .from('Contacts_Table')
        .update({
          Name: name.trim(),
          Phonenumber: phone.trim(),
          Tags: sanitizedTags,
          OtherDetails: notes.trim(),
        })
        .eq('id', id);

      if (error) throw error;
      Alert.alert('Success', 'Contact updated successfully!');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete', 'Are you sure you want to delete this contact?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            const { error } = await supabase.from('Contacts_Table').delete().eq('id', id);
            if (error) throw error;
            Alert.alert('Success', 'Contact deleted successfully');
            navigation.goBack();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Delete failed');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="John Doe"
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Phone Number (10 digits) *</Text>
          <TextInput
            style={styles.input}
            placeholder="9876543210"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            maxLength={10}
            value={phone}
            onChangeText={setPhone}
          />

          <Text style={styles.label}>Tags (comma-separated) *</Text>
          <TextInput
            style={styles.input}
            placeholder="Work, Client, Vendor"
            placeholderTextColor="#94A3B8"
            value={tags}
            onChangeText={setTags}
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            placeholder="Add any extra details or remarks..."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            value={notes}
            onChangeText={setNotes}
          />

          <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <View style={styles.btnRow}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                <Text style={styles.btnText}>Update Contact</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={saving}>
            <View style={styles.btnRow}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
              <Text style={styles.deleteBtnText}>Delete Contact</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F1F5F9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9' },
  backBtn: {
    marginRight: 6,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
    includeFontPadding: false,
  },
  badgeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  notes: {
    height: 84,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  saveBtn: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  deleteBtnText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 15,
  },
});
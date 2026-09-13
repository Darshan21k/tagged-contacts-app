import React, { useState, useEffect } from 'react';
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
  const { id, userPhone } = route.params;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Full Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        <Text style={styles.label}>Phone Number (10 digits) *</Text>
        <TextInput style={styles.input} keyboardType="numeric" maxLength={10} value={phone} onChangeText={setPhone} />

        <Text style={styles.label}>Tags (comma-separated) *</Text>
        <TextInput style={styles.input} value={tags} onChangeText={setTags} />

        <Text style={styles.label}>Notes</Text>
        <TextInput style={[styles.input, styles.notes]} multiline numberOfLines={3} value={notes} onChangeText={setNotes} />

        <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Update Contact</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={saving}>
          <Text style={styles.deleteBtnText}>Delete Contact</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 14, elevation: 2 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, height: 44, paddingHorizontal: 12 },
  notes: { height: 80, textAlignVertical: 'top', paddingTop: 8 },
  saveBtn: { backgroundColor: '#2563EB', height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  deleteBtn: { backgroundColor: '#FEE2E2', height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  deleteBtnText: { color: '#DC2626', fontWeight: '600', fontSize: 15 },
});
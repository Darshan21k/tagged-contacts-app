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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts/legacy';
import { supabase } from '../services/supabase';

export default function HomeScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [userPhone, setUserPhone] = useState('9999999999');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('user_phone').then((storedPhone) => {
      if (storedPhone) setUserPhone(storedPhone);
      fetchSuggestedTags(storedPhone || userPhone);
    });
  }, []);

  const fetchSuggestedTags = async (activePhone: string) => {
    try {
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('Tags')
        .eq('Userphonenumber', activePhone);

      if (error) throw error;

      if (data) {
        const unique = Array.from(
          new Set(
            data
              .flatMap((c: any) => (c.Tags ? c.Tags.split(',') : []))
              .map((t: string) => t.trim())
              .filter(Boolean)
          )
        ).slice(0, 8);
        setSuggestedTags(unique);
      }
    } catch (err) {
      // Quiet fail for suggestions
    }
  };

  const handlePickDeviceContact = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access contacts is required to import.');
        return;
      }

      const contact = await Contacts.presentContactPickerAsync();
      if (contact) {
        if (contact.name) {
          setName(contact.name);
        }

        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          const rawNumber = contact.phoneNumbers[0].number || '';
          // Clean non-digits
          const digitsOnly = rawNumber.replace(/\D/g, '');
          // Extract last 10 digits for Indian mobile numbers
          const clean10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
          setPhone(clean10);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not pick contact');
    }
  };

  const handleAddTagSuggestion = (tagToAdd: string) => {
    if (!tags.trim()) {
      setTags(tagToAdd);
    } else {
      const existing = tags.split(',').map((t) => t.trim());
      if (!existing.includes(tagToAdd)) {
        setTags(`${tags}, ${tagToAdd}`);
      }
    }
  };

  const handleSaveContact = async () => {
    if (!name.trim()) {
      Alert.alert('Alert', 'Please enter Name');
      return;
    }

    const cleanPhone = phone.trim();
    if (cleanPhone.length !== 10 || !/^\d{10}$/.test(cleanPhone)) {
      Alert.alert('Alert', 'Phone number must be exactly 10 digits.');
      return;
    }

    if (!tags.trim()) {
      Alert.alert('Alert', 'Please enter at least one Tag');
      return;
    }

    setLoading(true);
    try {
      // Check duplicate
      const { data: existing, error: checkError } = await supabase
        .from('Contacts_Table')
        .select('id')
        .eq('Userphonenumber', userPhone)
        .eq('Phonenumber', cleanPhone);

      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        Alert.alert('Duplicate Contact', 'A contact with this phone number already exists.');
        setLoading(false);
        return;
      }

      const sanitizedTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .join(', ');

      const { error: insertError } = await supabase.from('Contacts_Table').insert([
        {
          Name: name.trim(),
          Phonenumber: cleanPhone,
          Tags: sanitizedTags,
          OtherDetails: notes.trim(),
          Userphonenumber: userPhone,
        },
      ]);

      if (insertError) throw insertError;

      Alert.alert('Success', 'Contact saved successfully!');
      setName('');
      setPhone('');
      setTags('');
      setNotes('');
      fetchSuggestedTags(userPhone);
      navigation.navigate('Contacts');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save contact');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.title}>New Contact</Text>
            <TouchableOpacity
              style={styles.importBtn}
              onPress={handlePickDeviceContact}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={16} color="#2563EB" />
              <Text style={styles.importBtnText}>Import</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Ramesh Kumar"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Phone Number (10 digits) *</Text>
          <TextInput
            style={styles.input}
            placeholder="10-digit number"
            keyboardType="numeric"
            maxLength={10}
            value={phone}
            onChangeText={setPhone}
          />

          <Text style={styles.label}>Tags (comma-separated) *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Client, Bangalore, RealEstate"
            value={tags}
            onChangeText={setTags}
          />

          {suggestedTags.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <Text style={styles.suggestionTitle}>Quick Tags:</Text>
              <View style={styles.suggestionChipsWrap}>
                {suggestedTags.map((tag, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestionChip}
                    onPress={() => handleAddTagSuggestion(tag)}
                  >
                    <Text style={styles.suggestionChipText}>+ {tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.label}>Other Details / Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Optional details, address, or reminders..."
            multiline
            numberOfLines={3}
            value={notes}
            onChangeText={setNotes}
          />

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveContact}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Contact</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { padding: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  importBtnText: { color: '#2563EB', fontSize: 13, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 46,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  suggestionsContainer: { marginTop: 10 },
  suggestionTitle: { fontSize: 12, color: '#64748B', marginBottom: 6, fontWeight: '500' },
  suggestionChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestionChip: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  suggestionChipText: { fontSize: 12, color: '#3730A3', fontWeight: '600' },
  saveButton: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';

export default function HomeScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Default tenant phone (will link with session storage)
  const currentUserPhone = '9999999999';

  // Load existing tags to provide quick-select suggestion pills
  useEffect(() => {
    loadExistingTags();
  }, []);

  const loadExistingTags = async () => {
    try {
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('Tags')
        .eq('Userphonenumber', currentUserPhone);

      if (error) throw error;

      if (data) {
        const uniqueTags = Array.from(
          new Set(
            data
              .flatMap((item) => (item.Tags ? item.Tags.split(',') : []))
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          )
        );
        setAvailableTags(uniqueTags.slice(0, 10)); // Display top 10 unique tags
      }
    } catch (err: any) {
      console.warn('Could not load tags:', err.message);
    }
  };

  const appendTag = (tagToAdd: string) => {
    const existingList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (!existingList.includes(tagToAdd)) {
      const updated = existingList.length > 0 ? `${existingList.join(', ')}, ${tagToAdd}` : tagToAdd;
      setTags(`${updated}, `);
    }
  };

  const handleSaveContact = async () => {
    // 1. Validation matching Xamarin checks
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
      Alert.alert('Alert', 'Please enter Tags');
      return;
    }

    setLoading(true);

    try {
      // 2. Check for duplicate phone number
      const { data: existingUser, error: checkError } = await supabase
        .from('Contacts_Table')
        .select('Name')
        .eq('Phonenumber', cleanPhone)
        .eq('Userphonenumber', currentUserPhone);

      if (checkError) throw checkError;

      if (existingUser && existingUser.length > 0) {
        Alert.alert('Notice', `This phone number is already saved as: ${existingUser[0].Name}`);
        setLoading(false);
        return;
      }

      // 3. Format tags (strip trailing comma)
      const sanitizedTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .join(', ');

      // 4. Save to Contacts_Table
      const { error: insertError } = await supabase.from('Contacts_Table').insert([
        {
          Name: name.trim(),
          Phonenumber: cleanPhone,
          Tags: sanitizedTags,
          OtherDetails: notes.trim(),
          Userphonenumber: currentUserPhone,
        },
      ]);

      if (insertError) throw insertError;

      Alert.alert('Success', 'Contact saved successfully!');

      // Reset form
      setName('');
      setPhone('');
      setTags('');
      setNotes('');
      loadExistingTags();

      // Navigate to Contacts screen
      navigation.navigate('Contacts');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save contact');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.header}>New Contact</Text>

          {/* Name Field */}
          <Text style={styles.label}>Full Name *</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={18} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="e.g. Rahul Sharma"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Phone Field */}
          <Text style={styles.label}>Phone Number (10 digits) *</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="call-outline" size={18} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="10 digit mobile number"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              maxLength={10}
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          {/* Tags Field */}
          <Text style={styles.label}>Tags (comma-separated) *</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="pricetag-outline" size={18} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="e.g. Work, Bangalore, VIP"
              placeholderTextColor="#94A3B8"
              value={tags}
              onChangeText={setTags}
            />
          </View>

          {/* Existing Tag Chips */}
          {availableTags.length > 0 && (
            <View style={styles.chipsRow}>
              {availableTags.map((tag, idx) => (
                <TouchableOpacity key={idx} style={styles.chip} onPress={() => appendTag(tag)}>
                  <Text style={styles.chipText}>+ {tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Notes Field */}
          <Text style={styles.label}>Notes / Other Details</Text>
          <View style={[styles.inputWrapper, { height: 90, alignItems: 'flex-start' }]}>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Add optional notes or address..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.saveButton, loading && { opacity: 0.7 }]}
            onPress={handleSaveContact}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.saveButtonContent}>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save Contact</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#F1F5F9', flexGrow: 1 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  header: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 12, marginBottom: 6 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, height: 44, fontSize: 15, color: '#0F172A' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  chipText: { fontSize: 12, color: '#4338CA', fontWeight: '500' },
  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
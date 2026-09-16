import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts/legacy';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';

export default function HomeScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tagsList, setTagsList] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [userPhone, setUserPhone] = useState('9999999999');
  const [mostUsedTags, setMostUsedTags] = useState<string[]>([]);
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const [tagTab, setTagTab] = useState<'most' | 'recent'>('most');
  const [allAvailableTags, setAllAvailableTags] = useState<string[]>([]);
  const [tagSectionY, setTagSectionY] = useState(0);

  const scrollViewRef = useRef<ScrollView>(null);
  const tagSectionRef = useRef<View>(null);
  const tagInputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      setName('');
      setPhone('');
      setTagsList([]);
      setTagInput('');
      setNotes('');

      AsyncStorage.getItem('user_phone').then((storedPhone) => {
        const active = storedPhone || userPhone;
        if (storedPhone) setUserPhone(storedPhone);
        loadCachedTags(active);
        fetchSuggestedTags(active);
      });
    }, [userPhone])
  );

  const loadCachedTags = async (activePhone: string) => {
    try {
      const cached = await AsyncStorage.getItem(`cached_tags_${activePhone}`);
      if (cached) {
        const { most, recent, all } = JSON.parse(cached);
        if (most) setMostUsedTags(most);
        if (recent) setRecentTags(recent);
        if (all) setAllAvailableTags(all);
      }
    } catch (e) {
      // Quiet fail
    }
  };

  const fetchSuggestedTags = async (activePhone: string) => {
    try {
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('Tags')
        .eq('Userphonenumber', activePhone)
        .order('id', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data) {
        const counts: Record<string, number> = {};
        const recents: string[] = [];
        const seenRecents = new Set<string>();
        const allTagsSet = new Set<string>();

        for (const row of data) {
          if (!row.Tags) continue;
          const splitTags = row.Tags.split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);

          for (const tag of splitTags) {
            allTagsSet.add(tag);
            counts[tag] = (counts[tag] || 0) + 1;
            if (!seenRecents.has(tag)) {
              seenRecents.add(tag);
              recents.push(tag);
            }
          }
        }

        const sortedMostUsed = Object.keys(counts)
          .sort((a, b) => counts[b] - counts[a])
          .slice(0, 8);
        const sortedRecents = recents.slice(0, 8);
        const allList = Array.from(allTagsSet);

        setMostUsedTags(sortedMostUsed);
        setRecentTags(sortedRecents);
        setAllAvailableTags(allList);

        AsyncStorage.setItem(
          `cached_tags_${activePhone}`,
          JSON.stringify({ most: sortedMostUsed, recent: sortedRecents, all: allList })
        );
      }
    } catch (err) {
      // Quiet fail
    }
  };

  const tagSuggestions = useMemo(() => {
    const query = tagInput.trim().toLowerCase();
    if (!query) return [];

    return allAvailableTags
      .filter((tag) => {
        const lower = tag.toLowerCase();
        return lower.includes(query) && !tagsList.includes(tag);
      })
      .slice(0, 5);
  }, [tagInput, allAvailableTags, tagsList]);

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
          const digitsOnly = rawNumber.replace(/\D/g, '');
          const clean10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
          setPhone(clean10);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not pick contact');
    }
  };

  const handleAddTag = (text: string) => {
    const clean = text.replace(/,/g, '').trim();
    if (clean && !tagsList.includes(clean)) {
      setTagsList((prev) => [...prev, clean]);
    }
    setTagInput('');
  };

  // Keep keyboard open and re-focus input immediately upon picking a suggestion
  const handleSelectSuggestion = (tag: string) => {
    if (!tagsList.includes(tag)) {
      setTagsList((prev) => [...prev, tag]);
    }
    setTagInput('');
    tagInputRef.current?.focus();
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsList((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleClearAllTags = () => {
    setTagsList([]);
    setTagInput('');
  };

  const handleTagInputChange = (text: string) => {
    if (text.includes(',')) {
      handleAddTag(text);
    } else {
      setTagInput(text);
    }
  };

  const handleAddTagSuggestion = (tagToAdd: string) => {
    if (!tagsList.includes(tagToAdd)) {
      setTagsList((prev) => [...prev, tagToAdd]);
    }
    tagInputRef.current?.focus();
  };

  // Gmail-style backspace delete when input text is empty
  const handleKeyPress = ({ nativeEvent }: any) => {
    if (nativeEvent.key === 'Backspace' && tagInput === '' && tagsList.length > 0) {
      setTagsList((prev) => prev.slice(0, -1));
    }
  };

  const scrollToTagArea = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, tagSectionY - 15),
        animated: true,
      });
    }, 100);
  };

  const scrollToNotesArea = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
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

    const currentPending = tagInput.replace(/,/g, '').trim();
    const finalTags = [...tagsList];
    if (currentPending && !finalTags.includes(currentPending)) {
      finalTags.push(currentPending);
    }

    if (finalTags.length === 0) {
      Alert.alert('Alert', 'Please enter at least one Tag');
      return;
    }

    setLoading(true);
    try {
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

      const sanitizedTags = finalTags
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
      setTagsList([]);
      setTagInput('');
      setNotes('');
      fetchSuggestedTags(userPhone);
      navigation.navigate('Contacts');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save contact');
    } finally {
      setLoading(false);
    }
  };

  const activeTags = tagTab === 'most' ? mostUsedTags : recentTags;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
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
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Phone Number (10 digits) *</Text>
          <TextInput
            style={styles.input}
            placeholder="10-digit number"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            maxLength={10}
            value={phone}
            onChangeText={setPhone}
          />

          {/* Tags & Suggestions Section */}
          <View
            ref={tagSectionRef}
            onLayout={(event) => setTagSectionY(event.nativeEvent.layout.y)}
          >
            <View style={styles.tagsLabelRow}>
              <Text style={styles.labelInRow}>Tags (use comma to add) *</Text>
              {(tagsList.length > 0 || tagInput.length > 0) && (
                <TouchableOpacity
                  onPress={handleClearAllTags}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.clearAllText}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              activeOpacity={1}
              style={styles.tagInputWrapper}
              onPress={() => tagInputRef.current?.focus()}
            >
              {tagsList.map((tag, idx) => (
                <View key={idx} style={styles.selectedTagChip}>
                  <Text style={styles.selectedTagText}>{tag}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveTag(tag)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={16} color="#4338CA" />
                  </TouchableOpacity>
                </View>
              ))}
              <TextInput
                ref={tagInputRef}
                style={styles.chipTextInput}
                placeholder={tagsList.length === 0 ? 'e.g. Client, Bangalore, RealEstate' : 'Add more...'}
                placeholderTextColor="#94A3B8"
                value={tagInput}
                onChangeText={handleTagInputChange}
                onKeyPress={handleKeyPress}
                onFocus={scrollToTagArea}
                onSubmitEditing={() => {
                  handleAddTag(tagInput);
                  Keyboard.dismiss();
                }}
                blurOnSubmit={true}
                returnKeyType="done"
              />
            </TouchableOpacity>

            {/* Dropdown Suggestions List */}
            {tagSuggestions.length > 0 && (
              <View style={styles.suggestionsDropdown}>
                {tagSuggestions.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestionRow}
                    onPress={() => handleSelectSuggestion(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pricetag-outline" size={15} color="#2563EB" />
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      {item}
                    </Text>
                    <Text style={styles.suggestionTypeBadge}>Tag</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {(mostUsedTags.length > 0 || recentTags.length > 0) && (
              <View style={styles.suggestionsContainer}>
                <View style={styles.tagTabsRow}>
                  <TouchableOpacity
                    onPress={() => setTagTab('most')}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={[styles.tabLabel, tagTab === 'most' && styles.tabLabelActive]}>
                      Most Used
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.tabDivider}>|</Text>
                  <TouchableOpacity
                    onPress={() => setTagTab('recent')}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={[styles.tabLabel, tagTab === 'recent' && styles.tabLabelActive]}>
                      Recently Used
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.suggestionChipsWrap}>
                  {activeTags.map((tag, idx) => (
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
          </View>

          <Text style={styles.label}>Other Details / Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Optional details, address, or reminders..."
            placeholderTextColor="#94A3B8"
            multiline={true}
            numberOfLines={4}
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
            onFocus={scrollToNotesArea}
          />
        </View>
      </ScrollView>

      {/* Pinned Action Bar */}
      <View style={styles.bottomBar}>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { padding: 16, paddingBottom: 32 },
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
  tagsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 6,
  },
  labelInRow: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  tagInputWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 8,
    gap: 6,
    backgroundColor: '#F8FAFC',
    minHeight: 46,
  },
  selectedTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 14,
    gap: 5,
  },
  selectedTagText: {
    fontSize: 13,
    color: '#3730A3',
    fontWeight: '600',
  },
  chipTextInput: {
    flexGrow: 1,
    minWidth: 140,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  suggestionsDropdown: {
    backgroundColor: '#FFFFFF',
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  suggestionTypeBadge: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: '#94A3B8',
    fontWeight: '700',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    minHeight: 90,
    maxHeight: 160,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
  },
  suggestionsContainer: { marginTop: 10 },
  tagTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabLabelActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  tabDivider: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  suggestionChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestionChip: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  suggestionChipText: { fontSize: 12, color: '#3730A3', fontWeight: '600' },
  bottomBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: -2 },
  },
  saveButton: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
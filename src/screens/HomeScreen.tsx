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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';

interface LinkedContactState {
  name: string;
  phone: string;
  primaryTag?: string;
}

interface ContactItem {
  id: string | number;
  Name: string;
  Phonenumber: string;
  Tags: string;
}

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tagsList, setTagsList] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [linkedContacts, setLinkedContacts] = useState<LinkedContactState[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [userPhone, setUserPhone] = useState('9999999999');
  const [mostUsedTags, setMostUsedTags] = useState<string[]>([]);
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const [tagTab, setTagTab] = useState<'most' | 'recent'>('most');
  const [allAvailableTags, setAllAvailableTags] = useState<string[]>([]);
  const [allContacts, setAllContacts] = useState<ContactItem[]>([]);
  const [tagSectionY, setTagSectionY] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const tagSectionRef = useRef<View>(null);
  const tagInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setName('');
      setPhone('');
      setTagsList([]);
      setTagInput('');
      setLinkedContacts([]);
      setNotes('');

      AsyncStorage.getItem('user_phone').then((storedPhone) => {
        const active = storedPhone || userPhone;
        if (storedPhone) setUserPhone(storedPhone);
        loadCachedTags(active);
        fetchSuggestedTags(active);
        fetchAllContacts(active);
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

  const fetchAllContacts = async (activePhone: string) => {
    try {
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('id, Name, Phonenumber, Tags')
        .eq('Userphonenumber', activePhone)
        .order('id', { ascending: false });

      if (!error && data) {
        setAllContacts(data);
      }
    } catch {
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

  // Section 1: Standard Keyword Tags Filter (All matches included)
  const tagSuggestions = useMemo(() => {
    const query = tagInput.trim().toLowerCase();
    if (!query) return [];

    return allAvailableTags.filter((tag) => {
      const lower = tag.toLowerCase();
      return lower.includes(query) && !tagsList.includes(tag);
    });
  }, [tagInput, allAvailableTags, tagsList]);

  // Section 2: Contact Links Filter (All matches included with Matched Tag Priority)
  const contactSuggestions = useMemo(() => {
    const query = tagInput.trim().toLowerCase();
    if (!query) return [];

    const linkedPhonesSet = new Set(linkedContacts.map((c) => c.phone));
    const currentInputPhone = phone.trim().slice(-10);

    return allContacts
      .filter((contact) => {
        const cleanContactPhone = (contact.Phonenumber || '').replace(/\D/g, '').slice(-10);

        // Prevent linking to the number currently being typed in this contact
        if (currentInputPhone && cleanContactPhone === currentInputPhone) return false;
        // Don't show contacts already linked in the chips list
        if (linkedPhonesSet.has(cleanContactPhone)) return false;

        const nameMatch = contact.Name?.toLowerCase().includes(query);
        const phoneMatch = cleanContactPhone.includes(query);
        const tagsMatch = contact.Tags?.toLowerCase().includes(query);

        return nameMatch || phoneMatch || tagsMatch;
      })
      .map((contact) => {
        const rawTags = contact.Tags
          ? contact.Tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [];

        // Put the matched tag first
        const matchedTags: string[] = [];
        const otherTags: string[] = [];

        rawTags.forEach((t) => {
          if (t.toLowerCase().includes(query)) {
            matchedTags.push(t);
          } else {
            otherTags.push(t);
          }
        });

        const sortedTags = [...matchedTags, ...otherTags];
        const clean10 = (contact.Phonenumber || '').replace(/\D/g, '').slice(-10);

        return {
          ...contact,
          cleanPhone: clean10,
          sortedTags,
          hasDirectTagMatch: matchedTags.length > 0,
        };
      });
  }, [tagInput, allContacts, phone, linkedContacts]);

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

  const handleSelectSuggestion = (tag: string) => {
    if (!tagsList.includes(tag)) {
      setTagsList((prev) => [...prev, tag]);
    }
    setTagInput('');
    tagInputRef.current?.focus();
  };

  const handleSelectContact = (contact: any) => {
    const clean10 = contact.cleanPhone || (contact.Phonenumber || '').replace(/\D/g, '').slice(-10);
    const primaryTag = contact.sortedTags && contact.sortedTags[0] ? contact.sortedTags[0] : '';

    if (!linkedContacts.some((c) => c.phone === clean10)) {
      setLinkedContacts((prev) => [
        ...prev,
        {
          name: contact.Name || 'Unnamed',
          phone: clean10,
          primaryTag: primaryTag,
        },
      ]);
    }
    setTagInput('');
    tagInputRef.current?.focus();
  };

  const handleRemoveLinkedContact = (phoneToRemove: string) => {
    setLinkedContacts((prev) => prev.filter((c) => c.phone !== phoneToRemove));
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsList((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleClearAllTags = () => {
    setTagsList([]);
    setLinkedContacts([]);
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

  const handleKeyPress = ({ nativeEvent }: any) => {
    if (nativeEvent.key === 'Backspace' && tagInput === '') {
      if (tagsList.length > 0) {
        setTagsList((prev) => prev.slice(0, -1));
      } else if (linkedContacts.length > 0) {
        setLinkedContacts((prev) => prev.slice(0, -1));
      }
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

      const linkedPhonesString =
        linkedContacts.length > 0
          ? linkedContacts.map((c) => c.phone).join(', ')
          : null;

      const { error: insertError } = await supabase.from('Contacts_Table').insert([
        {
          Name: name.trim(),
          Phonenumber: cleanPhone,
          Tags: sanitizedTags,
          OtherDetails: notes.trim(),
          Userphonenumber: userPhone,
          LinkedContactPhone: linkedPhonesString,
        },
      ]);

      if (insertError) throw insertError;

      Alert.alert('Success', 'Contact saved successfully!');
      setName('');
      setPhone('');
      setTagsList([]);
      setTagInput('');
      setLinkedContacts([]);
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
  const dynamicBottomPadding = keyboardVisible ? 12 : Math.max(insets.bottom, 12) + 6;

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
              {(tagsList.length > 0 || tagInput.length > 0 || linkedContacts.length > 0) && (
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
              {/* Render Multiple Linked Contacts */}
              {linkedContacts.map((contact) => (
                <View key={`linked-${contact.phone}`} style={styles.linkedChip}>
                  <Ionicons name="link" size={13} color="#4F46E5" />
                  <Text style={styles.linkedChipText} numberOfLines={1}>
                    {contact.name}
                    {contact.primaryTag ? ` (${contact.primaryTag})` : ''}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveLinkedContact(contact.phone)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={16} color="#4F46E5" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Category Tags */}
              {tagsList.map((tag, idx) => (
                <View key={`tag-${idx}`} style={styles.selectedTagChip}>
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
                placeholder={
                  tagsList.length === 0 && linkedContacts.length === 0
                    ? 'e.g. Client, Bangalore, RealEstate'
                    : 'Add more...'
                }
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

            {/* Scrollable Dual Dropdown for all matching results */}
            {(tagSuggestions.length > 0 || contactSuggestions.length > 0) && (
              <View style={styles.suggestionsDropdownContainer}>
                <ScrollView
                  style={styles.suggestionsScroll}
                  keyboardShouldPersistTaps="always"
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  {tagSuggestions.length > 0 && (
                    <View>
                      <View style={styles.dropdownSectionHeader}>
                        <Ionicons name="pricetag-outline" size={12} color="#64748B" />
                        <Text style={styles.dropdownSectionTitle}>Tags ({tagSuggestions.length})</Text>
                      </View>
                      {tagSuggestions.map((item, idx) => (
                        <TouchableOpacity
                          key={`tag-${idx}`}
                          style={styles.suggestionRow}
                          onPress={() => handleSelectSuggestion(item)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="pricetag-outline" size={14} color="#2563EB" />
                          <Text style={styles.suggestionText} numberOfLines={1}>
                            {item}
                          </Text>
                          <Text style={styles.suggestionTypeBadge}>Tag</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {contactSuggestions.length > 0 && (
                    <View>
                      <View
                        style={[
                          styles.dropdownSectionHeader,
                          tagSuggestions.length > 0 && styles.dropdownSectionDivider,
                        ]}
                      >
                        <Ionicons name="people-outline" size={12} color="#64748B" />
                        <Text style={styles.dropdownSectionTitle}>
                          Link Contact (People) ({contactSuggestions.length})
                        </Text>
                      </View>
                      {contactSuggestions.map((item) => {
                        const tagsArray = item.sortedTags || [];
                        const remainingCount = tagsArray.length > 2 ? tagsArray.length - 2 : 0;

                        return (
                          <TouchableOpacity
                            key={`contact-${item.id || item.cleanPhone}`}
                            style={styles.contactSuggestionRow}
                            onPress={() => handleSelectContact(item)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.contactAvatar}>
                              <Ionicons name="person" size={14} color="#4F46E5" />
                            </View>
                            <View style={styles.contactInfo}>
                              <View style={styles.contactNameRow}>
                                <Text style={styles.contactNameText}>
                                  {item.Name || 'Unnamed'}
                                </Text>
                                <Text style={styles.contactPhoneSub}>
                                  {item.cleanPhone}
                                </Text>
                              </View>
                              {tagsArray.length > 0 && (
                                <View style={styles.contactTagsPreviewRow}>
                                  {tagsArray.slice(0, 2).map((t: string, i: number) => {
                                    const isQueryMatch =
                                      tagInput.trim() &&
                                      t.toLowerCase().includes(tagInput.trim().toLowerCase());

                                    return (
                                      <View
                                        key={i}
                                        style={[
                                          styles.previewTagPill,
                                          isQueryMatch && styles.previewTagPillMatched,
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.previewTagText,
                                            isQueryMatch && styles.previewTagTextMatched,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {t}
                                        </Text>
                                      </View>
                                    );
                                  })}
                                  {remainingCount > 0 && (
                                    <Text style={styles.previewTagMore}>+{remainingCount} more</Text>
                                  )}
                                </View>
                              )}
                            </View>
                            <Ionicons name="link-outline" size={18} color="#6366F1" />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
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
      <View style={[styles.bottomBar, { paddingBottom: dynamicBottomPadding }]}>
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
  linkedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderColor: '#818CF8',
    borderWidth: 1.5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    gap: 6,
    maxWidth: '100%',
  },
  linkedChipText: {
    fontSize: 13,
    color: '#3730A3',
    fontWeight: '700',
    flexShrink: 1,
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
  suggestionsDropdownContainer: {
    backgroundColor: '#FFFFFF',
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    overflow: 'hidden',
    maxHeight: 260,
  },
  suggestionsScroll: {
    flexGrow: 0,
  },
  dropdownSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#F8FAFC',
  },
  dropdownSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownSectionDivider: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 4,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
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
  contactSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  contactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  contactNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  contactPhoneSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  contactTagsPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  previewTagPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  previewTagPillMatched: {
    backgroundColor: '#DBEAFE',
    borderWidth: 0.5,
    borderColor: '#93C5FD',
  },
  previewTagText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  previewTagTextMatched: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  previewTagMore: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
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
    paddingTop: 12,
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
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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
  Phonelabels?: string;
  Tags: string;
  PrimaryTag?: string;
}

interface PhoneEntry {
  number: string;
  label: string;
}

const POPULAR_LABELS = ['Mobile', 'Work', 'Personal', 'WhatsApp', 'Home'];

export default function EditContactPage({ route, navigation }: any) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [phoneEntries, setPhoneEntries] = useState<PhoneEntry[]>([
    { number: '', label: 'Mobile' }
  ]);
  const [activeLabelIndex, setActiveLabelIndex] = useState<number | null>(null);
  const [tagsList, setTagsList] = useState<string[]>([]);
  const [primaryTag, setPrimaryTag] = useState('');
  const [isPrimaryDropdownOpen, setIsPrimaryDropdownOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [linkedContacts, setLinkedContacts] = useState<LinkedContactState[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userPhone, setUserPhone] = useState('9999999999');
  const [mostUsedTags, setMostUsedTags] = useState<string[]>([]);
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const [tagTab, setTagTab] = useState<'recent' | 'most'>('recent');
  const [allAvailableTags, setAllAvailableTags] = useState<string[]>([]);
  const [allContacts, setAllContacts] = useState<ContactItem[]>([]);
  const [tagSectionY, setTagSectionY] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const tagSectionRef = useRef<View>(null);
  const tagInputRef = useRef<TextInput>(null);

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
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('user_phone').then((storedPhone) => {
      const active = storedPhone || userPhone;
      if (storedPhone) setUserPhone(storedPhone);
      loadCachedTags(active);
      fetchSuggestedTags(active);
      fetchAllContacts(active);
    });
    loadContact();
  }, [id]);

  // Reactive Syncing: Auto-sync primary tag if general tags change or get deleted
  useEffect(() => {
    if (tagsList.length > 0) {
      if (!primaryTag || !tagsList.includes(primaryTag)) {
        setPrimaryTag(tagsList[0]);
      }
    } else {
      setPrimaryTag('');
    }
  }, [tagsList]);

  const loadCachedTags = async (activePhone: string) => {
    try {
      const cached = await AsyncStorage.getItem(`cached_tags_${activePhone}`);
      if (cached) {
        const { most, recent, all } = JSON.parse(cached);
        if (most) setMostUsedTags(most);
        if (recent) setRecentTags(recent);
        if (all) setAllAvailableTags(all);
      }
    } catch {
      // Quiet fail
    }
  };

  const fetchAllContacts = async (activePhone: string) => {
    try {
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('id, Name, Phonenumber, Phonelabels, Tags, PrimaryTag')
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
    } catch {
      // Quiet fail
    }
  };

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
        setNotes(data.OtherDetails || '');
        setPrimaryTag(data.PrimaryTag || '');

        const numbers = (data.Phonenumber || '').split(',').map((p: string) => p.trim()).filter(Boolean);
        const labels = (data.Phonelabels || '').split(',').map((l: string) => l.trim()).filter(Boolean);

        if (numbers.length > 0) {
          const mappedEntries = numbers.map((num: string, idx: number) => ({
            number: num,
            label: labels[idx] || 'Mobile',
          }));
          setPhoneEntries(mappedEntries);
        } else {
          setPhoneEntries([{ number: '', label: 'Mobile' }]);
        }

        if (data.Tags) {
          const parsedTags = data.Tags.split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);
          setTagsList(parsedTags);
        } else {
          setTagsList([]);
        }

        if (data.LinkedContactPhone) {
          const linkedPhones = data.LinkedContactPhone.split(',')
            .map((p: string) => p.trim().slice(-10))
            .filter(Boolean);

          const storedUserPhone = await AsyncStorage.getItem('user_phone');
          const activeUser = storedUserPhone || userPhone;

          const { data: contactsData } = await supabase
            .from('Contacts_Table')
            .select('id, Name, Phonenumber, Phonelabels, Tags, PrimaryTag')
            .eq('Userphonenumber', activeUser);

          if (contactsData) {
            const resolved = linkedPhones.map((lPhone: string) => {
              const matched = contactsData.find(
                (c: any) => (c.Phonenumber || '').replace(/\D/g, '').slice(-10) === lPhone
              );
              const tagsArray = matched?.Tags
                ? matched.Tags.split(',').map((t: string) => t.trim()).filter(Boolean)
                : [];

              return {
                name: matched?.Name || 'Linked Contact',
                phone: lPhone,
                primaryTag: matched?.PrimaryTag || tagsArray[0] || '',
              };
            });
            setLinkedContacts(resolved);
          }
        } else {
          setLinkedContacts([]);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load contact');
    } finally {
      setLoading(false);
    }
  };

  const tagSuggestions = useMemo(() => {
    const query = tagInput.trim().toLowerCase();
    if (!query) return [];

    return allAvailableTags.filter((tag) => {
      const lower = tag.toLowerCase();
      return lower.includes(query) && !tagsList.includes(tag);
    });
  }, [tagInput, allAvailableTags, tagsList]);

  const contactSuggestions = useMemo(() => {
    const query = tagInput.trim().toLowerCase();
    if (!query) return [];

    const linkedPhonesSet = new Set(linkedContacts.map((c) => c.phone));
    const currentInputPhones = new Set(phoneEntries.map((e) => e.number.trim().slice(-10)).filter(Boolean));

    return allContacts
      .filter((contact) => {
        const contactNumbers = (contact.Phonenumber || '').split(',').map(n => n.replace(/\D/g, '').slice(-10));
        
        const isSelfMatch = contactNumbers.some(num => currentInputPhones.has(num));
        if (isSelfMatch) return false;

        const isAlreadyLinked = contactNumbers.some(num => linkedPhonesSet.has(num));
        if (isAlreadyLinked) return false;

        const nameMatch = contact.Name?.toLowerCase().includes(query);
        const phoneMatch = contactNumbers.some(num => num.includes(query));
        const tagsMatch = contact.Tags?.toLowerCase().includes(query);

        return nameMatch || phoneMatch || tagsMatch;
      })
      .map((contact) => {
        const rawTags = contact.Tags
          ? contact.Tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [];

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
        const primaryCleanPhone = (contact.Phonenumber || '').split(',')[0].replace(/\D/g, '').slice(-10);

        return {
          ...contact,
          cleanPhone: primaryCleanPhone,
          sortedTags,
          hasDirectTagMatch: matchedTags.length > 0,
        };
      });
  }, [tagInput, allContacts, phoneEntries, linkedContacts]);

  const handleAddPhoneField = () => {
    const lastEntry = phoneEntries[phoneEntries.length - 1];
    if (!lastEntry || lastEntry.number.trim().length !== 10) {
      Alert.alert('Incomplete Number', 'Please enter a valid 10-digit phone number in the current row before adding a new one.');
      return;
    }
    setPhoneEntries((prev) => [...prev, { number: '', label: 'Mobile' }]);
  };

  const handleRemovePhoneField = (index: number) => {
    if (phoneEntries.length === 1) return;
    setPhoneEntries((prev) => prev.filter((_, i) => i !== index));
    if (activeLabelIndex === index) setActiveLabelIndex(null);
  };

  const handleUpdatePhoneEntry = (index: number, field: 'number' | 'label', value: string) => {
    const cleanedValue = field === 'number' ? value.replace(/\D/g, '').slice(0, 10) : value;

    setPhoneEntries((prev) => {
      const updated = [...prev];
      updated[index][field] = cleanedValue;
      return updated;
    });

    if (field === 'number' && cleanedValue.length === 10) {
      const isDuplicateInForm = phoneEntries.some(
        (entry, idx) => idx !== index && entry.number.trim() === cleanedValue
      );

      if (isDuplicateInForm) {
        Alert.alert('Duplicate Number', 'This phone number is already entered in another row.');
        return;
      }

      Promise.resolve(
        supabase
          .from('Contacts_Table')
          .select('id, Name')
          .eq('Userphonenumber', userPhone)
          .neq('id', id)
          .or(`Phonenumber.eq.${cleanedValue},Phonenumber.like.%${cleanedValue}%`)
      )
        .then(({ data }) => {
          if (data && data.length > 0) {
            Alert.alert('Duplicate Contact', 'This phone number is already saved in another contact.');
          }
        })
        .catch(() => {});
    }
  };

  const handleMoveToPrimary = (index: number) => {
    if (index === 0) return;
    setPhoneEntries((prev) => {
      const updated = [...prev];
      const [targetItem] = updated.splice(index, 1);
      updated.unshift(targetItem);
      return updated;
    });
    setActiveLabelIndex(null);
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
    const clean10 = contact.cleanPhone || (contact.Phonenumber || '').split(',')[0].replace(/\D/g, '').slice(-10);
    const pTag = contact.PrimaryTag || (contact.sortedTags && contact.sortedTags[0] ? contact.sortedTags[0] : '');

    if (!linkedContacts.some((c) => c.phone === clean10)) {
      setLinkedContacts((prev) => [
        ...prev,
        {
          name: contact.Name || 'Unnamed',
          phone: clean10,
          primaryTag: pTag,
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
    setPrimaryTag('');
    setIsPrimaryDropdownOpen(false);
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

  const handleUpdate = async () => {
    if (!name.trim()) {
      Alert.alert('Alert', 'Please enter Name');
      return;
    }

    const seenNumbers = new Set<string>();
    for (let i = 0; i < phoneEntries.length; i++) {
      const entry = phoneEntries[i];
      if (!entry.number.trim() && !entry.label.trim()) continue;

      if (!entry.label.trim()) {
        Alert.alert('Alert', `Please enter a label for phone number row ${i + 1}.`);
        return;
      }
      if (!entry.number.trim()) {
        Alert.alert('Alert', `Please enter a phone number for row ${i + 1} (${entry.label}).`);
        return;
      }
      if (entry.number.trim().length !== 10 || !/^\d{10}$/.test(entry.number.trim())) {
        Alert.alert('Alert', `Phone number in row ${i + 1} must be exactly 10 digits.`);
        return;
      }

      if (seenNumbers.has(entry.number.trim())) {
        Alert.alert('Duplicate Number', `Phone number "${entry.number.trim()}" is duplicated in the form.`);
        return;
      }
      seenNumbers.add(entry.number.trim());
    }

    const validEntries = phoneEntries.filter((e) => e.number.trim().length > 0);
    if (validEntries.length === 0) {
      Alert.alert('Alert', 'Please enter at least one valid phone number.');
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

    // Mandatory Primary Tag validation check
    if (!primaryTag.trim()) {
      Alert.alert('Validation Error', 'Primary Tag cannot be empty. Please select or enter a primary tag.');
      return;
    }

    setSaving(true);
    try {
      for (const entry of validEntries) {
        const num = entry.number.trim();
        const { data: existing, error: checkError } = await supabase
          .from('Contacts_Table')
          .select('id, Name')
          .eq('Userphonenumber', userPhone)
          .neq('id', id)
          .or(`Phonenumber.eq.${num},Phonenumber.like.%${num}%`);

        if (checkError) throw checkError;

        if (existing && existing.length > 0) {
          Alert.alert('Duplicate Contact', `Phone number ${num} is already saved under another contact.`);
          setSaving(false);
          return;
        }
      }

      const numbersStr = validEntries.map((e) => e.number.trim()).join(', ');
      const labelsStr = validEntries.map((e) => e.label.trim() || 'Mobile').join(', ');

      const sanitizedTags = finalTags
        .map((t) => t.trim())
        .filter(Boolean)
        .join(', ');

      const linkedPhonesString =
        linkedContacts.length > 0
          ? linkedContacts.map((c) => c.phone).join(', ')
          : null;

      const { error } = await supabase
        .from('Contacts_Table')
        .update({
          Name: name.trim(),
          Phonenumber: numbersStr,
          Phonelabels: labelsStr,
          Tags: sanitizedTags,
          PrimaryTag: primaryTag.trim(),
          OtherDetails: notes.trim(),
          LinkedContactPhone: linkedPhonesString,
        })
        .eq('id', id);

      if (error) throw error;
      fetchSuggestedTags(userPhone);
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

  const activeTags = tagTab === 'recent' ? recentTags : mostUsedTags;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const dynamicBottomPadding = keyboardVisible ? 12 : Math.max(insets.bottom, 12) + 6;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.labelTop}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="John Doe"
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
          />

          {/* Multiple Phone Numbers & Labels Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>Phone Numbers & Labels *</Text>
            <TouchableOpacity onPress={handleAddPhoneField} style={styles.addPhoneRowBtn} activeOpacity={0.7}>
              <Ionicons name="add-circle" size={16} color="#2563EB" />
              <Text style={styles.addPhoneRowBtnText}>Add Number</Text>
            </TouchableOpacity>
          </View>

          {phoneEntries.map((entry, index) => {
            const filteredSuggestions = POPULAR_LABELS.filter(
              l => l.toLowerCase().includes(entry.label.toLowerCase()) && l.toLowerCase() !== entry.label.toLowerCase()
            );

            return (
              <View key={index} style={styles.phoneRowWrapper}>
                <View style={styles.phoneInputRow}>
                  <View style={styles.labelInputContainer}>
                    <TextInput
                      style={styles.phoneLabelInput}
                      placeholder="Label"
                      placeholderTextColor="#94A3B8"
                      value={entry.label}
                      onChangeText={(val) => {
                        handleUpdatePhoneEntry(index, 'label', val);
                        setActiveLabelIndex(index);
                      }}
                      onFocus={() => setActiveLabelIndex(index)}
                    />
                  </View>

                  <TextInput
                    style={styles.phoneNumberInput}
                    placeholder="10-digit number"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    maxLength={10}
                    value={entry.number}
                    onChangeText={(val) => handleUpdatePhoneEntry(index, 'number', val)}
                  />

                  {index > 0 && (
                    <TouchableOpacity
                      onPress={() => handleMoveToPrimary(index)}
                      style={styles.actionIconButton}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-up" size={18} color="#D97706" />
                    </TouchableOpacity>
                  )}

                  {phoneEntries.length > 1 && (
                    <TouchableOpacity
                      onPress={() => handleRemovePhoneField(index)}
                      style={styles.deleteIconButton}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>

                {activeLabelIndex === index && filteredSuggestions.length > 0 && (
                  <View style={styles.labelSuggestionsDropdown}>
                    {filteredSuggestions.map((sug, sIdx) => (
                      <TouchableOpacity
                        key={sIdx}
                        style={styles.labelSuggestionItem}
                        onPress={() => {
                          handleUpdatePhoneEntry(index, 'label', sug);
                          setActiveLabelIndex(null);
                        }}
                      >
                        <Text style={styles.labelSuggestionText}>{sug}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

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
                    ? 'Work, Client, Vendor'
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

            {/* Primary Tag Section with Auto-Suggest Dropdown */}
            <Text style={styles.label}>Primary Tag *</Text>
            <View style={styles.primaryInputWrapper}>
              <TextInput 
                style={styles.input} 
                value={primaryTag} 
                onChangeText={(text) => {
                  setPrimaryTag(text);
                  setIsPrimaryDropdownOpen(true);
                }} 
                onFocus={() => setIsPrimaryDropdownOpen(true)} 
                placeholder="Type or select primary tag"
                placeholderTextColor="#94A3B8"
              />

              {isPrimaryDropdownOpen && tagsList.length > 0 && (
                <View style={styles.autoSuggestDropdown}>
                  {tagsList
                    .filter((tag) => tag.toLowerCase().includes(primaryTag.toLowerCase()))
                    .map((tag) => (
                      <TouchableOpacity
                        key={tag}
                        style={styles.autoSuggestItem}
                        onPress={() => {
                          setPrimaryTag(tag);
                          setIsPrimaryDropdownOpen(false);
                        }}
                      >
                        <Text style={styles.autoSuggestItemText}>{tag}</Text>
                      </TouchableOpacity>
                    ))}
                </View>
              )}
            </View>

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
                    onPress={() => setTagTab('recent')}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={[styles.tabLabel, tagTab === 'recent' && styles.tabLabelActive]}>
                      Recently Used
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.tabDivider}>|</Text>
                  <TouchableOpacity
                    onPress={() => setTagTab('most')}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={[styles.tabLabel, tagTab === 'most' && styles.tabLabelActive]}>
                      Most Used
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

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Add any extra details or remarks..."
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
          style={styles.saveBtn}
          onPress={handleUpdate}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <View style={styles.btnRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
              <Text style={styles.btnText}>Update Contact</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDelete}
          disabled={saving}
          activeOpacity={0.8}
        >
          <View style={styles.btnRow}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
            <Text style={styles.deleteBtnText}>Delete Contact</Text>
          </View>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    paddingTop: 4,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  labelTop: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 4,
  },
  addPhoneRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addPhoneRowBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  phoneRowWrapper: {
    marginBottom: 6,
    position: 'relative',
    zIndex: 10,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelInputContainer: {
    width: 80,
  },
  phoneLabelInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
  },
  labelSuggestionsDropdown: {
    position: 'absolute',
    top: 46,
    left: 0,
    width: 105,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 100,
  },
  labelSuggestionItem: {
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  labelSuggestionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  phoneNumberInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  actionIconButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIconButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -4,
  },
  tagsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 4,
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
    minHeight: 44,
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
    padding: 6,
    gap: 6,
    backgroundColor: '#F8FAFC',
    minHeight: 44,
  },
  linkedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderColor: '#818CF8',
    borderWidth: 1.5,
    paddingVertical: 3,
    paddingHorizontal: 8,
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
    paddingVertical: 3,
    paddingHorizontal: 8,
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
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  primaryInputWrapper: {
    position: 'relative',
    zIndex: 20,
  },
  autoSuggestDropdown: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 100,
  },
  autoSuggestItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  autoSuggestItemText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
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
  suggestionsContainer: { marginTop: 8 },
  tagTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
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
  saveBtn: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
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
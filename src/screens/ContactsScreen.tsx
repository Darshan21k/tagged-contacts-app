import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import { Contact } from '../types';

interface ContactCardProps {
  item: Contact;
  onPress: () => void;
  onCall: (phone: string) => void;
  onWhatsApp: (phone: string) => void;
}

const ContactCard = React.memo(({ item, onPress, onCall, onWhatsApp }: ContactCardProps) => {
  const tagList = item.Tags
    ? item.Tags.split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .sort((a, b) => a.length - b.length || a.localeCompare(b))
    : [];

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.headerInfo}>
          <Text style={styles.nameText} numberOfLines={1}>
            {item.Name}
          </Text>
          <TouchableOpacity onPress={() => onCall(item.Phonenumber)} activeOpacity={0.7}>
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={15} color="#2563EB" />
              <Text style={styles.phoneText}>+91 {item.Phonenumber}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.iconButton, styles.whatsappButton]}
            onPress={() => onWhatsApp(item.Phonenumber)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.callButton]}
            onPress={() => onCall(item.Phonenumber)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="call" size={17} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {tagList.length > 0 && (
        <View style={styles.tagContainer}>
          {tagList.map((tag, index) => (
            <View key={index} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {item.OtherDetails ? (
        <Text style={styles.detailsText} numberOfLines={2}>
          {item.OtherDetails}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

export default function ContactsScreen({ navigation, route }: any) {
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [pinnedTags, setPinnedTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [userPhone, setUserPhone] = useState('9999999999');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem('user_phone').then((phone) => {
      if (phone) setUserPhone(phone);
    });
  }, []);

  useEffect(() => {
    if (route.params?.selectedTag !== undefined) {
      const chosenTag = route.params.selectedTag ? route.params.selectedTag.trim() : '';
      setSelectedTag(chosenTag || null);
      setSearchQuery(chosenTag);
      setShowSuggestions(true);
      navigation.setParams({ selectedTag: undefined });
    }
  }, [route.params?.selectedTag, navigation]);

  const fetchPinnedTags = useCallback(async (activePhone: string) => {
    try {
      const { data, error } = await supabase
        .from('PinnedTags')
        .select('Tagname')
        .eq('Userphonenumber', activePhone)
        .eq('Pinned', true);

      if (error) throw error;
      const rawTags = (data || []).map((item: { Tagname: string }) => item.Tagname);
      const sortedTags = rawTags.sort((a, b) => a.length - b.length || a.localeCompare(b));
      setPinnedTags(sortedTags);
    } catch (err: any) {
      console.warn('Failed to load pinned tags:', err.message);
    }
  }, []);

  const fetchContactsData = useCallback(async () => {
    setLoading(true);
    try {
      const activePhone = (await AsyncStorage.getItem('user_phone')) || userPhone;
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('*')
        .eq('Userphonenumber', activePhone)
        .order('Name', { ascending: true });

      if (error) throw error;
      setAllContacts(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  }, [userPhone]);

  useFocusEffect(
    useCallback(() => {
      const run = async () => {
        const storedPhone = await AsyncStorage.getItem('user_phone');
        fetchPinnedTags(storedPhone || userPhone);
        fetchContactsData();
      };
      run();
    }, [userPhone, fetchPinnedTags, fetchContactsData])
  );

  // Suggestions match against the current query or the active token
  const suggestions = useMemo(() => {
    const rawQuery = searchQuery.trim().toLowerCase();
    if (!rawQuery || !showSuggestions) return [];

    // Extract the active typing token (last word if user entered multiple)
    const tokens = rawQuery.split(/[,\s]+/).filter(Boolean);
    const activeToken = tokens[tokens.length - 1] || '';
    if (!activeToken) return [];

    const nameMatches = new Set<string>();
    const tagMatches = new Set<string>();

    for (const contact of allContacts) {
      const name = (contact.Name || '').trim();
      if (name && name.toLowerCase().includes(activeToken)) {
        nameMatches.add(name);
      }

      if (contact.Tags) {
        const splitTags = contact.Tags.split(',').map((t) => t.trim()).filter(Boolean);
        for (const t of splitTags) {
          if (t.toLowerCase().includes(activeToken)) {
            tagMatches.add(t);
          }
        }
      }
    }

    const tagResults = Array.from(tagMatches).slice(0, 5).map((text) => ({ text, type: 'tag' as const }));
    const nameResults = Array.from(nameMatches).slice(0, 5).map((text) => ({ text, type: 'name' as const }));

    return [...tagResults, ...nameResults];
  }, [searchQuery, showSuggestions, allContacts]);

  // Multi-token filter logic across Name, Phone, Tags, and OtherDetails
  const filteredContacts = useMemo(() => {
    let result = allContacts;

    if (selectedTag && selectedTag.trim()) {
      const tagLower = selectedTag.trim().toLowerCase();
      result = result.filter((c) => (c.Tags || '').toLowerCase().includes(tagLower));
      return result;
    }

    const rawQuery = searchQuery.trim().toLowerCase();
    if (rawQuery) {
      const terms = rawQuery
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      result = result.filter((c) => {
        const contactName = (c.Name || '').toLowerCase();
        const contactPhone = (c.Phonenumber || '');
        const contactTags = (c.Tags || '').toLowerCase();
        const contactDetails = (c.OtherDetails || '').toLowerCase();

        return terms.every((term) => {
          const nameMatch = contactName.includes(term);
          const phoneMatch = contactPhone.includes(term);
          const tagMatch = contactTags.includes(term);
          const detailsMatch = contactDetails.includes(term);

          return nameMatch || phoneMatch || tagMatch || detailsMatch;
        });
      });
    }

    return result;
  }, [allContacts, selectedTag, searchQuery]);

  const handleSelectSuggestion = useCallback((text: string, type: 'name' | 'tag') => {
    // If user has typed multi-words, replace only the last token with the selected suggestion
    const words = searchQuery.trim().split(/[,\s]+/);
    if (words.length > 1) {
      words[words.length - 1] = text;
      setSearchQuery(words.join(' '));
    } else {
      setSearchQuery(text);
    }

    if (type === 'tag') {
      setSelectedTag(text);
    } else {
      setSelectedTag(null);
    }
    setShowSuggestions(false);
  }, [searchQuery]);

  const handleTagPress = useCallback((tag: string | null) => {
    if (!tag) {
      setSelectedTag(null);
      setSearchQuery('');
      setShowSuggestions(false);
      return;
    }

    setSelectedTag((prev) => {
      if (prev === tag) {
        setSearchQuery('');
        setShowSuggestions(false);
        return null;
      } else {
        setSearchQuery(tag);
        setShowSuggestions(true);
        return tag;
      }
    });
  }, []);

  const openTagsModal = useCallback(() => {
    Keyboard.dismiss();
    navigation.navigate('PopTags', {
      userPhone,
      onSelectTag: (tagResult: string) => {
        const chosenTag = tagResult ? tagResult.trim() : '';
        setSelectedTag(chosenTag || null);
        setSearchQuery(chosenTag);
        setShowSuggestions(true);
      },
    });
  }, [navigation, userPhone]);

  const openManageTagsModal = useCallback(() => {
    Keyboard.dismiss();
    navigation.navigate('ManageTags', { userPhone });
  }, [navigation, userPhone]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSelectedTag(null);
    setShowSuggestions(false);
    searchInputRef.current?.focus();
  }, []);

  const handleCall = useCallback((phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber) Linking.openURL(`tel:+91${cleanNumber}`);
  }, []);

  const handleWhatsApp = useCallback((phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanNumber) return;
    const url = `https://wa.me/91${cleanNumber}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed on this device.');
      }
    });
  }, []);

  const renderContactCard = useCallback(
    ({ item }: { item: Contact }) => (
      <ContactCard
        item={item}
        onPress={() => navigation.navigate('EditContact', { id: item.id, userPhone })}
        onCall={handleCall}
        onWhatsApp={handleWhatsApp}
      />
    ),
    [navigation, userPhone, handleCall, handleWhatsApp]
  );

  const ListHeader = useMemo(() => {
    return (
      <View style={styles.scrollableHeaderContainer}>
        <View style={styles.searchSection}>
          <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search Name, Phone, or Tag..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onFocus={() => setShowSuggestions(true)}
            onChangeText={(text) => {
              setSearchQuery(text);
              setShowSuggestions(true);
              if (selectedTag && text !== selectedTag) {
                setSelectedTag(null);
              }
            }}
            autoCorrect={false}
            clearButtonMode="never"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={openTagsModal} style={styles.tagFilterBtn}>
            <Ionicons name="pricetags" size={20} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {/* Auto Suggestion Dropdown */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsDropdown}>
            {suggestions.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.suggestionRow}
                onPress={() => handleSelectSuggestion(item.text, item.type)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.type === 'tag' ? 'pricetag-outline' : 'person-outline'}
                  size={15}
                  color={item.type === 'tag' ? '#2563EB' : '#64748B'}
                />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {item.text}
                </Text>
                <Text style={styles.suggestionTypeBadge}>{item.type}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.tagsWindowCard}>
          <View style={styles.tagsWindowHeader}>
            <View style={styles.tagsTitleRow}>
              <Ionicons name="pin" size={16} color="#2563EB" />
              <Text style={styles.tagsTitleText}>Tags</Text>
            </View>
            <TouchableOpacity
              style={styles.settingsIconBtn}
              onPress={openManageTagsModal}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="settings-outline" size={17} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={styles.tagsWrapContainer}>
            <TouchableOpacity
              style={[styles.tagBadge, selectedTag === null && searchQuery === '' && styles.tagBadgeActive]}
              onPress={() => handleTagPress(null)}
            >
              <Text
                style={[
                  styles.tagBadgeText,
                  selectedTag === null && searchQuery === '' && styles.tagBadgeTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>

            {pinnedTags.map((tag, idx) => {
              const isActive = selectedTag === tag;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.tagBadge, isActive && styles.tagBadgeActive]}
                  onPress={() => handleTagPress(tag)}
                >
                  <Text style={[styles.tagBadgeText, isActive && styles.tagBadgeTextActive]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  }, [searchQuery, selectedTag, pinnedTags, suggestions, handleClearSearch, openTagsModal, openManageTagsModal, handleTagPress, handleSelectSuggestion]);

  const renderStickySectionHeader = useCallback(() => {
    return (
      <View style={styles.stickyBar}>
        <Text style={styles.counterText}>
          Total Contacts: {filteredContacts.length}
          {searchQuery ? ` (Filter: "${searchQuery}")` : ''}
        </Text>
      </View>
    );
  }, [filteredContacts.length, searchQuery]);

  return (
    <View style={styles.container}>
      {loading && allContacts.length === 0 ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 60 }} />
      ) : (
        <SectionList
          sections={[{ title: 'contacts', data: filteredContacts }]}
          keyExtractor={(item, index) => (item?.id ? item.id.toString() : index.toString())}
          renderItem={renderContactCard}
          ListHeaderComponent={ListHeader}
          renderSectionHeader={renderStickySectionHeader}
          stickySectionHeadersEnabled={true}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={true}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No contacts found.</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollableHeaderContainer: {
    backgroundColor: '#F1F5F9',
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 46, fontSize: 15, color: '#0F172A' },
  tagFilterBtn: { padding: 6, marginLeft: 6 },
  suggestionsDropdown: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 8,
    borderRadius: 10,
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
  tagsWindowCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  tagsWindowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tagsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagsTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  settingsIconBtn: {
    padding: 2,
  },
  tagsWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  tagBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tagBadgeActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  tagBadgeText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  tagBadgeTextActive: {
    color: '#FFFFFF',
  },
  stickyBar: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 6,
  },
  counterText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerInfo: {
    flex: 1,
    marginRight: 12,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  phoneText: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '600',
    marginLeft: 6,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsappButton: {
    backgroundColor: '#25D366',
  },
  callButton: {
    backgroundColor: '#2563EB',
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tagPill: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    color: '#3730A3',
    fontSize: 12,
    fontWeight: '600',
  },
  detailsText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
    lineHeight: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
  },
});
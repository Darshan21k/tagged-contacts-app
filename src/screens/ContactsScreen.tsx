import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import { Contact } from '../types';

export default function ContactsScreen({ navigation }: any) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pinnedTags, setPinnedTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [userPhone, setUserPhone] = useState('9999999999');

  const selectedTagRef = useRef<string | null>(null);
  const searchQueryRef = useRef<string>('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    selectedTagRef.current = selectedTag;
  }, [selectedTag]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    AsyncStorage.getItem('user_phone').then((phone) => {
      if (phone) setUserPhone(phone);
    });
  }, []);

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

  const fetchContactsData = useCallback(
    async (tagFilter: string | null, textFilter: string) => {
      setLoading(true);
      try {
        const activePhone = (await AsyncStorage.getItem('user_phone')) || userPhone;
        let query = supabase
          .from('Contacts_Table')
          .select('*')
          .eq('Userphonenumber', activePhone);

        if (tagFilter && tagFilter.trim()) {
          query = query.ilike('Tags', `%${tagFilter.trim()}%`);
        }

        const cleanText = (textFilter || '').trim();
        if (cleanText) {
          const isNumeric = /^\d+$/.test(cleanText);
          if (isNumeric) {
            query = query.ilike('Phonenumber', `%${cleanText}%`);
          } else {
            const sanitized = cleanText.replace(/[%_,()]/g, '');
            if (sanitized) {
              query = query.or(`Name.ilike.%${sanitized}%,Tags.ilike.%${sanitized}%`);
            }
          }
        }

        const { data, error } = await query.order('Name', { ascending: true });
        if (error) throw error;

        const loaded = data || [];
        setContacts(loaded);
        setTotalCount(loaded.length);
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to fetch contacts');
      } finally {
        setLoading(false);
      }
    },
    [userPhone]
  );

  useFocusEffect(
    useCallback(() => {
      const run = async () => {
        const storedPhone = await AsyncStorage.getItem('user_phone');
        fetchPinnedTags(storedPhone || userPhone);
        fetchContactsData(selectedTagRef.current, searchQueryRef.current);
      };
      run();
    }, [userPhone, fetchPinnedTags, fetchContactsData])
  );

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    searchQueryRef.current = text;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchContactsData(selectedTagRef.current, text);
    }, 350);
  };

  const handleTagPress = (tag: string | null) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const nextTag = selectedTagRef.current === tag ? null : tag;

    selectedTagRef.current = nextTag;
    searchQueryRef.current = '';
    setSelectedTag(nextTag);
    setSearchQuery('');

    fetchContactsData(nextTag, '');
  };

  const openTagsModal = () => {
    navigation.navigate('PopTags', {
      userPhone,
      onSelectTag: (tagResult: string) => {
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }

        const chosenTag = tagResult ? tagResult.trim() : '';

        selectedTagRef.current = null;
        searchQueryRef.current = chosenTag;
        setSelectedTag(null);
        setSearchQuery(chosenTag);

        fetchContactsData(null, chosenTag);
      },
    });
  };

  const handleClearSearch = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchQueryRef.current = '';
    setSearchQuery('');
    fetchContactsData(selectedTagRef.current, '');
  };

  const handleCall = (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber) Linking.openURL(`tel:+91${cleanNumber}`);
  };

  const handleWhatsApp = (phoneNumber: string) => {
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
  };

  // 1. Top Section: Scrolls off-screen as the user scrolls up
  const renderScrollableHeader = () => (
    <View style={styles.scrollableHeaderContainer}>
      <View style={styles.searchSection}>
        <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search Name, Phone, or Tag..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={handleSearchChange}
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

      <View style={styles.tagsWindowCard}>
        <View style={styles.tagsWindowHeader}>
          <View style={styles.tagsTitleRow}>
            <Ionicons name="pin" size={16} color="#2563EB" />
            <Text style={styles.tagsTitleText}>Tags</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsIconBtn}
            onPress={() => navigation.navigate('ManageTags', { userPhone })}
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
                <Text
                  style={[
                    styles.tagBadgeText,
                    isActive && styles.tagBadgeTextActive,
                  ]}
                >
                  {tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  // 2. Sticky Bar: Stops at the very top and remains pinned while contacts scroll under it
  const renderStickySectionHeader = () => (
    <View style={styles.stickyBar}>
      <Text style={styles.counterText}>
        Total Contacts: {totalCount}
        {selectedTag ? ` (Tag: ${selectedTag})` : searchQuery ? ` (Filtered by: "${searchQuery}")` : ''}
      </Text>
    </View>
  );

  // 3. Contact Cards
  const renderContactCard = ({ item }: { item: Contact }) => {
    const tagList = item.Tags
      ? item.Tags.split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .sort((a, b) => a.length - b.length || a.localeCompare(b))
      : [];

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('EditContact', { id: item.id, userPhone })}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.headerInfo}>
            <Text style={styles.nameText} numberOfLines={1}>{item.Name}</Text>

            <TouchableOpacity onPress={() => handleCall(item.Phonenumber)} activeOpacity={0.7}>
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={15} color="#2563EB" />
                <Text style={styles.phoneText}>+91 {item.Phonenumber}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.iconButton, styles.whatsappButton]}
              onPress={() => handleWhatsApp(item.Phonenumber)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconButton, styles.callButton]}
              onPress={() => handleCall(item.Phonenumber)}
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
  };

  return (
    <View style={styles.container}>
      {loading && contacts.length === 0 ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 60 }} />
      ) : (
        <SectionList
          sections={[{ title: 'contacts', data: contacts }]}
          keyExtractor={(item, index) => (item?.id ? item.id.toString() : index.toString())}
          renderItem={renderContactCard}
          renderSectionHeader={renderStickySectionHeader}
          ListHeaderComponent={renderScrollableHeader}
          stickySectionHeadersEnabled={true}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
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
    marginBottom: 10,
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
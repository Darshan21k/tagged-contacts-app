import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';

interface TagFilterItem {
  id: string;
  name: string;
  type: 'tag' | 'link';
  phone?: string;
}

export default function PopTagsModal({ route, navigation }: any) {
  const userPhone = route.params?.userPhone || '9999999999';
  const onSelectTag = route.params?.onSelectTag;

  const [activeTab, setActiveTab] = useState<'tags' | 'links'>('tags');
  const [allTags, setAllTags] = useState<TagFilterItem[]>([]);
  const [allLinkedPeople, setAllLinkedPeople] = useState<TagFilterItem[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('Name, Phonenumber, Tags, LinkedContactPhone')
        .eq('Userphonenumber', userPhone);

      if (error) throw error;

      if (data) {
        // 1. Extract Category Tags
        const rawTags = data
          .filter((c: any) => c.Tags && c.Tags.trim().length > 0)
          .flatMap((c: any) => c.Tags.split(','))
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0);

        const uniqueMap = new Map<string, string>();
        rawTags.forEach((tag: string) => {
          const lower = tag.toLowerCase();
          if (!uniqueMap.has(lower)) {
            uniqueMap.set(lower, tag);
          }
        });

        const categoryTagItems: TagFilterItem[] = Array.from(uniqueMap.values())
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          .map((name) => ({
            id: `tag-${name}`,
            name,
            type: 'tag',
          }));

        // 2. Extract ONLY contacts referenced in LinkedContactPhone
        const referencedPhones = new Set<string>();
        data.forEach((c: any) => {
          if (c.LinkedContactPhone) {
            c.LinkedContactPhone.split(',').forEach((p: string) => {
              const clean = p.trim().slice(-10);
              if (clean) referencedPhones.add(clean);
            });
          }
        });

        const contactsMap = new Map<string, string>();
        data.forEach((c: any) => {
          const cleanPhone = (c.Phonenumber || '').replace(/\D/g, '').slice(-10);
          if (cleanPhone) {
            contactsMap.set(cleanPhone, c.Name || 'Contact');
          }
        });

        const linkedPeopleItems: TagFilterItem[] = Array.from(referencedPhones)
          .map((phone) => ({
            id: `link-${phone}`,
            name: contactsMap.get(phone) || `Contact (${phone})`,
            phone,
            type: 'link' as const,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        setAllTags(categoryTagItems);
        setAllLinkedPeople(linkedPeopleItems);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch tags and links');
    } finally {
      setLoading(false);
    }
  }, [userPhone]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredItems = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    const sourceList = activeTab === 'tags' ? allTags : allLinkedPeople;

    if (!q) return sourceList;

    return sourceList.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || (item.phone && item.phone.includes(q))
    );
  }, [allTags, allLinkedPeople, searchFilter, activeTab]);

  const handleClose = () => {
    navigation.goBack();
  };

  const handleItemTapped = (item: TagFilterItem) => {
    if (onSelectTag) {
      onSelectTag(item.name);
    }
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      <View style={styles.backdrop}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.backdropTouch} />
        </TouchableWithoutFeedback>

        <View style={styles.popupFrame}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Select Tag / Contact</Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Segmented Tab Controls */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'tags' && styles.tabButtonActive]}
              onPress={() => setActiveTab('tags')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="pricetag-outline"
                size={13}
                color={activeTab === 'tags' ? '#2563EB' : '#64748B'}
              />
              <Text
                style={[styles.tabText, activeTab === 'tags' && styles.tabTextActive]}
              >
                Tags ({allTags.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'links' && styles.tabButtonActive]}
              onPress={() => setActiveTab('links')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="link"
                size={13}
                color={activeTab === 'links' ? '#2563EB' : '#64748B'}
              />
              <Text
                style={[styles.tabText, activeTab === 'links' && styles.tabTextActive]}
              >
                Linked Contacts ({allLinkedPeople.length})
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchEntry}
            placeholder={
              activeTab === 'tags' ? 'Search category tags...' : 'Search linked contacts...'
            }
            placeholderTextColor="#94A3B8"
            value={searchFilter}
            onChangeText={setSearchFilter}
            autoCapitalize="none"
          />

          {loading ? (
            <ActivityIndicator color="#2563EB" style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.tagFrame}
                  activeOpacity={0.7}
                  onPress={() => handleItemTapped(item)}
                >
                  <View style={styles.itemRow}>
                    <Ionicons
                      name={item.type === 'tag' ? 'pricetag-outline' : 'link'}
                      size={14}
                      color="#2563EB"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.tagLabel}>{item.name}</Text>
                  </View>
                  {item.phone && <Text style={styles.phoneSub}>{item.phone}</Text>}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    No {activeTab === 'tags' ? 'tags' : 'linked contacts'} found
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#80000000',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  popupFrame: {
    maxHeight: 520,
    minHeight: 340,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginHorizontal: 15,
    marginBottom: Platform.OS === 'ios' ? 25 : 15,
    borderRadius: 20,
    padding: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    flex: 1,
    marginLeft: 24,
  },
  closeButton: {
    fontSize: 20,
    color: '#64748B',
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  searchEntry: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14.5,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  listContent: {
    paddingBottom: 15,
  },
  tagFrame: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tagLabel: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
  },
  phoneSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 30,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },
});
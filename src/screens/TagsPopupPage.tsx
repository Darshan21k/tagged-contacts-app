import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { PinnedTag } from '../types';

interface ManageTagItem {
  id: string;
  name: string;
  type: 'tag' | 'link';
  phone?: string;
  isPinned: boolean;
}

export default function TagsPopupPage({ route, navigation }: any) {
  const userPhone = route.params?.userPhone || '9999999999';

  const [activeTab, setActiveTab] = useState<'tags' | 'links'>('tags');
  const [itemsList, setItemsList] = useState<ManageTagItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTagsAndPinnedStatus = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch contacts
      const { data: contactsData, error: contactsError } = await supabase
        .from('Contacts_Table')
        .select('Name, Phonenumber, Tags, LinkedContactPhone')
        .eq('Userphonenumber', userPhone);

      if (contactsError) throw contactsError;

      // Category tags
      const rawTags = (contactsData || [])
        .filter((c: any) => c.Tags && c.Tags.trim().length > 0)
        .flatMap((c: any) => c.Tags.split(','))
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);

      const uniqueTagNames = Array.from(new Set(rawTags.map((t) => t.toLowerCase()))).map(
        (lower) => rawTags.find((t) => t.toLowerCase() === lower) || lower
      );

      // Referenced linked contacts ONLY
      const referencedPhones = new Set<string>();
      (contactsData || []).forEach((c: any) => {
        if (c.LinkedContactPhone) {
          c.LinkedContactPhone.split(',').forEach((p: string) => {
            const clean = p.trim().slice(-10);
            if (clean) referencedPhones.add(clean);
          });
        }
      });

      const contactsMap = new Map<string, string>();
      (contactsData || []).forEach((c: any) => {
        const cleanPhone = (c.Phonenumber || '').replace(/\D/g, '').slice(-10);
        if (cleanPhone) {
          contactsMap.set(cleanPhone, c.Name || 'Contact');
        }
      });

      // 2. Fetch Pinned items
      const { data: pinData, error: pinError } = await supabase
        .from('PinnedTags')
        .select('*')
        .eq('Userphonenumber', userPhone)
        .eq('Pinned', true);

      if (pinError) throw pinError;

      const pinnedSet = new Set((pinData || []).map((p: PinnedTag) => p.Tagname.toLowerCase()));

      const tagItems: ManageTagItem[] = uniqueTagNames.map((name) => ({
        id: `tag-${name}`,
        name,
        type: 'tag',
        isPinned: pinnedSet.has(name.toLowerCase()),
      }));

      const linkItems: ManageTagItem[] = Array.from(referencedPhones).map((phone) => {
        const name = contactsMap.get(phone) || `Contact (${phone})`;
        return {
          id: `link-${phone}`,
          name,
          phone,
          type: 'link',
          isPinned: pinnedSet.has(name.toLowerCase()),
        };
      });

      setItemsList([...tagItems, ...linkItems]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load tags and links');
    } finally {
      setLoading(false);
    }
  }, [userPhone]);

  useEffect(() => {
    loadTagsAndPinnedStatus();
  }, [loadTagsAndPinnedStatus]);

  const tagCounts = useMemo(() => {
    const tagsCount = itemsList.filter((it) => it.type === 'tag').length;
    const linksCount = itemsList.filter((it) => it.type === 'link').length;
    return { tagsCount, linksCount };
  }, [itemsList]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sourceList = itemsList.filter((it) => it.type === (activeTab === 'tags' ? 'tag' : 'link'));

    const filtered = q
      ? sourceList.filter(
          (it) => it.name.toLowerCase().includes(q) || (it.phone && it.phone.includes(q))
        )
      : sourceList;

    return filtered.sort((a, b) => {
      if (a.isPinned === b.isPinned) return a.name.localeCompare(b.name);
      return a.isPinned ? -1 : 1;
    });
  }, [itemsList, searchQuery, activeTab]);

  const togglePin = async (item: ManageTagItem) => {
    const nextPinned = !item.isPinned;

    setItemsList((prev) =>
      prev.map((t) => (t.id === item.id ? { ...t, isPinned: nextPinned } : t))
    );

    try {
      if (nextPinned) {
        await supabase.from('PinnedTags').insert([
          {
            Userphonenumber: userPhone,
            Tagname: item.name,
            Pinned: true,
          },
        ]);
      } else {
        await supabase
          .from('PinnedTags')
          .delete()
          .eq('Userphonenumber', userPhone)
          .eq('Tagname', item.name);
      }
    } catch {
      Alert.alert('Error', 'Failed to update pin state');
      loadTagsAndPinnedStatus();
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.backdrop}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.backdropTouch} />
        </TouchableWithoutFeedback>

        <View style={styles.popupFrame}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Manage Pinned Items</Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                Tags ({tagCounts.tagsCount})
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
                Linked Contacts ({tagCounts.linksCount})
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchEntry}
            placeholder={
              activeTab === 'tags' ? 'Search tags to pin...' : 'Search linked contacts to pin...'
            }
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
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
                <View style={styles.tagRow}>
                  <View style={styles.tagInfo}>
                    <Ionicons
                      name={
                        item.isPinned
                          ? 'pin'
                          : item.type === 'tag'
                          ? 'pricetag-outline'
                          : 'link'
                      }
                      size={16}
                      color={item.isPinned ? '#2563EB' : '#94A3B8'}
                      style={styles.tagIcon}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tagLabel}>{item.name}</Text>
                      {item.phone && <Text style={styles.phoneSub}>{item.phone}</Text>}
                    </View>
                  </View>
                  <Switch
                    value={item.isPinned}
                    onValueChange={() => togglePin(item)}
                    thumbColor={item.isPinned ? '#2563EB' : '#CBD5E1'}
                    trackColor={{ false: '#E2E8F0', true: '#BFDBFE' }}
                  />
                </View>
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
  keyboardContainer: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: '#80000000',
    justifyContent: 'flex-end',
  },
  backdropTouch: { flex: 1 },
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
  listContent: { paddingBottom: 15 },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  tagInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  tagIcon: { marginRight: 10 },
  tagLabel: { fontSize: 14, color: '#334155', fontWeight: '600' },
  phoneSub: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', marginTop: 30 },
  emptyText: { fontSize: 14, color: '#94A3B8' },
});
import React, { useState, useEffect, useCallback } from 'react';
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

interface TagItem {
  name: string;
  isPinned: boolean;
}

export default function TagsPopupPage({ route, navigation }: any) {
  const userPhone = route.params?.userPhone || '9999999999';

  const [tagList, setTagList] = useState<TagItem[]>([]);
  const [filteredList, setFilteredList] = useState<TagItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTagsAndPinnedStatus = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch all tags from Contacts_Table
      const { data: contactsData, error: contactsError } = await supabase
        .from('Contacts_Table')
        .select('Tags')
        .eq('Userphonenumber', userPhone);

      if (contactsError) throw contactsError;

      const rawTags = (contactsData || [])
        .filter((c: any) => c.Tags && c.Tags.trim().length > 0)
        .flatMap((c: any) => c.Tags.split(','))
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);

      const uniqueTagNames = Array.from(new Set(rawTags.map((t) => t.toLowerCase()))).map(
        (lower) => rawTags.find((t) => t.toLowerCase() === lower) || lower
      );

      // 2. Fetch PinnedTags
      const { data: pinData, error: pinError } = await supabase
        .from('PinnedTags')
        .select('*')
        .eq('Userphonenumber', userPhone)
        .eq('Pinned', true);

      if (pinError) throw pinError;

      const pinnedSet = new Set((pinData || []).map((p: PinnedTag) => p.Tagname.toLowerCase()));

      const combined: TagItem[] = uniqueTagNames
        .map((name) => ({
          name,
          isPinned: pinnedSet.has(name.toLowerCase()),
        }))
        .sort((a, b) => {
          // Pinned tags first, then alphabetical
          if (a.isPinned === b.isPinned) {
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          }
          return a.isPinned ? -1 : 1;
        });

      setTagList(combined);
      setFilteredList(combined);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, [userPhone]);

  useEffect(() => {
    loadTagsAndPinnedStatus();
  }, [loadTagsAndPinnedStatus]);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    const query = text.trim().toLowerCase();
    if (!query) {
      setFilteredList(tagList);
      return;
    }
    setFilteredList(tagList.filter((item) => item.name.toLowerCase().includes(query)));
  };

  const togglePin = async (item: TagItem) => {
    const nextPinned = !item.isPinned;

    // Optimistic local update
    const updater = (prev: TagItem[]) =>
      prev.map((t) => (t.name === item.name ? { ...t, isPinned: nextPinned } : t));
    setTagList(updater);
    setFilteredList(updater);

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
    } catch (err: any) {
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
            <Text style={styles.headerTitle}>Manage Pinned Tags</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchEntry}
            placeholder="Search tags to pin..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
          />

          {loading ? (
            <ActivityIndicator color="#2563EB" style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={filteredList}
              keyExtractor={(item) => item.name}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View style={styles.tagRow}>
                  <View style={styles.tagInfo}>
                    <Ionicons
                      name={item.isPinned ? 'pin' : 'pricetag-outline'}
                      size={18}
                      color={item.isPinned ? '#2563EB' : '#94A3B8'}
                      style={styles.tagIcon}
                    />
                    <Text style={styles.tagLabel}>{item.name}</Text>
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
                  <Text style={styles.emptyText}>No tags found</Text>
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
    minHeight: 320,
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
    color: '#1E293B',
    textAlign: 'center',
    flex: 1,
    marginLeft: 24,
  },
  closeButton: {
    fontSize: 22,
    color: '#DC2626',
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  searchEntry: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
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
  tagLabel: { fontSize: 16, color: '#334155', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', marginTop: 30 },
  emptyText: { fontSize: 14, color: '#94A3B8' },
});
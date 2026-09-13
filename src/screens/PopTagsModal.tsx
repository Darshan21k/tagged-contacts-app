import React, { useState, useEffect, useCallback } from 'react';
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
import { supabase } from '../services/supabase';

export default function PopTagsModal({ route, navigation }: any) {
  const userPhone = route.params?.userPhone || '9999999999';
  const onSelectTag = route.params?.onSelectTag;

  const [allTags, setAllTags] = useState<string[]>([]);
  const [filteredTags, setFilteredTags] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('Tags')
        .eq('Userphonenumber', userPhone);

      if (error) throw error;

      if (data) {
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

        const sortedTags = Array.from(uniqueMap.values()).sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' })
        );

        setAllTags(sortedTags);
        setFilteredTags(sortedTags);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch tags');
    } finally {
      setLoading(false);
    }
  }, [userPhone]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleTagTextChanged = (text: string) => {
    setSearchFilter(text);
    const filter = text.trim().toLowerCase();

    if (!filter) {
      setFilteredTags(allTags);
      return;
    }

    const filtered = allTags.filter((tag) => tag.toLowerCase().includes(filter));
    setFilteredTags(filtered);
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const handleTagTapped = (tagName: string) => {
    if (onSelectTag) {
      onSelectTag(tagName);
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
            <Text style={styles.headerTitle}>Select Tag</Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchEntry}
            placeholder="Enter tag..."
            placeholderTextColor="#888"
            value={searchFilter}
            onChangeText={handleTagTextChanged}
            autoCapitalize="none"
          />

          {loading ? (
            <ActivityIndicator color="#2563EB" style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={filteredTags}
              keyExtractor={(item, index) => `${item}_${index}`}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.tagFrame}
                  activeOpacity={0.7}
                  onPress={() => handleTagTapped(item)}
                >
                  <Text style={styles.tagLabel}>{item}</Text>
                </TouchableOpacity>
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
    maxHeight: 450,
    minHeight: 280,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginHorizontal: 15,
    marginBottom: Platform.OS === 'ios' ? 25 : 15,
    borderRadius: 20,
    padding: 15,
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
    fontWeight: 'bold',
    color: '#333333',
    textAlign: 'center',
    flex: 1,
    marginLeft: 24,
  },
  closeButton: {
    fontSize: 22,
    color: 'red',
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  searchEntry: {
    height: 45,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#333333',
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  listContent: {
    paddingBottom: 15,
  },
  tagFrame: {
    backgroundColor: '#F9F9F9',
    borderRadius: 10,
    padding: 12,
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagLabel: {
    fontSize: 16,
    color: '#222222',
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
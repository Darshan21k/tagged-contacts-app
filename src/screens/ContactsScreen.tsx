import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
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

export default function ContactsScreen({ navigation, route }: any) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [userPhone, setUserPhone] = useState('9999999999');

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('user_phone').then((phone) => {
      if (phone) setUserPhone(phone);
    });
  }, []);

  const fetchAllContacts = useCallback(async (selectedTag?: string) => {
    setLoading(true);
    try {
      const activePhone = (await AsyncStorage.getItem('user_phone')) || userPhone;
      let query = supabase
        .from('Contacts_Table')
        .select('*')
        .eq('Userphonenumber', activePhone);

      if (selectedTag) {
        query = query.ilike('Tags', `%${selectedTag}%`);
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
  }, [userPhone]);

  useFocusEffect(
    useCallback(() => {
      fetchAllContacts();
    }, [fetchAllContacts])
  );

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      const trimmed = text.trim();
      if (!trimmed) {
        fetchAllContacts();
        return;
      }

      setLoading(true);
      try {
        const isNumeric = /^\d+$/.test(trimmed);
        let query = supabase
          .from('Contacts_Table')
          .select('*')
          .eq('Userphonenumber', userPhone);

        if (isNumeric) {
          query = query.ilike('Phonenumber', `%${trimmed}%`);
        } else {
          query = query.or(`Name.ilike.%${trimmed}%,Tags.ilike.%${trimmed}%`);
        }

        const { data, error } = await query.order('Name', { ascending: true });
        if (error) throw error;

        const results = data || [];
        setContacts(results);
        setTotalCount(results.length);
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Search failed');
      } finally {
        setLoading(false);
      }
    }, 750);
  };

  const handleCall = (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    Linking.openURL(`tel:+91${cleanNumber}`);
  };

  const handleWhatsApp = (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const url = `https://wa.me/91${cleanNumber}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed on this device.');
      }
    });
  };

  const openTagsModal = () => {
    navigation.navigate('PopTags', {
      userPhone,
      onSelectTag: (selectedTag: string) => {
        setSearchQuery(selectedTag);
        fetchAllContacts(selectedTag);
      },
    });
  };

  const renderItem = ({ item }: { item: Contact }) => {
    const tagList = item.Tags ? item.Tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('EditContact', { id: item.id, userPhone })}
      >
        <View style={styles.cardMain}>
          <Text style={styles.nameText}>{item.Name}</Text>

          <TouchableOpacity onPress={() => handleCall(item.Phonenumber)} activeOpacity={0.7}>
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={16} color="#2563EB" />
              <Text style={styles.phoneText}>+91 {item.Phonenumber}</Text>
            </View>
          </TouchableOpacity>

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
        </View>

        <View style={styles.actionColumn}>
          <TouchableOpacity
            style={[styles.iconButton, styles.whatsappButton]}
            onPress={() => handleWhatsApp(item.Phonenumber)}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.callButton]}
            onPress={() => handleCall(item.Phonenumber)}
          >
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
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
          <TouchableOpacity onPress={() => handleSearchChange('')}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={openTagsModal} style={styles.tagFilterBtn}>
          <Ionicons name="pricetags" size={20} color="#2563EB" />
        </TouchableOpacity>
      </View>

      <View style={styles.counterRow}>
        <Text style={styles.counterText}>Total Contacts: {totalCount}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item, index) => (item.id ? item.id.toString() : index.toString())}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No contacts found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
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
  counterRow: { paddingHorizontal: 18, marginBottom: 8 },
  counterText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  cardMain: { flex: 1, marginRight: 10 },
  nameText: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  phoneText: { fontSize: 14, color: '#2563EB', fontWeight: '600', marginLeft: 6 },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tagPill: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: { color: '#3730A3', fontSize: 12, fontWeight: '600' },
  detailsText: { fontSize: 12, color: '#64748B', marginTop: 4 },
  actionColumn: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsappButton: { backgroundColor: '#25D366' },
  callButton: { backgroundColor: '#2563EB' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 15, color: '#94A3B8' },
});
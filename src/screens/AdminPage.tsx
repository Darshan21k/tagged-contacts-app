import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Switch,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { UserProfile } from '../types';

export default function AdminPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filtered, setFiltered] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('Userprofile')
        .select('*')
        .order('Name', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
      setFiltered(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAccess = async (user: UserProfile, value: boolean) => {
    const updatedAccess = value ? 'yes' : 'no';
    const originalAccess = user.Login_Access;

    // Optimistic UI update
    setUsers((prev) =>
      prev.map((u) => (u.Phonenumber === user.Phonenumber ? { ...u, Login_Access: updatedAccess } : u))
    );
    setFiltered((prev) =>
      prev.map((u) => (u.Phonenumber === user.Phonenumber ? { ...u, Login_Access: updatedAccess } : u))
    );

    try {
      const { error } = await supabase
        .from('Userprofile')
        .update({ Login_Access: updatedAccess })
        .eq('Phonenumber', user.Phonenumber);

      if (error) throw error;
    } catch (err: any) {
      Alert.alert('Error', 'Failed to update user login access');
      // Rollback on network failure
      setUsers((prev) =>
        prev.map((u) => (u.Phonenumber === user.Phonenumber ? { ...u, Login_Access: originalAccess } : u))
      );
      setFiltered((prev) =>
        prev.map((u) => (u.Phonenumber === user.Phonenumber ? { ...u, Login_Access: originalAccess } : u))
      );
    }
  };

  const filterUsers = (query: string) => {
    setSearch(query);
    if (!query.trim()) {
      setFiltered(users);
      return;
    }
    const q = query.toLowerCase();
    setFiltered(
      users.filter((u) => u.Name?.toLowerCase().includes(q) || u.Phonenumber?.includes(q))
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Portal ({filtered.length} Users)</Text>

      {/* Search Bar with Clear Icon */}
      <View style={styles.searchSection}>
        <Ionicons name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by name or phone..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={filterUsers}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => filterUsers('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.Phonenumber}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const hasAccess = item.Login_Access === 'yes';
            return (
              <View style={styles.card}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.name}>{item.Name || 'Unnamed User'}</Text>
                  <Text style={styles.phone}>+91 {item.Phonenumber}</Text>
                  <Text style={[styles.statusText, hasAccess ? styles.statusActive : styles.statusBlocked]}>
                    {hasAccess ? 'Access Active' : 'Access Blocked'}
                  </Text>
                </View>
                <Switch
                  value={hasAccess}
                  onValueChange={(val) => handleToggleAccess(item, val)}
                  thumbColor={hasAccess ? '#2563EB' : '#CBD5E1'}
                  trackColor={{ false: '#E2E8F0', true: '#BFDBFE' }}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  listContent: { paddingBottom: 24 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  name: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  phone: { fontSize: 13, color: '#64748B', marginTop: 2 },
  statusText: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  statusActive: { color: '#16A34A' },
  statusBlocked: { color: '#DC2626' },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#94A3B8', fontSize: 14 },
});
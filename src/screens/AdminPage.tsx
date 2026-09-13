import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Switch,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
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
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAccess = async (user: UserProfile, value: boolean) => {
    const updatedAccess = value ? 'yes' : 'no';
    try {
      const { error } = await supabase
        .from('Userprofile')
        .update({ Login_Access: updatedAccess })
        .eq('Phonenumber', user.Phonenumber);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.Phonenumber === user.Phonenumber ? { ...u, Login_Access: updatedAccess } : u))
      );
      setFiltered((prev) =>
        prev.map((u) => (u.Phonenumber === user.Phonenumber ? { ...u, Login_Access: updatedAccess } : u))
      );
    } catch (err: any) {
      Alert.alert('Error', 'Failed to update user login access');
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
      <TextInput
        style={styles.search}
        placeholder="Filter by name or phone..."
        value={search}
        onChangeText={filterUsers}
      />
      {loading ? (
        <ActivityIndicator color="#2563EB" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.Phonenumber}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.Name}</Text>
                <Text style={styles.phone}>+91 {item.Phonenumber}</Text>
              </View>
              <Switch
                value={item.Login_Access === 'yes'}
                onValueChange={(val) => handleToggleAccess(item, val)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  search: { backgroundColor: '#FFF', height: 44, borderRadius: 8, paddingHorizontal: 12, marginBottom: 12 },
  card: { flexDirection: 'row', backgroundColor: '#FFF', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  name: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  phone: { fontSize: 13, color: '#64748B', marginTop: 2 },
});
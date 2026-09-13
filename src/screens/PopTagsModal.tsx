import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { supabase } from '../services/supabase';
import { PinnedTag } from '../types';

export default function PopTagsModal({ route, navigation }: any) {
  const userPhone = route.params?.userPhone || '9999999999';
  const onSelectTag = route.params?.onSelectTag;

  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState<{ [tag: string]: boolean }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      const { data: contactsData } = await supabase
        .from('Contacts_Table')
        .select('Tags')
        .eq('Userphonenumber', userPhone);

      const uniqueTags = Array.from(
        new Set(
          (contactsData || [])
            .flatMap((c) => (c.Tags ? c.Tags.split(',') : []))
            .map((t) => t.trim())
            .filter(Boolean)
        )
      ).sort();

      const { data: pinData } = await supabase
        .from('PinnedTags')
        .select('*')
        .eq('Userphonenumber', userPhone)
        .eq('Pinned', true);

      const pinMap: { [key: string]: boolean } = {};
      (pinData || []).forEach((p: PinnedTag) => {
        pinMap[p.Tagname] = true;
      });

      setTags(uniqueTags);
      setPinned(pinMap);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePin = async (tag: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setPinned((prev) => ({ ...prev, [tag]: nextStatus }));

    try {
      if (nextStatus) {
        await supabase.from('PinnedTags').insert([
          { Userphonenumber: userPhone, Tagname: tag, Pinned: true },
        ]);
      } else {
        await supabase
          .from('PinnedTags')
          .delete()
          .eq('Userphonenumber', userPhone)
          .eq('Tagname', tag);
      }
    } catch (err: any) {
      Alert.alert('Error', 'Failed to update pin state');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tags Manager</Text>
      {loading ? (
        <ActivityIndicator color="#2563EB" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={tags}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.tagTextWrapper}
                onPress={() => {
                  if (onSelectTag) onSelectTag(item);
                  navigation.goBack();
                }}
              >
                <Text style={styles.tagName}>{item}</Text>
              </TouchableOpacity>
              <Switch
                value={!!pinned[item]}
                onValueChange={() => togglePin(item, !!pinned[item])}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF', padding: 20 },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  tagTextWrapper: { flex: 1 },
  tagName: { fontSize: 16, color: '#334155', fontWeight: '500' },
});
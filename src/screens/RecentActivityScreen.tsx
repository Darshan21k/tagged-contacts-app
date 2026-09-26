import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Contact } from '../types';

type TimeRange = 'all' | '1w' | '1m' | '6m' | '1y';

interface TagFrequencyItem {
  name: string;
  count: number;
}

export default function RecentActivityScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const allContacts: Contact[] = route.params?.allContacts || [];
  const userPhone: string = route.params?.userPhone || '9999999999';

  const [activeTab, setActiveTab] = useState<'contacts' | 'tags'>('contacts');
  const [selectedRange, setSelectedRange] = useState<TimeRange>('all');

  // Disable the default stack header to show only the custom app header
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Compute time boundary timestamp
  const rangeTimeThreshold = useMemo(() => {
    const now = new Date().getTime();
    switch (selectedRange) {
      case '1w':
        return now - 7 * 24 * 60 * 60 * 1000;
      case '1m':
        return now - 30 * 24 * 60 * 60 * 1000;
      case '6m':
        return now - 180 * 24 * 60 * 60 * 1000;
      case '1y':
        return now - 365 * 24 * 60 * 60 * 1000;
      default:
        return 0; // 'all'
    }
  }, [selectedRange]);

  // Map for resolving linked contact numbers
  const contactsMap = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of allContacts) {
      const cleanPhone = (c.Phonenumber || '').replace(/\D/g, '').slice(-10);
      if (cleanPhone) map.set(cleanPhone, c);
    }
    return map;
  }, [allContacts]);

  // Filtered contacts
  const recentContacts = useMemo(() => {
    const filtered = allContacts
      .filter((c) => {
        if (!c.created_at) return true;
        const contactTime = new Date(c.created_at).getTime();
        return contactTime >= rangeTimeThreshold;
      })
      .sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });

    if (selectedRange === 'all') {
      return filtered.slice(0, 10);
    }
    return filtered;
  }, [allContacts, rangeTimeThreshold, selectedRange]);

  // Derived tags
  const recentTags = useMemo<TagFrequencyItem[]>(() => {
    const tagMap = new Map<string, number>();

    recentContacts.forEach((contact) => {
      if (contact.Tags) {
        contact.Tags.split(',')
          .map((t: string) => t.trim())
          .filter(Boolean)
          .forEach((tag: string) => {
            tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
          });
      }
    });

    const sorted = Array.from(tagMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    if (selectedRange === 'all') {
      return sorted.slice(0, 10);
    }
    return sorted;
  }, [recentContacts, selectedRange]);

  // Formats relative date along with the calendar date in brackets
  const formatRelativeDate = (dateString?: string) => {
    if (!dateString) return 'Recently';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    const exactDate = date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    if (diffDays <= 0) return `Today (${exactDate})`;
    if (diffDays === 1) return `Yesterday (${exactDate})`;
    if (diffDays < 7) return `${diffDays}d ago (${exactDate})`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago (${exactDate})`;
    return `${exactDate}`;
  };

  const handleCall = (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
    if (!cleanNumber) return;
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      Alert.alert('Error', 'Unable to initiate call on this device.');
    });
  };

  const handleWhatsApp = (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanNumber) return;
    const url = `https://wa.me/${cleanNumber}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed on this device.');
      }
    });
  };

  const handleCopyPhone = async (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanNumber) return;
    await Clipboard.setStringAsync(cleanNumber);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Navigates directly to Contacts tab and synchronizes search state
  const handleSelectTagAndNavigate = async (tagName: string) => {
    await Haptics.selectionAsync().catch(() => {});
    const cleanTag = tagName.trim();
    try {
      await AsyncStorage.setItem(
        'active_contacts_search_state',
        JSON.stringify({ query: cleanTag, tag: cleanTag, starred: false })
      );
    } catch {
      // quiet fallback
    }

    navigation.navigate('MainTabs', {
      screen: 'Contacts',
      params: { selectedTag: cleanTag },
    });
  };

  const ranges: { key: TimeRange; label: string }[] = [
    { key: 'all', label: 'Latest 10' },
    { key: '1w', label: '1 Week' },
    { key: '1m', label: '1 Month' },
    { key: '6m', label: '6 Months' },
    { key: '1y', label: '1 Year' },
  ];

  return (
    <View style={styles.container}>
      {/* App Header */}
      <View style={[styles.compactHeaderContainer, { paddingTop: insets.top + 6 }]}>
        <View style={styles.compactHeaderRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginRight: 6 }}
          >
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.compactHeaderTitle}>Recent Activity</Text>
          <View style={styles.badgeIndicator} />
        </View>
      </View>

      {/* Segmented Mode Tabs */}
      <View style={styles.topTabs}>
        <TouchableOpacity
          style={[styles.topTabBtn, activeTab === 'contacts' && styles.topTabBtnActive]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveTab('contacts');
          }}
          activeOpacity={0.7}
        >
          <Ionicons
            name="people-outline"
            size={14}
            color={activeTab === 'contacts' ? '#2563EB' : '#64748B'}
          />
          <Text style={[styles.topTabText, activeTab === 'contacts' && styles.topTabTextActive]}>
            Contacts ({recentContacts.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.topTabBtn, activeTab === 'tags' && styles.topTabBtnActive]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveTab('tags');
          }}
          activeOpacity={0.7}
        >
          <Ionicons
            name="pricetag-outline"
            size={14}
            color={activeTab === 'tags' ? '#2563EB' : '#64748B'}
          />
          <Text style={[styles.topTabText, activeTab === 'tags' && styles.topTabTextActive]}>
            Recent Tags ({recentTags.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Time Filter Chips */}
      <View style={styles.filterChipsRow}>
        {ranges.map((r) => {
          const isSelected = selectedRange === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.chip, isSelected && styles.chipActive]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSelectedRange(r.key);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={14} color="#64748B" />
        <Text style={styles.infoBannerText}>
          {selectedRange === 'all'
            ? 'Displaying your 10 most recent records.'
            : `Showing all records added in this period (${recentContacts.length} contacts found).`}
        </Text>
      </View>

      {/* Tab 1: Recent Contacts List */}
      {activeTab === 'contacts' ? (
        <FlatList
          data={recentContacts}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const rawTags = item.Tags
              ? item.Tags.split(',').map((t: string) => t.trim()).filter(Boolean)
              : [];

            const linkedPhones = ((item as any).LinkedContactPhone || '')
              .split(',')
              .map((p: string) => p.trim().slice(-10))
              .filter(Boolean);

            return (
              <View style={styles.cardWrapper}>
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.88}
                  onPress={() => navigation.navigate('EditContact', { id: item.id, userPhone })}
                >
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.headerInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.nameText} numberOfLines={1}>
                          {item.Name}
                        </Text>
                        <View style={styles.timeBadgeContainer}>
                          <Text style={styles.timeBadgeText}>{formatRelativeDate(item.created_at)}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.phoneChipTouchable}
                        onPress={() => handleCopyPhone(item.Phonenumber)}
                        activeOpacity={0.6}
                      >
                        <View style={styles.phoneRow}>
                          <Ionicons name="call-outline" size={14} color="#2563EB" />
                          <Text style={styles.phoneText}>{item.Phonenumber}</Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.iconButton, styles.whatsappButton]}
                        onPress={() => handleWhatsApp(item.Phonenumber)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.iconButton, styles.callButton]}
                        onPress={() => handleCall(item.Phonenumber)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="call" size={17} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {(rawTags.length > 0 || linkedPhones.length > 0) && (
                    <View style={styles.tagContainer}>
                      {rawTags.map((tag: string, index: number) => (
                        <TouchableOpacity
                          key={`tag-${index}`}
                          style={styles.tagPill}
                          activeOpacity={0.7}
                          onPress={() => handleSelectTagAndNavigate(tag)}
                        >
                          <Ionicons
                            name="pricetag-outline"
                            size={11}
                            color="#2563EB"
                            style={{ marginRight: 3 }}
                          />
                          <Text style={styles.tagText}>{tag}</Text>
                        </TouchableOpacity>
                      ))}

                      {linkedPhones.map((phone: string, lIdx: number) => {
                        const linkedPerson = contactsMap.get(phone);
                        const linkName = linkedPerson?.Name || `Contact (${phone})`;
                        return (
                          <TouchableOpacity
                            key={`link-${lIdx}`}
                            style={styles.tagPill}
                            activeOpacity={0.7}
                            onPress={() => {
                              if (linkedPerson) {
                                navigation.navigate('EditContact', { id: linkedPerson.id, userPhone });
                              }
                            }}
                          >
                            <Ionicons
                              name="link"
                              size={11}
                              color="#2563EB"
                              style={{ marginRight: 3 }}
                            />
                            <Text style={styles.tagText} numberOfLines={1}>
                              {linkName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {item.OtherDetails ? (
                    <View style={styles.notesContainer}>
                      <Text style={styles.detailsText} numberOfLines={2}>
                        {item.OtherDetails}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={32} color="#CBD5E1" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>No contacts found</Text>
              <Text style={styles.emptyText}>No contacts were added within this selected time window.</Text>
            </View>
          }
        />
      ) : (
        /* Tab 2: Recent Tags List */
        <FlatList
          data={recentTags}
          keyExtractor={(item) => item.name}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.tagItemRow}
              activeOpacity={0.7}
              onPress={() => handleSelectTagAndNavigate(item.name)}
            >
              <View style={styles.tagItemLeft}>
                <Ionicons name="pricetag-outline" size={15} color="#2563EB" />
                <Text style={styles.tagItemLabel}>{item.name}</Text>
              </View>
              <View style={styles.tagItemCountBadge}>
                <Text style={styles.tagItemCountText}>
                  {item.count} contact{item.count > 1 ? 's' : ''}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="pricetags-outline" size={32} color="#CBD5E1" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>No recent tags</Text>
              <Text style={styles.emptyText}>No tags were attached to contacts in this time window.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  compactHeaderContainer: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  compactHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactHeaderTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
    includeFontPadding: false,
  },
  badgeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
    marginTop: 4,
  },
  topTabs: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  topTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
    gap: 6,
  },
  topTabBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  topTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  topTabTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  filterChipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoBannerText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  cardWrapper: {
    marginBottom: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    maxWidth: '65%',
  },
  timeBadgeContainer: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#BFDBFE',
  },
  timeBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  phoneChipTouchable: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingRight: 6,
  },
  phoneText: {
    fontSize: 13.5,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 3,
  },
  tagText: {
    color: '#081b50',
    fontSize: 12.3,
    fontWeight: '600',
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    gap: 4,
  },
  detailsText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  tagItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  tagItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  tagItemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  tagItemCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagItemCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
});
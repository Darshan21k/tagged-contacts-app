import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import { Contact } from '../types';

// Feature Flag: Set to true ONLY when building the final native APK via EAS build
const USE_REAL_CALL_LOGS = true;

interface CallLogItem {
  id: string;
  phoneNumber: string;
  callType: 'incoming' | 'outgoing' | 'missed';
  timestamp: string;
  dateHeader: string;
}

export default function CallHistoryScreen({ navigation }: any) {
  const [callLogs, setCallLogs] = useState<CallLogItem[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userPhone, setUserPhone] = useState('9999999999');

  const sectionListRef = useRef<SectionList<CallLogItem>>(null);

  const fetchDeviceCallLogs = async () => {
    if (!USE_REAL_CALL_LOGS) {
      return [
        {
          id: 'mock-1',
          phoneNumber: '9876543210',
          callType: 'outgoing' as const,
          timestamp: '3:15 pm',
          dateHeader: 'Tuesday, 20 October',
        },
        {
          id: 'mock-2',
          phoneNumber: '9988776655',
          callType: 'missed' as const,
          timestamp: '2:26 pm',
          dateHeader: 'Tuesday, 20 October',
        },
        {
          id: 'mock-3',
          phoneNumber: '9112233445',
          callType: 'incoming' as const,
          timestamp: '11:05 am',
          dateHeader: 'Monday, 19 October',
        },
      ];
    }

    try {
      if (Platform.OS === 'android') {
        const { PermissionsAndroid } = require('react-native');
        
        // 1. Check if permission is already granted
        const hasPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
        );

        if (!hasPermission) {
          // 2. Request runtime permission popup safely
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
            {
              title: 'Call Log Permission',
              message: 'ContactNow needs access to your call logs to display your recent history.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );

          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.warn('Call log permission denied by user.');
            return [];
          }
        }

        // 3. Safely require and load native call logs
        const CallLog = require('react-native-call-log').default;
        if (!CallLog || typeof CallLog.load !== 'function') {
          console.warn('CallLog native module is not available.');
          return [];
        }

        const logs = await CallLog.load(50);
        if (!logs || !Array.isArray(logs)) return [];

        return logs.map((log: any, index: number) => {
          const callDate = new Date(parseInt(log.timestamp, 10));
          const timeStr = callDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
          const dateStr = callDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

          let type: 'incoming' | 'outgoing' | 'missed' = 'incoming';
          if (log.type === 'OUTGOING') type = 'outgoing';
          else if (log.type === 'MISSED') type = 'missed';

          return {
            id: `native-log-${index}-${log.timestamp}`,
            phoneNumber: log.phoneNumber || '',
            callType: type,
            timestamp: timeStr,
            dateHeader: dateStr,
          };
        });
      }
      return [];
    } catch (err) {
      console.warn('Failed to load native call logs safely:', err);
      return [];
    }
  };

  const fetchData = useCallback(async (phoneOverride?: string) => {
    try {
      const activePhone = phoneOverride || (await AsyncStorage.getItem('user_phone')) || userPhone;
      if (activePhone) setUserPhone(activePhone);

      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('*')
        .eq('Userphonenumber', activePhone)
        .order('Name', { ascending: true });

      if (error) throw error;
      setAllContacts(data || []);

      const logs = await fetchDeviceCallLogs();
      setCallLogs(logs);
    } catch (err: any) {
      console.warn('Failed to load call history:', err.message);
    }
  }, [userPhone]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const run = async () => {
        setLoading(true);
        await fetchData();
        if (isMounted) setLoading(false);
      };
      run();
      return () => {
        isMounted = false;
      };
    }, [fetchData])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const contactsMap = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of allContacts) {
      const cleanPhone = (c.Phonenumber || '').replace(/\D/g, '').slice(-10);
      if (cleanPhone) {
        map.set(cleanPhone, c);
      }
    }
    return map;
  }, [allContacts]);

  const sections = useMemo(() => {
    const grouped = callLogs.reduce((acc, log) => {
      if (!acc[log.dateHeader]) {
        acc[log.dateHeader] = [];
      }
      acc[log.dateHeader].push(log);
      return acc;
    }, {} as Record<string, CallLogItem[]>);

    return Object.keys(grouped).map((date) => ({
      title: date,
      data: grouped[date],
    }));
  }, [callLogs]);

  const handleCall = useCallback((phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
    if (!cleanNumber) return;
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      Alert.alert('Error', 'Unable to initiate call on this device.');
    });
  }, []);

  const handleWhatsApp = useCallback((phoneNumber: string) => {
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
  }, []);

  const handleCopyPhone = useCallback(async (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanNumber) return;
    await Clipboard.setStringAsync(cleanNumber);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

// Clean colored directional text arrows (No backgrounds, exact colors)
  const renderArrowIndicator = (callType: 'incoming' | 'outgoing' | 'missed') => {
    if (callType === 'outgoing') {
      return <Text style={{ color: '#16A34A', fontSize: 21, fontWeight: '900', marginLeft: 4 }}>↗</Text>; // Green upward-right for called
    } else if (callType === 'missed') {
      return <Text style={{ color: '#DC2626', fontSize: 21, fontWeight: '900', marginLeft: 4 }}>↙</Text>; // Red downward-left for missed
    } else {
      return <Text style={{ color: '#64748B', fontSize: 21, fontWeight: '900', marginLeft: 4 }}>↙</Text>; // Grey downward-left for received
    }
  };

  const renderCallCard = ({ item }: { item: CallLogItem }) => {
    const cleanLog10 = item.phoneNumber.replace(/\D/g, '').slice(-10);
    const matchedContact = contactsMap.get(cleanLog10);
    const isSaved = Boolean(matchedContact);

    const phoneEntries = useMemo(() => {
      if (!matchedContact) return [{ number: item.phoneNumber, label: 'Mobile' }];
      const numbers = (matchedContact.Phonenumber || '').split(',').map((p) => p.trim()).filter(Boolean);
      const labels = ((matchedContact as any).Phonelabels || '').split(',').map((l: string) => l.trim()).filter(Boolean);

      return numbers.map((num, idx) => ({
        number: num,
        label: labels[idx] || 'Mobile',
      }));
    }, [matchedContact, item.phoneNumber]);

    const primaryPhone = phoneEntries[0]?.number || item.phoneNumber;
    const secondaryPhones = phoneEntries.slice(1);

    const tagList = useMemo(() => {
      if (!matchedContact?.Tags) return [];
      return matchedContact.Tags.split(',').map((t) => t.trim()).filter(Boolean);
    }, [matchedContact?.Tags]);

    const isStarred = Boolean(matchedContact?.is_starred);
    const primaryTag = (matchedContact as any)?.PrimaryTag || tagList[0];

    return (
      <View style={styles.swipeableWrapper}>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.headerInfo}>
              <View style={styles.nameRow}>
                {isSaved && (
                  <Ionicons
                    name={isStarred ? 'star' : 'star-outline'}
                    size={18}
                    color={isStarred ? '#F59E0B' : '#94A3B8'}
                  />
                )}
                <Text style={styles.nameText} numberOfLines={1}>
                  {isSaved ? matchedContact?.Name : 'Unsaved Number'}
                </Text>
              </View>

              {isSaved && primaryTag ? (
                <View style={styles.primaryTagTouchable}>
                  <Text style={styles.primaryTagText}>{primaryTag}</Text>
                </View>
              ) : null}

              {phoneEntries.length > 0 && (
                <TouchableOpacity
                  style={styles.phoneChipTouchable}
                  onPress={() => handleCopyPhone(primaryPhone)}
                  activeOpacity={0.6}
                >
                  <View style={styles.phoneRow}>
                    <Ionicons name="call-outline" size={15} color="#2563EB" />
                    <Text style={styles.phoneText}>{primaryPhone}</Text>
                    {phoneEntries[0].label ? (
                      <View style={[styles.labelBadge, styles.secondaryLabelBadge]}>
                        <Text style={[styles.labelBadgeText, styles.secondaryLabelBadgeText]}>
                          {phoneEntries[0].label}
                        </Text>
                      </View>
                    ) : null}
                    {renderArrowIndicator(item.callType)}
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.rightHeaderColumn}>
              <Text style={styles.timestampText}>{item.timestamp}</Text>
              {isSaved && (
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.iconButton, styles.whatsappButton]}
                    onPress={() => handleWhatsApp(primaryPhone)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.iconButton, styles.callButton]}
                    onPress={() => handleCall(primaryPhone)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="call" size={17} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {!isSaved && (
            <View style={styles.rightHeaderColumnAbsolute}>
              <Text style={styles.timestampText}>{item.timestamp}</Text>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.iconButton, styles.whatsappButton]}
                  onPress={() => handleWhatsApp(item.phoneNumber)}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButton, styles.callButton]}
                  onPress={() => handleCall(item.phoneNumber)}
                >
                  <Ionicons name="call" size={17} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {secondaryPhones.map((sec, sIdx) => (
            <View key={`sec-phone-${sIdx}`} style={styles.secondaryPhoneRowWrapper}>
              <TouchableOpacity
                style={styles.phoneChipTouchable}
                onPress={() => handleCopyPhone(sec.number)}
                activeOpacity={0.6}
              >
                <View style={styles.phoneRow}>
                  <Ionicons name="call-outline" size={14} color="#64748B" />
                  <Text style={styles.secondaryPhoneText}>{sec.number}</Text>
                  {sec.label ? (
                    <View style={[styles.labelBadge, styles.secondaryLabelBadge]}>
                      <Text style={[styles.labelBadgeText, styles.secondaryLabelBadgeText]}>
                        {sec.label}
                      </Text>
                    </View>
                  ) : null}
                  {renderArrowIndicator(item.callType)}
                </View>
              </TouchableOpacity>

              <View style={styles.secondaryActionButtons}>
                <TouchableOpacity
                  style={[styles.secondaryIconButton, styles.whatsappButton]}
                  onPress={() => handleWhatsApp(sec.number)}
                >
                  <Ionicons name="logo-whatsapp" size={14} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryIconButton, styles.callButton]}
                  onPress={() => handleCall(sec.number)}
                >
                  <Ionicons name="call" size={13} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {!isSaved && (
            <TouchableOpacity
              style={styles.addContactBannerButton}
              onPress={() => navigation.navigate('Home', { prefilledPhone: item.phoneNumber })}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add-outline" size={14} color="#2563EB" />
              <Text style={styles.addContactBannerText}>Add Contact</Text>
            </TouchableOpacity>
          )}

          {isSaved && tagList.length > 0 && (
            <View style={styles.tagContainer}>
              {tagList.map((tag, index) => (
                <View key={`tag-${index}`} style={styles.tagPill}>
                  <Ionicons name="pricetag-outline" size={11} color="#2563EB" style={{ marginRight: 3 }} />
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {isSaved && matchedContact?.OtherDetails ? (
            <View style={styles.notesContainer}>
              <Text style={styles.detailsText} numberOfLines={2}>
                {matchedContact.OtherDetails}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SectionList
        ref={sectionListRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderCallCard}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.stickyBar}>
            <Text style={styles.counterText}>{title}</Text>
          </View>
        )}
        stickySectionHeadersEnabled={true}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#2563EB']}
            tintColor="#2563EB"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  listContent: { paddingBottom: 40, paddingTop: 6 },
  stickyBar: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 6,
  },
  counterText: {
    fontSize: 12.5,
    color: '#515d6e',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  swipeableWrapper: {
    marginHorizontal: 16,
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
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerInfo: { flex: 1, marginRight: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameText: { fontSize: 16, fontWeight: '700', color: '#1E293B', maxWidth: '65%' },
  rightHeaderColumn: { alignItems: 'flex-end', gap: 6 },
  rightHeaderColumnAbsolute: { position: 'absolute', right: 14, top: 14, alignItems: 'flex-end', gap: 6 },
  timestampText: { fontSize: 11.5, color: '#64748B', fontWeight: '600' },
  primaryTagTouchable: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 2,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  primaryTagText: { fontSize: 12.5, fontWeight: '700', color: '#2255df' },
  phoneChipTouchable: { alignSelf: 'flex-start', marginTop: 4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2, paddingRight: 6, gap: 6 },
  phoneText: { fontSize: 14, color: '#2563EB', fontWeight: '600' },
  secondaryPhoneText: { fontSize: 13.5, color: '#334155', fontWeight: '600' },
  labelBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginLeft: 4,
  },
  labelBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#1D4ED8' },
  secondaryPhoneRowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  secondaryLabelBadge: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  secondaryLabelBadgeText: { color: '#475569' },
  secondaryActionButtons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  secondaryIconButton: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  whatsappButton: { backgroundColor: '#25D366' },
  callButton: { backgroundColor: '#2563EB' },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
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
  tagText: { color: '#081b50', fontSize: 12.3, fontWeight: '600' },
  notesContainer: { marginTop: 8 },
  detailsText: { fontSize: 12, color: '#64748B', lineHeight: 16 },
  addContactBannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  addContactBannerText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  indicatorContainer: {
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
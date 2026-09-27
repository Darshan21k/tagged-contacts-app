import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Linking,
  RefreshControl,
  Keyboard,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { Contact, FollowupItem } from '../types';

type TabType = 'all' | 'overdue' | 'today' | 'upcoming';
type CompletedFilterType = 'all' | 'today' | 'yesterday' | 'week' | 'month' | '6months';

const formatToDDMMYYYY = (isoDate: string): string => {
  if (!isoDate || !isoDate.includes('-')) return isoDate;
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const ITEM_HEIGHT = 32;

const COMPLETED_FILTERS: { label: string; key: CompletedFilterType }[] = [
  { label: 'All History', key: 'all' },
  { label: 'Today', key: 'today' },
  { label: 'Yesterday', key: 'yesterday' },
  { label: 'Past 1 Week', key: 'week' },
  { label: 'Past 1 Month', key: 'month' },
  { label: 'Past 6 Months', key: '6months' },
];

export default function FollowupsScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const userPhone: string = route.params?.userPhone || '9999999999';

  const [activeFilterContactId, setActiveFilterContactId] = useState<number | undefined>(
    route.params?.filterContactId
  );
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [followups, setFollowups] = useState<FollowupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [completedFilter, setCompletedFilter] = useState<CompletedFilterType>('all');
  const [isCompletedFilterModalVisible, setIsCompletedFilterModalVisible] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());

  // Creation & Edit Modal state
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(Boolean(route.params?.openCreate));
  const [editingItem, setEditingItem] = useState<FollowupItem | null>(null);

  // Read-Only View Modal State for Completed Items
  const [viewingItem, setViewingItem] = useState<FollowupItem | null>(null);

  const [createType, setCreateType] = useState<'contact' | 'task'>('contact');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(
    route.params?.preselectedContact || null
  );

  // Exact ID & Phonenumber binding
  const [boundContacts, setBoundContacts] = useState<Contact[]>([]);
  const [boundTags, setBoundTags] = useState<string[]>([]);

  const [noteText, setNoteText] = useState('');
  const [noteInputHeight, setNoteInputHeight] = useState(60);
  const [dueDate, setDueDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Calendar Modal State
  const [isCalendarPickerVisible, setIsCalendarPickerVisible] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(() => new Date());

  // 12-Hour Vertical Wheel Time States
  const [timeHour, setTimeHour] = useState('09');
  const [timeMinute, setTimeMinute] = useState('00');
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>('AM');
  const [isTimeEnabled, setIsTimeEnabled] = useState(false);

  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);

  // Centered Toast State
  const [toastData, setToastData] = useState<{
    actionTitle: string;
    schedule: string;
    targetName: string;
    noteSnippet: string;
  } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastScale = useRef(new Animated.Value(0.92)).current;
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cursor tracking for @ and #
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  // Suggestions state
  const [suggestionMode, setSuggestionMode] = useState<'contact' | 'tag' | null>(null);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const noteInputRef = useRef<TextInput>(null);

  const routeParamsHandledRef = useRef<boolean>(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const showCenteredToast = useCallback(
    (actionTitle: string, schedule: string, targetName: string, noteSnippet: string) => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToastData({ actionTitle, schedule, targetName, noteSnippet });
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(toastScale, {
          toValue: 1,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();

      toastTimeoutRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastOpacity, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(toastScale, {
            toValue: 0.92,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start(() => setToastData(null));
      }, 3200);
    },
    [toastOpacity, toastScale]
  );

  const contactsMap = useMemo(() => {
    const map = new Map<number, Contact>();
    allContacts.forEach((c) => map.set(c.id, c));
    return map;
  }, [allContacts]);

  useEffect(() => {
    if (!routeParamsHandledRef.current) {
      if (route.params?.preselectedContact) {
        setSelectedContact(route.params.preselectedContact);
        setBoundContacts([route.params.preselectedContact]);
        setCreateType('contact');
      }
      if (route.params?.filterContactId !== undefined) {
        setActiveFilterContactId(route.params.filterContactId);
      }
      if (route.params?.openCreate) {
        setIsCreateModalVisible(true);
      }
      routeParamsHandledRef.current = true;
    }
  }, [route.params]);

  useEffect(() => {
    if (activeFilterContactId && !searchQuery) {
      const contact = contactsMap.get(activeFilterContactId);
      if (contact?.Name) {
        setSearchQuery(contact.Name);
      }
    }
  }, [activeFilterContactId, contactsMap, searchQuery]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    allContacts.forEach((c) => {
      if (c.Tags) {
        c.Tags.split(',').forEach((t) => {
          const clean = t.trim();
          if (clean) set.add(clean);
        });
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allContacts]);

  const fetchContacts = useCallback(async (phone: string) => {
    try {
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('*')
        .eq('Userphonenumber', phone)
        .order('Name', { ascending: true });
      if (error) throw error;
      setAllContacts(data || []);
    } catch (err: any) {
      console.warn('Failed to load contacts for followups:', err.message);
    }
  }, []);

  const fetchFollowups = useCallback(async (phone: string) => {
    try {
      const { data, error } = await supabase
        .from('Followups_Table')
        .select('*')
        .eq('Userphonenumber', phone)
        .order('due_date', { ascending: true });
      if (error) throw error;
      setFollowups(data || []);
    } catch (err: any) {
      console.warn('Failed to load followups:', err.message);
    }
  }, []);

  const loadData = useCallback(async () => {
    const storedPhone = (await AsyncStorage.getItem('user_phone')) || userPhone;
    await Promise.all([fetchContacts(storedPhone), fetchFollowups(storedPhone)]);
  }, [userPhone, fetchContacts, fetchFollowups]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      await loadData();
      if (isMounted) setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    navigation.setParams({
      filterContactId: undefined,
      preselectedContact: undefined,
      openCreate: undefined,
    });

    setActiveFilterContactId(undefined);
    setSearchQuery('');
    setActiveTab('all');
    setIsCompletedExpanded(false);
    setCompletedFilter('all');
    setExpandedTaskIds(new Set());
    Keyboard.dismiss();

    await loadData();
    setRefreshing(false);
  }, [navigation, loadData]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const presetDates = useMemo(() => {
    const getOffsetDate = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toISOString().split('T')[0];
    };
    return {
      today: getOffsetDate(0),
      tomorrow: getOffsetDate(1),
      in3Days: getOffsetDate(3),
      nextWeek: getOffsetDate(7),
    };
  }, []);

  const getFollowupTimestamp = (f: FollowupItem): number => {
    try {
      const datePart = f.due_date;
      let hours = 9;
      let minutes = 0;

      if (f.due_time) {
        const parts = f.due_time.split(/[: ]/);
        if (parts.length >= 2) {
          let h = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const mer = parts[2];
          if (mer === 'PM' && h < 12) h += 12;
          if (mer === 'AM' && h === 12) h = 0;
          hours = isNaN(h) ? 9 : h;
          minutes = isNaN(m) ? 0 : m;
        }
      }

      const [y, m, d] = datePart.split('-').map(Number);
      return new Date(y, m - 1, d, hours, minutes, 0).getTime();
    } catch {
      return 0;
    }
  };

  const activeFollowups = useMemo(() => {
    const uncompleted = followups.filter((f) => !f.is_completed);
    return uncompleted.sort((a, b) => getFollowupTimestamp(a) - getFollowupTimestamp(b));
  }, [followups]);

  const completedFollowups = useMemo(() => {
    let done = followups.filter((f) => f.is_completed);

    if (activeFilterContactId) {
      done = done.filter(
        (f) =>
          f.contact_id === activeFilterContactId ||
          (f.linked_contact_ids || []).includes(activeFilterContactId)
      );
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (completedFilter !== 'all') {
      done = done.filter((item) => {
        const itemDateStr = item.completed_at?.split('T')[0] || item.due_date;
        const [y, m, d] = itemDateStr.split('-').map(Number);
        const itemTime = new Date(y, m - 1, d).getTime();

        if (completedFilter === 'today') {
          return itemTime >= todayStart;
        } else if (completedFilter === 'yesterday') {
          const yesterdayStart = todayStart - oneDayMs;
          return itemTime >= yesterdayStart && itemTime < todayStart;
        } else if (completedFilter === 'week') {
          return itemTime >= todayStart - 7 * oneDayMs;
        } else if (completedFilter === 'month') {
          return itemTime >= todayStart - 30 * oneDayMs;
        } else if (completedFilter === '6months') {
          return itemTime >= todayStart - 180 * oneDayMs;
        }
        return true;
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      done = done.filter((f) => {
        const contact = f.contact_id ? contactsMap.get(f.contact_id) : null;
        const nameMatch = contact?.Name?.toLowerCase().includes(q);
        const noteMatch = f.note.toLowerCase().includes(q);
        const tagMatch = (f.target_tags || []).some((t) => t.toLowerCase().includes(q));
        return nameMatch || noteMatch || tagMatch;
      });
    }

    return done.sort((a, b) => {
      const tA = a.completed_at ? new Date(a.completed_at).getTime() : getFollowupTimestamp(a);
      const tB = b.completed_at ? new Date(b.completed_at).getTime() : getFollowupTimestamp(b);
      return tB - tA;
    });
  }, [followups, activeFilterContactId, completedFilter, searchQuery, contactsMap]);

  // GROUP COMPLETED FOLLOW-UPS DATE-WISE (Today, Yesterday, Past 1 Week, etc.)
  const groupedCompletedFollowups = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const yesterdayStart = todayStart - oneDayMs;
    const weekStart = todayStart - 7 * oneDayMs;
    const monthStart = todayStart - 30 * oneDayMs;
    const sixMonthsStart = todayStart - 180 * oneDayMs;

    const groups: { title: string; subtitle: string; data: FollowupItem[] }[] = [
      { title: 'Today', subtitle: formatToDDMMYYYY(todayStr), data: [] },
      { title: 'Yesterday', subtitle: formatToDDMMYYYY(new Date(yesterdayStart).toISOString().split('T')[0]), data: [] },
      { title: 'Past 1 Week', subtitle: 'Earlier this week', data: [] },
      { title: 'Past 1 Month', subtitle: 'Earlier this month', data: [] },
      { title: 'Past 6 Months', subtitle: 'Older history', data: [] },
    ];

    completedFollowups.forEach((item) => {
      const itemDateStr = item.completed_at?.split('T')[0] || item.due_date;
      const [y, m, d] = itemDateStr.split('-').map(Number);
      const itemTime = new Date(y, m - 1, d).getTime();

      if (itemTime >= todayStart) {
        groups[0].data.push(item);
      } else if (itemTime >= yesterdayStart) {
        groups[1].data.push(item);
      } else if (itemTime >= weekStart) {
        groups[2].data.push(item);
      } else if (itemTime >= monthStart) {
        groups[3].data.push(item);
      } else {
        groups[4].data.push(item);
      }
    });

    return groups.filter((g) => g.data.length > 0);
  }, [completedFollowups, todayStr]);

  const counts = useMemo(() => {
    let overdue = 0;
    let today = 0;
    let upcoming = 0;

    activeFollowups.forEach((f) => {
      if (f.due_date < todayStr) overdue++;
      else if (f.due_date === todayStr) today++;
      else upcoming++;
    });

    return {
      all: activeFollowups.length,
      overdue,
      today,
      upcoming,
      completed: completedFollowups.length,
    };
  }, [activeFollowups, completedFollowups.length, todayStr]);

  const filteredActiveList = useMemo(() => {
    let list = activeFollowups;

    if (activeFilterContactId) {
      list = list.filter(
        (f) =>
          f.contact_id === activeFilterContactId ||
          (f.linked_contact_ids || []).includes(activeFilterContactId)
      );
    }

    if (activeTab === 'overdue') {
      list = list.filter((f) => f.due_date < todayStr);
    } else if (activeTab === 'today') {
      list = list.filter((f) => f.due_date === todayStr);
    } else if (activeTab === 'upcoming') {
      list = list.filter((f) => f.due_date > todayStr);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((f) => {
        const contact = f.contact_id ? contactsMap.get(f.contact_id) : null;
        const nameMatch = contact?.Name?.toLowerCase().includes(q);
        const noteMatch = f.note.toLowerCase().includes(q);
        const tagMatch = (f.target_tags || []).some((t) => t.toLowerCase().includes(q));
        const cohortMatch = (f.linked_contact_ids || []).some((cId) =>
          contactsMap.get(cId)?.Name?.toLowerCase().includes(q)
        );
        return nameMatch || noteMatch || tagMatch || cohortMatch;
      });
    }

    return list;
  }, [activeFollowups, activeTab, todayStr, searchQuery, activeFilterContactId, contactsMap]);

  const handleToggleComplete = async (item: FollowupItem) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nextState = !item.is_completed;
    const nowIso = nextState ? new Date().toISOString() : null;

    const nextCompletedContactIds = nextState ? item.completed_contact_ids : [];

    setFollowups((prev) =>
      prev.map((f) =>
        f.id === item.id
          ? {
              ...f,
              is_completed: nextState,
              completed_at: nowIso,
              completed_contact_ids: nextCompletedContactIds,
            }
          : f
      )
    );

    try {
      const { error } = await supabase
        .from('Followups_Table')
        .update({
          is_completed: nextState,
          completed_at: nowIso,
          completed_contact_ids: nextCompletedContactIds,
        })
        .eq('id', item.id);
      if (error) throw error;
    } catch {
      Alert.alert('Error', 'Failed to update reminder status.');
      loadData();
    }
  };

  const handleConfirmUndo = (item: FollowupItem) => {
    Alert.alert(
      'Reopen Follow-up',
      'Are you sure you want to mark this follow-up as active again? All checklist items will be reset.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Reopen',
          onPress: () => handleToggleComplete(item),
        },
      ]
    );
  };

  const handleToggleTaskContact = async (item: FollowupItem, contactId: number) => {
    await Haptics.selectionAsync();
    const existing = new Set(item.completed_contact_ids || []);
    if (existing.has(contactId)) {
      existing.delete(contactId);
    } else {
      existing.add(contactId);
    }
    const nextArray = Array.from(existing);

    setFollowups((prev) =>
      prev.map((f) => (f.id === item.id ? { ...f, completed_contact_ids: nextArray } : f))
    );

    try {
      const { error } = await supabase
        .from('Followups_Table')
        .update({ completed_contact_ids: nextArray })
        .eq('id', item.id);
      if (error) throw error;
    } catch {
      console.warn('Failed to update group task contact item');
    }
  };

  const handleMarkAllTaskComplete = async (item: FollowupItem, targetContacts: Contact[]) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const allIds = targetContacts.map((c) => c.id);

    setFollowups((prev) =>
      prev.map((f) =>
        f.id === item.id
          ? { ...f, completed_contact_ids: allIds, is_completed: true, completed_at: new Date().toISOString() }
          : f
      )
    );

    try {
      const { error } = await supabase
        .from('Followups_Table')
        .update({
          completed_contact_ids: allIds,
          is_completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      if (error) throw error;
    } catch {
      loadData();
    }
  };

  const handleDeleteFollowup = (item: FollowupItem) => {
    Alert.alert('Delete Reminder', 'Are you sure you want to remove this follow-up?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setFollowups((prev) => prev.filter((f) => f.id !== item.id));
          try {
            await supabase.from('Followups_Table').delete().eq('id', item.id);
          } catch {
            loadData();
          }
        },
      },
    ]);
  };

  const handleClearAllCompleted = () => {
    if (completedFollowups.length === 0) return;
    Alert.alert(
      'Clear Completed History',
      `Delete all ${completedFollowups.length} completed logs? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const idsToDelete = completedFollowups.map((f) => f.id);
            setFollowups((prev) => prev.filter((f) => !idsToDelete.includes(f.id)));
            try {
              await supabase.from('Followups_Table').delete().in('id', idsToDelete);
            } catch {
              loadData();
            }
          },
        },
      ]
    );
  };

  const formattedTimeForStorage = useMemo(() => {
    if (!isTimeEnabled) return null;
    const h = timeHour.padStart(2, '0');
    const m = timeMinute.padStart(2, '0');
    return `${h}:${m} ${timePeriod}`;
  }, [isTimeEnabled, timeHour, timeMinute, timePeriod]);

  const handleOpenEdit = (item: FollowupItem) => {
    Haptics.selectionAsync().catch(() => {});
    setEditingItem(item);
    setCreateType(item.type);
    setSelectedContact(item.contact_id ? contactsMap.get(item.contact_id) || null : null);

    const linked = (item.linked_contact_ids || [])
      .map((id) => contactsMap.get(id))
      .filter(Boolean) as Contact[];

    setBoundContacts(linked);
    setBoundTags(item.target_tags || []);
    setNoteText(item.note);
    setDueDate(item.due_date);

    if (item.due_time) {
      setIsTimeEnabled(true);
      const match = item.due_time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (match) {
        let rawH = parseInt(match[1], 10);
        const rawM = parseInt(match[2], 10);
        let period: 'AM' | 'PM' = 'AM';

        if (match[3]) {
          period = match[3].toUpperCase() as 'AM' | 'PM';
        } else if (rawH >= 12) {
          period = 'PM';
          if (rawH > 12) rawH -= 12;
        } else if (rawH === 0) {
          rawH = 12;
        }

        const validHour = String(rawH === 0 ? 12 : rawH).padStart(2, '0');
        const nearestMinuteNum = Math.round(rawM / 5) * 5;
        const validMinute = String(nearestMinuteNum >= 60 ? 55 : nearestMinuteNum).padStart(2, '0');

        setTimeHour(validHour);
        setTimeMinute(validMinute);
        setTimePeriod(period);

        setTimeout(() => {
          const hIdx = HOURS.indexOf(validHour);
          const mIdx = MINUTES.indexOf(validMinute);
          if (hIdx !== -1 && hourScrollRef.current) {
            hourScrollRef.current.scrollTo({ y: Math.max(0, (hIdx - 1) * ITEM_HEIGHT), animated: true });
          }
          if (mIdx !== -1 && minuteScrollRef.current) {
            minuteScrollRef.current.scrollTo({ y: Math.max(0, (mIdx - 1) * ITEM_HEIGHT), animated: true });
          }
        }, 150);
      }
    } else {
      setIsTimeEnabled(false);
    }
    setIsCreateModalVisible(true);
  };

  const handleOpenView = (item: FollowupItem) => {
    Haptics.selectionAsync().catch(() => {});
    setViewingItem(item);
  };

  const handleCall = (phone?: string) => {
    if (!phone) return;
    const clean = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => Alert.alert('Error', 'Unable to initiate call.'));
  };

  const handleWhatsApp = (phone?: string) => {
    if (!phone) return;
    const clean = phone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${clean}`).catch(() =>
      Alert.alert('Error', 'WhatsApp is not installed.')
    );
  };

  const handleNavigateWithTag = (tagName: string) => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('Contacts', { selectedTag: tagName });
  };

  const toggleTaskDrawer = (id: number) => {
    Haptics.selectionAsync().catch(() => {});
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInsertHelper = (char: '@' | '#') => {
    Haptics.selectionAsync().catch(() => {});
    const pos = selection.start;
    const before = noteText.substring(0, pos);
    const after = noteText.substring(pos);
    const insert = (before.length > 0 && !before.endsWith(' ') ? ' ' : '') + char;
    const newText = before + insert + after;

    setNoteText(newText);
    setSuggestionMode(char === '@' ? 'contact' : 'tag');
    setSuggestionQuery('');

    const newPos = pos + insert.length;
    setSelection({ start: newPos, end: newPos });
    noteInputRef.current?.focus();
  };

  const handleNoteTextChange = (text: string) => {
    setNoteText(text);

    if (text.includes('@') && createType === 'contact' && !editingItem) {
      setCreateType('task');
    }

    setBoundContacts((prev) =>
      prev.filter((c) => new RegExp(`@${c.Name}\\b`, 'i').test(text))
    );

    const noteWords = text.match(/#([a-zA-Z0-9_\-]+)/g) || [];
    const parsedTags = noteWords.map((t) => t.replace('#', '').trim().toLowerCase());
    setBoundTags((prev) =>
      prev.filter((t) => parsedTags.includes(t.toLowerCase()))
    );

    const pos = selection.start;
    const textUpToCursor = text.substring(0, pos);
    const lastAt = textUpToCursor.lastIndexOf('@');
    const lastHash = textUpToCursor.lastIndexOf('#');
    const lastSpace = textUpToCursor.lastIndexOf(' ');

    if (lastAt > lastHash && lastAt > lastSpace) {
      setSuggestionMode('contact');
      setSuggestionQuery(textUpToCursor.substring(lastAt + 1).toLowerCase());
    } else if (lastHash > lastAt && lastHash > lastSpace) {
      setSuggestionMode('tag');
      setSuggestionQuery(textUpToCursor.substring(lastHash + 1).toLowerCase());
    } else {
      setSuggestionMode(null);
      setSuggestionQuery('');
    }
  };

  const handleSelectContactSuggestion = (c: Contact) => {
    Haptics.selectionAsync().catch(() => {});
    const pos = selection.start;
    const before = noteText.substring(0, pos);
    const after = noteText.substring(pos);
    const lastAt = before.lastIndexOf('@');
    const base = before.substring(0, lastAt);
    const updated = base + `@${c.Name} ` + after;

    handleNoteTextChange(updated);

    if (createType === 'contact' && !selectedContact) {
      setSelectedContact(c);
    }

    setSuggestionMode(null);
    const newPos = base.length + c.Name.length + 2;
    setSelection({ start: newPos, end: newPos });
  };

  const handleSelectTagSuggestion = (tag: string) => {
    Haptics.selectionAsync().catch(() => {});
    const pos = selection.start;
    const before = noteText.substring(0, pos);
    const after = noteText.substring(pos);
    const lastHash = before.lastIndexOf('#');
    const base = before.substring(0, lastHash);
    const updated = base + `#${tag} ` + after;

    handleNoteTextChange(updated);

    if (!boundTags.map(t => t.toLowerCase()).includes(tag.toLowerCase())) {
      setBoundTags((prev) => [...prev, tag]);
    }

    setSuggestionMode(null);
    const newPos = base.length + tag.length + 2;
    setSelection({ start: newPos, end: newPos });
  };

  const handleRemoveBoundContact = (contactId: number) => {
    Haptics.selectionAsync().catch(() => {});
    const contactToRemove = contactsMap.get(contactId);
    if (contactToRemove) {
      const escapedName = contactToRemove.Name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`@${escapedName}\\b`, 'gi');
      const nextNote = noteText.replace(regex, '').replace(/\s+/g, ' ').trim();
      handleNoteTextChange(nextNote);
    }
    if (selectedContact?.id === contactId) {
      setSelectedContact(null);
    }
  };

  const handleRemoveBoundTag = (tag: string) => {
    Haptics.selectionAsync().catch(() => {});
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`#${escapedTag}\\b`, 'gi');
    const nextNote = noteText.replace(regex, '').replace(/\s+/g, ' ').trim();
    handleNoteTextChange(nextNote);
  };

  const validateTimeNotPassed = (): boolean => {
    if (!isTimeEnabled) return true;
    if (dueDate !== todayStr) return true;

    let h = parseInt(timeHour, 10);
    const m = parseInt(timeMinute, 10);
    if (timePeriod === 'PM' && h < 12) h += 12;
    if (timePeriod === 'AM' && h === 12) h = 0;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (h < currentHour || (h === currentHour && m < currentMinute)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'Time Has Passed',
        `The time ${timeHour}:${timeMinute} ${timePeriod} has already passed for today. Please select an upcoming time.`
      );
      return false;
    }
    return true;
  };

  const handleSaveFollowup = async () => {
    if (!noteText.trim() && boundContacts.length === 0 && boundTags.length === 0) {
      Alert.alert('Note Required', 'Please enter note text, mention a contact, or add a tag.');
      return;
    }

    if (!validateTimeNotPassed()) {
      return;
    }

    const activePhone = (await AsyncStorage.getItem('user_phone')) || userPhone;

    const rawTagMatches = noteText.match(/#([a-zA-Z0-9_\-]+)/g) || [];
    const parsedTextTags = rawTagMatches.map((t) => t.replace('#', '').trim()).filter(Boolean);
    const finalTags = Array.from(new Set([...boundTags, ...parsedTextTags]));

    const finalLinkedIds: number[] = Array.from(new Set(boundContacts.map((c) => c.id)));

    const primaryContactId =
      createType === 'contact' ? selectedContact?.id || (boundContacts.length > 0 ? boundContacts[0].id : null) : null;

    const payload = {
      Userphonenumber: activePhone,
      type: createType,
      contact_id: primaryContactId,
      linked_contact_ids: createType === 'task' ? finalLinkedIds : [],
      target_tags: createType === 'task' ? finalTags : [],
      note: noteText.trim(),
      due_date: dueDate,
      due_time: formattedTimeForStorage,
    };

    setIsCreateModalVisible(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const scheduleDisplay = `${formatToDDMMYYYY(dueDate)}${
      formattedTimeForStorage ? ` at ${formattedTimeForStorage}` : ''
    }`;
    const targetDisplayName =
      createType === 'contact'
        ? selectedContact?.Name || (boundContacts[0]?.Name ?? 'Individual')
        : finalLinkedIds.length > 0
        ? `${finalLinkedIds.length} Linked Contacts`
        : finalTags.length > 0
        ? `Task Cohort #${finalTags.join(', #')}`
        : 'Group Task';

    try {
      if (editingItem) {
        setFollowups((prev) =>
          prev.map((f) => (f.id === editingItem.id ? { ...f, ...payload } : f))
        );

        const { error } = await supabase
          .from('Followups_Table')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;

        showCenteredToast('Follow-up Updated', scheduleDisplay, targetDisplayName, noteText.trim());
      } else {
        const fullPayload = {
          ...payload,
          is_completed: false,
          completed_contact_ids: [],
        };

        const { data, error } = await supabase
          .from('Followups_Table')
          .insert(fullPayload)
          .select()
          .single();
        if (error) throw error;

        setFollowups((prev) => [data, ...prev]);

        showCenteredToast('Follow-up Scheduled', scheduleDisplay, targetDisplayName, noteText.trim());
      }

      setEditingItem(null);
      setNoteText('');
      setSelectedContact(null);
      setBoundContacts([]);
      setBoundTags([]);
      setIsTimeEnabled(false);
      setDueDate(new Date().toISOString().split('T')[0]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save follow-up.');
      loadData();
    }
  };

  const setQuickDate = (offsetDays: number) => {
    Haptics.selectionAsync().catch(() => {});
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setDueDate(d.toISOString().split('T')[0]);
  };

  const calendarDays = useMemo(() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  }, [calendarViewDate]);

  const handleSelectCalendarDay = (day: number) => {
    Haptics.selectionAsync().catch(() => {});
    const y = calendarViewDate.getFullYear();
    const m = String(calendarViewDate.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    setDueDate(`${y}-${m}-${d}`);
    setIsCalendarPickerVisible(false);
  };

  const renderFormattedNotePreview = (text: string) => {
    const tokens = text.split(/(#[a-zA-Z0-9_\-]+|@[a-zA-Z0-9_\s]+)/g);
    return (
      <Text style={styles.noteText}>
        {tokens.map((token, index) => {
          if (token.startsWith('@')) {
            return (
              <Text key={index} style={styles.noteMentionHighlight}>
                {token}
              </Text>
            );
          }
          if (token.startsWith('#')) {
            return (
              <Text key={index} style={styles.noteTagHighlight}>
                {token}
              </Text>
            );
          }
          return (
            <Text key={index} style={styles.noteProseText}>
              {token}
            </Text>
          );
        })}
      </Text>
    );
  };

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
          <Text style={styles.compactHeaderTitle}>Follow-ups</Text>
          <View style={styles.badgeIndicator} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.addHeaderBtn}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setEditingItem(null);
              setNoteText('');
              setSelectedContact(null);
              setBoundContacts([]);
              setBoundTags([]);
              setIsTimeEnabled(false);
              setDueDate(new Date().toISOString().split('T')[0]);
              setIsCreateModalVisible(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addHeaderBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Unified Search Bar */}
      <View style={styles.searchSection}>
        <Ionicons name="search" size={17} color="#94A3B8" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search note, contact, or #tag..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={(txt) => {
            setSearchQuery(txt);
            if (activeFilterContactId) {
              setActiveFilterContactId(undefined);
              navigation.setParams({ filterContactId: undefined });
            }
          }}
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setSearchQuery('');
              setActiveFilterContactId(undefined);
              navigation.setParams({ filterContactId: undefined });
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={17} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* 4 Status Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'all' && styles.tabChipActive]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveTab('all');
          }}
        >
          <Text style={[styles.tabChipText, activeTab === 'all' && styles.tabChipTextActive]}>
            All ({counts.all})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabChip,
            activeTab === 'overdue' && styles.tabChipActive,
            counts.overdue > 0 && styles.tabChipOverdue,
          ]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveTab('overdue');
          }}
        >
          <Text
            style={[
              styles.tabChipText,
              activeTab === 'overdue' && styles.tabChipTextActive,
              counts.overdue > 0 && { color: activeTab === 'overdue' ? '#FFFFFF' : '#EF4444' },
            ]}
          >
            Overdue ({counts.overdue})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'today' && styles.tabChipActive]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveTab('today');
          }}
        >
          <Text style={[styles.tabChipText, activeTab === 'today' && styles.tabChipTextActive]}>
            Today ({counts.today})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'upcoming' && styles.tabChipActive]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveTab('upcoming');
          }}
        >
          <Text style={[styles.tabChipText, activeTab === 'upcoming' && styles.tabChipTextActive]}>
            Upcoming ({counts.upcoming})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading && followups.length === 0 ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filteredActiveList}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 90 },
          ]}
          keyboardShouldPersistTaps="always"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2563EB']}
              tintColor="#2563EB"
            />
          }
          renderItem={({ item }) => {
            const isTask = item.type === 'task';
            const contact = item.contact_id ? contactsMap.get(item.contact_id) : null;
            const isOverdue = item.due_date < todayStr;
            const isToday = item.due_date === todayStr;

            const targetContacts = isTask
              ? allContacts.filter((c) => {
                  const isExplicitlyLinked =
                    item.linked_contact_ids && item.linked_contact_ids.includes(c.id);
                  const matchesTag =
                    c.Tags &&
                    (item.target_tags || []).some((tg) => {
                      const tagsArray = c.Tags!.split(',').map((t) => t.trim().toLowerCase());
                      return tagsArray.includes(tg.trim().toLowerCase());
                    });
                  return isExplicitlyLinked || matchesTag;
                })
              : contact ? [contact] : [];

            const validCardTags = (() => {
              if (!item.target_tags || item.target_tags.length === 0) return [];
              return item.target_tags.filter((tg) =>
                targetContacts.some((c) => {
                  const cTags = c.Tags ? c.Tags.split(',').map((t) => t.trim().toLowerCase()) : [];
                  return cTags.includes(tg.trim().toLowerCase());
                })
              );
            })();

            const isExpanded = expandedTaskIds.has(item.id);
            const completedIdsSet = new Set(item.completed_contact_ids || []);

            return (
              <View style={[styles.card, isOverdue && styles.cardOverdue]}>
                <TouchableOpacity
                  style={styles.cardHeaderRow}
                  activeOpacity={0.85}
                  onPress={() => handleOpenEdit(item)}
                >
                  <TouchableOpacity
                    style={styles.checkCircleBtn}
                    onPress={() => handleToggleComplete(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={item.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={item.is_completed ? '#10B981' : '#94A3B8'}
                    />
                  </TouchableOpacity>

                  <View style={styles.cardHeaderCenter}>
                    <View style={styles.nameRow}>
                      <Text style={styles.typeBadgeText} numberOfLines={1}>
                        {isTask ? '🏷️ GROUP TASK' : `👤 ${contact?.Name || 'Contact'}`}
                      </Text>
                      {contact?.Tags && !isTask && (
                        <Text style={styles.contactTagSub} numberOfLines={1}>
                          ({contact.Tags.split(',')[0].trim()})
                        </Text>
                      )}
                    </View>
                  </View>

                  <View
                    style={[
                      styles.dueBadge,
                      isOverdue && styles.dueBadgeOverdue,
                      isToday && styles.dueBadgeToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dueBadgeText,
                        isOverdue && styles.dueBadgeTextOverdue,
                        isToday && styles.dueBadgeTextToday,
                      ]}
                    >
                      {isOverdue ? 'Overdue' : isToday ? 'Today' : formatToDDMMYYYY(item.due_date)}
                      {item.due_time ? ` · ${item.due_time}` : ''}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleDeleteFollowup(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    style={{ marginLeft: 6 }}
                  >
                    <Ionicons name="trash-outline" size={17} color="#94A3B8" />
                  </TouchableOpacity>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.9} onPress={() => handleOpenEdit(item)}>
                  {renderFormattedNotePreview(item.note)}
                </TouchableOpacity>

                {isTask && (
                  <View style={styles.taskCohortContainer}>
                    {validCardTags.length > 0 && (
                      <View style={styles.tagsRow}>
                        {validCardTags.map((tg, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={styles.taskTagPill}
                            onPress={() => handleNavigateWithTag(tg)}
                          >
                            <Ionicons name="pricetag-outline" size={10} color="#2563EB" />
                            <Text style={styles.taskTagPillText}>#{tg}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.taskToggleRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}
                        onPress={() => toggleTaskDrawer(item.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.taskProgressText}>
                          👥 Target Contacts: {targetContacts.length} (
                          {item.completed_contact_ids?.length || 0}/{targetContacts.length} Done)
                        </Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="#2563EB"
                        />
                      </TouchableOpacity>

                      {targetContacts.length > 0 &&
                        (item.completed_contact_ids?.length || 0) < targetContacts.length && (
                          <TouchableOpacity
                            style={styles.markAllBtn}
                            onPress={() => handleMarkAllTaskComplete(item, targetContacts)}
                          >
                            <Ionicons name="checkmark-done" size={12} color="#10B981" />
                            <Text style={styles.markAllBtnText}>Mark All Done</Text>
                          </TouchableOpacity>
                        )}
                    </View>

                    {isExpanded && (
                      <View style={styles.checklistBlock}>
                        {targetContacts.length === 0 ? (
                          <Text style={styles.emptyChecklistText}>
                            No contacts linked or mentioned in this task.
                          </Text>
                        ) : (
                          targetContacts.map((tc, tcIdx) => {
                            const isDone = completedIdsSet.has(tc.id);
                            return (
                              <View key={tc.id} style={styles.checklistItemRow}>
                                <TouchableOpacity
                                  style={styles.checkItemClickableArea}
                                  activeOpacity={0.7}
                                  onPress={() => handleToggleTaskContact(item, tc.id)}
                                >
                                  <Ionicons
                                    name={isDone ? 'checkbox' : 'square-outline'}
                                    size={20}
                                    color={isDone ? '#10B981' : '#64748B'}
                                    style={{ marginRight: 8 }}
                                  />
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={[
                                        styles.checklistNameText,
                                        isDone && styles.checklistNameDone,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {tcIdx + 1}. {tc.Name}
                                    </Text>
                                    <Text style={styles.checklistPhoneText}>{tc.Phonenumber}</Text>
                                  </View>
                                </TouchableOpacity>

                                <View style={styles.checklistActions}>
                                  <TouchableOpacity
                                    style={[styles.smallIconBtn, { backgroundColor: '#25D366' }]}
                                    onPress={() => handleWhatsApp(tc.Phonenumber)}
                                  >
                                    <Ionicons name="logo-whatsapp" size={14} color="#FFFFFF" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.smallIconBtn, { backgroundColor: '#2563EB' }]}
                                    onPress={() => handleCall(tc.Phonenumber)}
                                  >
                                    <Ionicons name="call" size={13} color="#FFFFFF" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    )}
                  </View>
                )}

                {!isTask && targetContacts.length > 0 && (
                  <View style={styles.taskCohortContainer}>
                    <View style={styles.taskToggleRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}
                        onPress={() => toggleTaskDrawer(item.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.taskProgressText}>
                          👤 Target Contact: {targetContacts.length} (
                          {item.completed_contact_ids?.length || 0}/{targetContacts.length} Done)
                        </Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="#2563EB"
                        />
                      </TouchableOpacity>
                    </View>

                    {isExpanded && (
                      <View style={styles.checklistBlock}>
                        {targetContacts.map((tc, tcIdx) => {
                          const isDone = completedIdsSet.has(tc.id);
                          return (
                            <View key={tc.id} style={styles.checklistItemRow}>
                              <TouchableOpacity
                                style={styles.checkItemClickableArea}
                                activeOpacity={0.7}
                                onPress={() => handleToggleTaskContact(item, tc.id)}
                              >
                                <Ionicons
                                  name={isDone ? 'checkbox' : 'square-outline'}
                                  size={20}
                                  color={isDone ? '#10B981' : '#64748B'}
                                  style={{ marginRight: 8 }}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={[
                                      styles.checklistNameText,
                                      isDone && styles.checklistNameDone,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {tcIdx + 1}. {tc.Name}
                                  </Text>
                                  <Text style={styles.checklistPhoneText}>{tc.Phonenumber}</Text>
                                </View>
                              </TouchableOpacity>

                              <View style={styles.checklistActions}>
                                <TouchableOpacity
                                  style={[styles.smallIconBtn, { backgroundColor: '#25D366' }]}
                                  onPress={() => handleWhatsApp(tc.Phonenumber)}
                                >
                                  <Ionicons name="logo-whatsapp" size={14} color="#FFFFFF" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.smallIconBtn, { backgroundColor: '#2563EB' }]}
                                  onPress={() => handleCall(tc.Phonenumber)}
                                >
                                  <Ionicons name="call" size={13} color="#FFFFFF" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}

                {!isTask && contact && targetContacts.length === 0 && (
                  <View style={styles.cardFooterActions}>
                    <TouchableOpacity
                      style={styles.cardActionChip}
                      onPress={() => handleWhatsApp(contact.Phonenumber)}
                    >
                      <Ionicons name="logo-whatsapp" size={15} color="#25D366" />
                      <Text style={styles.cardActionChipText}>WhatsApp</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cardActionChip}
                      onPress={() => handleCall(contact.Phonenumber)}
                    >
                      <Ionicons name="call" size={14} color="#2563EB" />
                      <Text style={styles.cardActionChipText}>Call</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cardActionChip}
                      onPress={() =>
                        navigation.navigate('EditContact', { id: contact.id, userPhone })
                      }
                    >
                      <Ionicons name="person-outline" size={14} color="#475569" />
                      <Text style={styles.cardActionChipText}>View Contact</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={36} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No pending follow-ups</Text>
              <Text style={styles.emptySubtext}>
                Tap the "+ Add" button to schedule your first reminder or group task.
              </Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.completedAccordionContainer}>
              <View style={styles.completedAccordionHeaderRow}>
                <TouchableOpacity
                  style={styles.completedAccordionToggle}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setIsCompletedExpanded((prev) => !prev);
                  }}
                >
                  <Text style={styles.completedAccordionTitle}>
                    {activeFilterContactId
                      ? `Completed History (${counts.completed})`
                      : `Completed (${counts.completed})`}
                  </Text>
                  <Ionicons
                    name={isCompletedExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="#64748B"
                  />
                </TouchableOpacity>

                <View style={styles.completedHeaderActions}>
                  {completedFollowups.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearCompletedHeaderBtn}
                      onPress={handleClearAllCompleted}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <Ionicons name="trash-outline" size={13} color="#EF4444" />
                      <Text style={styles.clearCompletedHeaderText}>Clear</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.completedFilterTrigger}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setIsCompletedFilterModalVisible(true);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="filter" size={12} color="#2563EB" />
                    <Text style={styles.completedFilterTriggerText}>
                      Filter: {COMPLETED_FILTERS.find((f) => f.key === completedFilter)?.label} ▾
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* DATE-WISE GROUPED COMPLETED HISTORY VIEW */}
              {isCompletedExpanded && (
                <View style={{ gap: 12, marginTop: 10 }}>
                  {groupedCompletedFollowups.length === 0 ? (
                    <View style={styles.emptyCompletedBox}>
                      <Ionicons name="checkmark-done-circle-outline" size={26} color="#94A3B8" />
                      <Text style={styles.emptyCompletedText}>
                        No completed follow-ups found for this filter.
                      </Text>
                    </View>
                  ) : (
                    groupedCompletedFollowups.map((group, gIdx) => (
                      <View key={gIdx} style={styles.dateGroupBlock}>
                        <View style={styles.dateGroupHeaderRow}>
                          <Text style={styles.dateGroupTitle}>{group.title}</Text>
                          <Text style={styles.dateGroupSubtitle}>{group.subtitle}</Text>
                        </View>

                        <View style={{ gap: 8, marginTop: 6 }}>
                          {group.data.map((cItem) => {
                            const cContact = cItem.contact_id ? contactsMap.get(cItem.contact_id) : null;
                            return (
                              <TouchableOpacity
                                key={cItem.id}
                                style={styles.completedCard}
                                activeOpacity={0.8}
                                onPress={() => handleOpenView(cItem)}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.completedTypeSub}>
                                    {cItem.type === 'task'
                                      ? '🏷️ GROUP TASK'
                                      : `👤 ${cContact?.Name || 'Contact'}`}
                                  </Text>
                                  <Text style={styles.completedNoteText} numberOfLines={2}>
                                    {cItem.note}
                                  </Text>
                                  
                                </View>

                                <View style={styles.completedItemActions}>
                                  <TouchableOpacity
                                    style={styles.reopenBtn}
                                    onPress={() => handleConfirmUndo(cItem)}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                  >
                                    <Ionicons name="refresh" size={13} color="#2563EB" />
                                    <Text style={styles.reopenBtnText}>Undo</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={styles.deleteCompletedItemBtn}
                                    onPress={() => handleDeleteFollowup(cItem)}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                  >
                                    <Ionicons name="trash-outline" size={15} color="#94A3B8" />
                                  </TouchableOpacity>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          }
        />
      )}

      {/* Redesigned Centered Light Theme Toast */}
      {toastData && (
        <View style={styles.centeredToastBackdrop} pointerEvents="none">
          <Animated.View
            style={[
              styles.centeredToastCard,
              { opacity: toastOpacity, transform: [{ scale: toastScale }] },
            ]}
          >
            <View style={styles.toastSchedulePill}>
              <Ionicons name="calendar-outline" size={13} color="#2563EB" />
              <Text style={styles.toastScheduleText}>{toastData.schedule}</Text>
            </View>

            <View style={styles.toastTargetRow}>
              <Ionicons name="person-circle" size={20} color="#0F172A" />
              <Text style={styles.toastTargetText} numberOfLines={1}>
                {toastData.targetName}
              </Text>
            </View>

            <View style={styles.toastNoteSnippetBox}>
              <Text style={styles.toastNoteSnippetText} numberOfLines={2}>
                "{toastData.noteSnippet}"
              </Text>
            </View>
          </Animated.View>
        </View>
      )}

      {/* READ-ONLY VIEW MODAL FOR COMPLETED FOLLOW-UPS */}
      <Modal
        visible={Boolean(viewingItem)}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setViewingItem(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setViewingItem(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              <View style={styles.modalHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.modalTitle}>Completed Follow-up</Text>
                </View>
                <TouchableOpacity onPress={() => setViewingItem(null)}>
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.typeSelectorRow}>
                <View style={[styles.typeBtn, styles.typeBtnActive]}>
                  <Ionicons
                    name={viewingItem?.type === 'task' ? 'pricetags' : 'person'}
                    size={14}
                    color="#2563EB"
                  />
                  <Text style={[styles.typeBtnText, styles.typeBtnTextActive]}>
                    {viewingItem?.type === 'task' ? 'Group Task' : 'Single Person'}
                  </Text>
                </View>
              </View>

              {viewingItem?.type === 'contact' && viewingItem.contact_id && (
                <View style={styles.selectedContactBanner}>
                  <View style={styles.contactBannerLeft}>
                    <Ionicons name="person-circle" size={18} color="#2563EB" />
                    <Text style={styles.selectedContactBannerText} numberOfLines={1}>
                      Contact:{' '}
                      <Text style={{ fontWeight: '700', color: '#0F172A' }}>
                        {contactsMap.get(viewingItem.contact_id)?.Name || 'Contact'}
                      </Text>
                    </Text>
                  </View>
                </View>
              )}

              {viewingItem?.linked_contact_ids && viewingItem.linked_contact_ids.length > 0 && (
                <View style={styles.contactSelectorSection}>
                  <Text style={styles.selectorLabel}>Linked Contacts ({viewingItem.linked_contact_ids.length}):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {viewingItem.linked_contact_ids.map((id) => {
                      const c = contactsMap.get(id);
                      if (!c) return null;
                      return (
                        <View key={c.id} style={[styles.contactPickerChip, styles.contactPickerChipActive]}>
                          <Ionicons name="person-circle" size={14} color="#FFFFFF" />
                          <Text style={[styles.contactPickerChipText, styles.contactPickerChipTextActive]} numberOfLines={1}>
                            {c.Name}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {viewingItem?.target_tags && viewingItem.target_tags.length > 0 && (
                <View style={styles.contactSelectorSection}>
                  <Text style={styles.selectorLabel}>Linked Tags ({viewingItem.target_tags.length}):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {viewingItem.target_tags.map((tg, idx) => (
                      <View key={idx} style={[styles.contactPickerChip, styles.contactPickerChipActive]}>
                        <Ionicons name="pricetag-outline" size={13} color="#FFFFFF" />
                        <Text style={[styles.contactPickerChipText, styles.contactPickerChipTextActive]} numberOfLines={1}>
                          #{tg}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              <Text style={styles.fieldLabel}>Note:</Text>
              <View style={[styles.noteBoxWrapper, { backgroundColor: '#F8FAFC' }]}>
                <Text style={[styles.noteModalInput, { color: '#0F172A', minHeight: 60 }]}>
                  {viewingItem?.note}
                </Text>
              </View>

              <Text style={styles.fieldLabel}>Scheduled Due Date:</Text>
              <View style={[styles.dateInputRow, { backgroundColor: '#F8FAFC' }]}>
                <Ionicons name="calendar" size={17} color="#2563EB" />
                <Text style={styles.dateInputText}>{formatToDDMMYYYY(viewingItem?.due_date || '')}</Text>
                {viewingItem?.due_time && (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>
                    {viewingItem.due_time}
                  </Text>
                )}
              </View>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn, { flex: 1 }]}
                  onPress={() => setViewingItem(null)}
                >
                  <Text style={styles.modalCancelText}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create / Edit Follow-up Modal */}
      <Modal
        visible={isCreateModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsCreateModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>
                  {editingItem ? 'Edit Follow-up' : 'New Follow-up'}
                </Text>
                <TouchableOpacity onPress={() => setIsCreateModalVisible(false)}>
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, createType === 'contact' && styles.typeBtnActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setCreateType('contact');
                  }}
                >
                  <Ionicons
                    name="person"
                    size={14}
                    color={createType === 'contact' ? '#2563EB' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.typeBtnText,
                      createType === 'contact' && styles.typeBtnTextActive,
                    ]}
                  >
                    Single Person
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.typeBtn, createType === 'task' && styles.typeBtnActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setCreateType('task');
                  }}
                >
                  <Ionicons
                    name="pricetags"
                    size={14}
                    color={createType === 'task' ? '#2563EB' : '#64748B'}
                  />
                  <Text
                    style={[styles.typeBtnText, createType === 'task' && styles.typeBtnTextActive]}
                  >
                    Task (Contacts/Tags)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* SINGLE PERSON TAB: Display selected contact banner */}
              {createType === 'contact' && selectedContact && (
                <View style={styles.selectedContactBanner}>
                  <View style={styles.contactBannerLeft}>
                    <Ionicons name="person-circle" size={18} color="#2563EB" />
                    <Text style={styles.selectedContactBannerText} numberOfLines={1}>
                      Contact:{' '}
                      <Text style={{ fontWeight: '700', color: '#0F172A' }}>
                        {selectedContact.Name}
                      </Text>
                      {selectedContact.Tags ? ` (${selectedContact.Tags.split(',')[0].trim()})` : ''}
                    </Text>
                  </View>
                </View>
              )}

              {/* SHARED: Linked Contacts card in both tabs allowing user to pick/manage mentioned contacts */}
              {boundContacts.length > 0 && (
                <View style={styles.contactSelectorSection}>
                  <Text style={styles.selectorLabel}>
                    {createType === 'contact' ? 'Select Contact from Note:' : `Linked Contacts (${boundContacts.length}):`}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginTop: 4 }}>
                    {boundContacts.map((c) => {
                      const isChosen = createType === 'contact' && selectedContact?.id === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.contactPickerChip, isChosen && styles.contactPickerChipActive]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            if (createType === 'contact') {
                              setSelectedContact(isChosen ? null : c);
                            }
                          }}
                        >
                          <Ionicons
                            name="person-circle"
                            size={14}
                            color={isChosen ? '#FFFFFF' : '#2563EB'}
                          />
                          <Text
                            style={[
                              styles.contactPickerChipText,
                              isChosen && styles.contactPickerChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {c.Name}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleRemoveBoundContact(c.id)}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            style={{ marginLeft: 4 }}
                          >
                            <Ionicons
                              name="close-circle"
                              size={14}
                              color={isChosen ? '#FFFFFF' : '#64748B'}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* SHARED: Linked Tags card */}
              {boundTags.length > 0 && (
                <View style={styles.contactSelectorSection}>
                  <Text style={styles.selectorLabel}>Linked Tags ({boundTags.length}):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginTop: 4 }}>
                    {boundTags.map((tg) => (
                      <View key={tg} style={styles.contactPickerChip}>
                        <Ionicons name="pricetag-outline" size={13} color="#059669" />
                        <Text style={styles.contactPickerChipText} numberOfLines={1}>
                          #{tg}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleRemoveBoundTag(tg)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          style={{ marginLeft: 4 }}
                        >
                          <Ionicons name="close-circle" size={14} color="#64748B" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.helperBar}>
                <Text style={styles.helperHint}>Shortcuts:</Text>
                <TouchableOpacity
                  style={styles.helperChip}
                  onPress={() => handleInsertHelper('@')}
                >
                  <Text style={styles.helperChipText}>@ Mention Contact</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.helperChip}
                  onPress={() => handleInsertHelper('#')}
                >
                  <Text style={styles.helperChipText}># Add Tag</Text>
                </TouchableOpacity>

                <View style={{ flex: 1 }} />

                {(noteText.length > 0 || boundContacts.length > 0 || boundTags.length > 0) && (
                  <TouchableOpacity
                    style={styles.clearNoteBtn}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setNoteText('');
                      setBoundContacts([]);
                      setBoundTags([]);
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="close-circle-outline" size={13} color="#EF4444" />
                    <Text style={styles.clearNoteBtnText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Clean Note Input Box (No inner chips) */}
              <View style={styles.noteBoxWrapper}>
                <TextInput
                  ref={noteInputRef}
                  style={[styles.noteModalInput, { minHeight: Math.max(60, noteInputHeight) }]}
                  multiline
                  placeholder="Type note... use @ to mention contacts, # to add tags"
                  placeholderTextColor="#94A3B8"
                  value={noteText}
                  onContentSizeChange={(e) => {
                    setNoteInputHeight(e.nativeEvent.contentSize.height + 8);
                  }}
                  onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                  onChangeText={handleNoteTextChange}
                />
              </View>

              {suggestionMode && (
                <View style={styles.suggestionsContainer}>
                  <ScrollView
                    horizontal
                    keyboardShouldPersistTaps="always"
                    showsHorizontalScrollIndicator={false}
                  >
                    {suggestionMode === 'contact' &&
                      allContacts
                        .filter((c) => c.Name.toLowerCase().includes(suggestionQuery))
                        .slice(0, 8)
                        .map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            style={styles.sugChip}
                            onPress={() => handleSelectContactSuggestion(c)}
                          >
                            <Ionicons name="person-circle-outline" size={14} color="#2563EB" />
                            <Text style={styles.sugChipText}>{c.Name}</Text>
                          </TouchableOpacity>
                        ))}

                    {suggestionMode === 'tag' &&
                      availableTags
                        .filter((t) => t.toLowerCase().includes(suggestionQuery))
                        .slice(0, 8)
                        .map((tg, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={styles.sugChip}
                            onPress={() => handleSelectTagSuggestion(tg)}
                          >
                            <Ionicons name="pricetag-outline" size={12} color="#2563EB" />
                            <Text style={styles.sugChipText}>#{tg}</Text>
                          </TouchableOpacity>
                        ))}
                  </ScrollView>
                </View>
              )}

              <Text style={styles.fieldLabel}>Due Date:</Text>
              <View style={styles.quickDateRow}>
                {[
                  { label: 'Today', offset: 0, dateKey: presetDates.today },
                  { label: 'Tomorrow', offset: 1, dateKey: presetDates.tomorrow },
                  { label: 'In 3 Days', offset: 3, dateKey: presetDates.in3Days },
                  { label: 'Next Week', offset: 7, dateKey: presetDates.nextWeek },
                ].map((p, idx) => {
                  const isHighlighted = dueDate === p.dateKey;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.quickDateChip, isHighlighted && styles.quickDateChipHighlighted]}
                      onPress={() => setQuickDate(p.offset)}
                    >
                      <Text
                        style={[
                          styles.quickDateChipText,
                          isHighlighted && styles.quickDateChipTextHighlighted,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.dateInputRow}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const currentSelected = new Date(dueDate);
                  if (!isNaN(currentSelected.getTime())) {
                    setCalendarViewDate(currentSelected);
                  }
                  setIsCalendarPickerVisible(true);
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="calendar" size={17} color="#2563EB" />
                <Text style={styles.dateInputText}>{formatToDDMMYYYY(dueDate)}</Text>
                <Text style={styles.calendarPickAction}>Pick Calendar ▾</Text>
              </TouchableOpacity>

              <View style={styles.timeSectionHeaderRow}>
                <Text style={styles.fieldLabel}>Reminder Time (Optional):</Text>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setIsTimeEnabled((prev) => !prev);
                  }}
                >
                  <Text style={styles.timeToggleActionText}>
                    {isTimeEnabled ? 'Remove Time' : '+ Add Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              {isTimeEnabled && (
                <View style={styles.wheelTimePickerCard}>
                  <View style={styles.wheelPickerRow}>
                    <View style={styles.wheelColumnWrapper}>
                      <Text style={styles.wheelColumnTitle}>HOUR</Text>
                      <ScrollView
                        ref={hourScrollRef}
                        style={styles.wheelScrollView}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled={true}
                      >
                        {HOURS.map((h) => {
                          const isSel = timeHour === h;
                          return (
                            <TouchableOpacity
                              key={h}
                              style={[styles.wheelItem, isSel && styles.wheelItemSelected]}
                              onPress={() => {
                                Haptics.selectionAsync().catch(() => {});
                                setTimeHour(h);
                              }}
                            >
                              <Text style={[styles.wheelItemText, isSel && styles.wheelItemTextSelected]}>
                                {h}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>

                    <Text style={styles.wheelSeparator}>:</Text>

                    <View style={styles.wheelColumnWrapper}>
                      <Text style={styles.wheelColumnTitle}>MIN</Text>
                      <ScrollView
                        ref={minuteScrollRef}
                        style={styles.wheelScrollView}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled={true}
                      >
                        {MINUTES.map((m) => {
                          const isSel = timeMinute === m;
                          return (
                            <TouchableOpacity
                              key={m}
                              style={[styles.wheelItem, isSel && styles.wheelItemSelected]}
                              onPress={() => {
                                Haptics.selectionAsync().catch(() => {});
                                setTimeMinute(m);
                              }}
                            >
                              <Text style={[styles.wheelItemText, isSel && styles.wheelItemTextSelected]}>
                                {m}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>

                    <View style={styles.meridianWheelWrapper}>
                      <Text style={styles.wheelColumnTitle}>AM / PM</Text>
                      <View style={styles.meridianToggleBox}>
                        <TouchableOpacity
                          style={[styles.meridianToggleBtn, timePeriod === 'AM' && styles.meridianToggleBtnActive]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setTimePeriod('AM');
                          }}
                        >
                          <Text style={[styles.meridianToggleText, timePeriod === 'AM' && styles.meridianToggleTextActive]}>
                            AM
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.meridianToggleBtn, timePeriod === 'PM' && styles.meridianToggleBtnActive]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setTimePeriod('PM');
                          }}
                        >
                          <Text style={[styles.meridianToggleText, timePeriod === 'PM' && styles.meridianToggleTextActive]}>
                            PM
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.timePreviewBadge}>
                    <Ionicons name="time" size={13} color="#2563EB" />
                    <Text style={styles.timePreviewBadgeText}>
                      Selected: {timeHour}:{timeMinute} {timePeriod}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setIsCreateModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalSubmitBtn]}
                  onPress={handleSaveFollowup}
                >
                  <Text style={styles.modalSubmitText}>
                    {editingItem ? 'Update Follow-up' : 'Save Follow-up'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Interactive Calendar Modal Grid */}
      <Modal
        visible={isCalendarPickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCalendarPickerVisible(false)}
      >
        <Pressable
          style={styles.calendarModalOverlay}
          onPress={() => setIsCalendarPickerVisible(false)}
        >
          <Pressable style={styles.calendarCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const d = new Date(calendarViewDate);
                  d.setMonth(d.getMonth() - 1);
                  setCalendarViewDate(d);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={20} color="#0F172A" />
              </TouchableOpacity>

              <Text style={styles.calendarMonthTitle}>
                {calendarViewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const d = new Date(calendarViewDate);
                  d.setMonth(d.getMonth() + 1);
                  setCalendarViewDate(d);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-forward" size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={styles.dayNamesRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <Text key={d} style={styles.dayNameText}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.dayCell} />;
                }

                const y = calendarViewDate.getFullYear();
                const m = String(calendarViewDate.getMonth() + 1).padStart(2, '0');
                const dStr = String(day).padStart(2, '0');
                const fullDateStr = `${y}-${m}-${dStr}`;
                const isSelected = dueDate === fullDateStr;

                return (
                  <TouchableOpacity
                    key={`day-${day}`}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                    onPress={() => handleSelectCalendarDay(day)}
                  >
                    <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.calendarCloseBtn}
              onPress={() => setIsCalendarPickerVisible(false)}
            >
              <Text style={styles.calendarCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Completed History Vertical Filter Modal */}
      <Modal
        visible={isCompletedFilterModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCompletedFilterModalVisible(false)}
      >
        <Pressable
          style={styles.filterModalOverlay}
          onPress={() => setIsCompletedFilterModalVisible(false)}
        >
          <Pressable style={styles.filterModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filter</Text>
              <TouchableOpacity onPress={() => setIsCompletedFilterModalVisible(false)}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {COMPLETED_FILTERS.map((fItem) => {
                const isSelected = completedFilter === fItem.key;
                return (
                  <TouchableOpacity
                    key={fItem.key}
                    style={[styles.filterOptionRow, isSelected && styles.filterOptionRowSelected]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setCompletedFilter(fItem.key);
                      setIsCompletedFilterModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.filterOptionLabel,
                        isSelected && styles.filterOptionLabelSelected,
                      ]}
                    >
                      {fItem.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color="#2563EB" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
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
  },
  badgeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
    marginTop: 4,
  },
  addHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  addHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  searchInput: { flex: 1, height: 40, fontSize: 13.5, color: '#0F172A' },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 8,
  },
  tabChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  tabChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  tabChipOverdue: {
    borderColor: '#FCA5A5',
  },
  tabChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  tabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
  },
  cardOverdue: {
    borderLeftWidth: 3.5,
    borderLeftColor: '#EF4444',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderCenter: {
    flex: 1,
    marginRight: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  checkCircleBtn: {
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  contactTagSub: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 1,
  },
  dueBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  dueBadgeOverdue: {
    backgroundColor: '#FEF2F2',
  },
  dueBadgeToday: {
    backgroundColor: '#FFFBEB',
  },
  dueBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  dueBadgeTextOverdue: {
    color: '#DC2626',
  },
  dueBadgeTextToday: {
    color: '#D97706',
  },
  noteText: {
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 6,
  },
  noteProseText: {
    color: '#0F172A',
    fontWeight: '400',
  },
  noteMentionHighlight: {
    fontWeight: '700',
    color: '#1D4ED8',
    backgroundColor: '#EEF2FF',
  },
  noteTagHighlight: {
    fontWeight: '700',
    color: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  taskCohortContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  taskTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  taskTagPillText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
  },
  taskToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  taskProgressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  markAllBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  checklistBlock: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 6,
    gap: 6,
  },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  checkItemClickableArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  checklistNameText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  checklistNameDone: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },
  checklistPhoneText: {
    fontSize: 11,
    color: '#64748B',
  },
  checklistActions: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 6,
  },
  smallIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChecklistText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  cardFooterActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cardActionChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  completedAccordionContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  completedAccordionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  completedAccordionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  completedAccordionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  completedHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clearCompletedHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#FCA5A5',
  },
  clearCompletedHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  completedFilterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  completedFilterTriggerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  emptyCompletedBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyCompletedText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  dateGroupBlock: {
    marginTop: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateGroupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dateGroupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    textTransform: 'uppercase',
  },
  dateGroupSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  completedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  completedTypeSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 2,
  },
  completedNoteText: {
    fontSize: 12.5,
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  completedDateSub: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  completedItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 6,
  },
  reopenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
  },
  reopenBtnText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
  },
  deleteCompletedItemBtn: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 12.5,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 4,
  },
  centeredToastBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  centeredToastCard: {
    width: '82%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    borderWidth: 1.5,
    borderColor: '#DBEAFE',
  },
  toastSchedulePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 8,
  },
  toastScheduleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  toastTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  toastTargetText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  toastNoteSnippetBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toastNoteSnippetText: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: '90%',
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  typeBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  typeBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  typeBtnTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  selectedContactBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 8,
  },
  contactBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  selectedContactBannerText: {
    fontSize: 12.5,
    color: '#1E293B',
    flex: 1,
  },
  contactSelectorSection: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  selectorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  contactPickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 6,
    marginRight: 6,
  },
  contactPickerChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  contactPickerChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  contactPickerChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  helperBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  helperHint: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  helperChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#BFDBFE',
  },
  helperChipText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
  },
  clearNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FEF2F2',
    borderWidth: 0.5,
    borderColor: '#FECACA',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  clearNoteBtnText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '700',
  },
  noteBoxWrapper: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    padding: 8,
    marginBottom: 8,
  },
  inlineChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  inlineContactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  inlineContactChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  inlineTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  inlineTagChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  noteModalInput: {
    fontSize: 14,
    color: '#0F172A',
    textAlignVertical: 'top',
    padding: 0,
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 6,
    marginBottom: 10,
  },
  sugChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  sugChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  quickDateChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
  },
  quickDateChipHighlighted: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  quickDateChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickDateChipTextHighlighted: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  dateInputText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginLeft: 8,
  },
  calendarPickAction: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '700',
  },
  timeSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeToggleActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  wheelTimePickerCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  wheelPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  wheelColumnWrapper: {
    alignItems: 'center',
  },
  wheelColumnTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  wheelScrollView: {
    height: 100,
    width: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemSelected: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
  },
  wheelItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  wheelItemTextSelected: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563EB',
  },
  wheelSeparator: {
    fontSize: 22,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 14,
  },
  meridianWheelWrapper: {
    alignItems: 'center',
  },
  meridianToggleBox: {
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 3,
    gap: 4,
    marginTop: 2,
  },
  meridianToggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  meridianToggleBtnActive: {
    backgroundColor: '#2563EB',
  },
  meridianToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  meridianToggleTextActive: {
    color: '#FFFFFF',
  },
  timePreviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  timePreviewBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
  },
  modalSubmitBtn: {
    backgroundColor: '#2563EB',
  },
  modalSubmitText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  calendarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  calendarCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    elevation: 8,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  dayNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 6,
    marginBottom: 8,
  },
  dayNameText: {
    width: 38,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    borderRadius: 19,
  },
  dayCellSelected: {
    backgroundColor: '#2563EB',
  },
  dayCellText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calendarCloseBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  calendarCloseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  filterModalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 6,
  },
  filterModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  filterOptionRowSelected: {
    backgroundColor: '#EFF6FF',
  },
  filterOptionLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
  },
  filterOptionLabelSelected: {
    color: '#2563EB',
    fontWeight: '800',
  },
});
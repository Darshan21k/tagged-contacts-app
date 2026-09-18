import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Keyboard,
  Animated,
  RefreshControl,
  BackHandler,
  Modal,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { supabase } from '../services/supabase';
import { Contact } from '../types';

interface ContactCardProps {
  item: Contact;
  isSelectionMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onCall: (phone: string) => void;
  onWhatsApp: (phone: string) => void;
  onDelete: (contact: Contact) => void;
  onTagPress: (tag: string) => void;
  onCopyPhone: (phone: string) => void;
  onToggleStar: (contact: Contact) => void;
  searchQuery: string;
  onSwipeOpen: (ref: Swipeable) => void;
}

const ContactCard = React.memo(
  ({
    item,
    isSelectionMode,
    isSelected,
    onPress,
    onLongPress,
    onCall,
    onWhatsApp,
    onDelete,
    onTagPress,
    onCopyPhone,
    onToggleStar,
    searchQuery,
    onSwipeOpen,
  }: ContactCardProps) => {
    const isStarred = Boolean(item.is_starred);
    const swipeableRef = useRef<Swipeable>(null);

    const tagList = useMemo(() => {
      return item.Tags
        ? item.Tags.split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .sort((a, b) => a.length - b.length || a.localeCompare(b))
        : [];
    }, [item.Tags]);

    const isNotesMatchOnly = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return false;

      const terms = q.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
      if (terms.length === 0) return false;

      const contactName = (item.Name || '').toLowerCase();
      const contactPhone = item.Phonenumber || '';
      const contactTags = (item.Tags || '').toLowerCase();
      const contactDetails = (item.OtherDetails || '').toLowerCase();

      const fullMatch = terms.every(
        (t) =>
          contactName.includes(t) ||
          contactPhone.includes(t) ||
          contactTags.includes(t) ||
          contactDetails.includes(t)
      );

      const matchedPrimaries = terms.every(
        (t) =>
          contactName.includes(t) ||
          contactPhone.includes(t) ||
          contactTags.includes(t)
      );

      return fullMatch && !matchedPrimaries && contactDetails.length > 0;
    }, [searchQuery, item.Name, item.Phonenumber, item.Tags, item.OtherDetails]);

    // Right action (Swipe Left): Delete
    const renderRightActions = (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
      if (isSelectionMode) return null;
      const trans = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [0, 80],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View style={[styles.rightSwipeActionsContainer, { transform: [{ translateX: trans }] }]}>
          <TouchableOpacity
            style={[styles.swipeActionBtn, styles.deleteSwipeBtn]}
            onPress={() => {
              swipeableRef.current?.close();
              onDelete(item);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="trash" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

    // Left action (Swipe Right): Call
    const renderLeftActions = (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
      if (isSelectionMode) return null;
      const trans = dragX.interpolate({
        inputRange: [0, 80],
        outputRange: [-80, 0],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View style={[styles.leftSwipeActionsContainer, { transform: [{ translateX: trans }] }]}>
          <TouchableOpacity
            style={[styles.swipeActionBtn, styles.callSwipeBtn]}
            onPress={() => {
              swipeableRef.current?.close();
              onCall(item.Phonenumber);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="call" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText}>Call</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

    return (
      <View style={styles.swipeableWrapper}>
        <Swipeable
          ref={swipeableRef}
          friction={2}
          enabled={!isSelectionMode}
          overshootRight={false}
          overshootLeft={false}
          renderRightActions={renderRightActions}
          renderLeftActions={renderLeftActions}
          onSwipeableWillOpen={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (swipeableRef.current) {
              onSwipeOpen(swipeableRef.current);
            }
          }}
        >
          <TouchableOpacity
            style={[styles.card, isSelected && styles.cardSelected]}
            activeOpacity={0.85}
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={260}
          >
            <View style={styles.cardHeaderRow}>
              {/* Checkbox for Batch Mode */}
              {isSelectionMode && (
                <View style={styles.checkboxContainer}>
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isSelected ? '#2563EB' : '#94A3B8'}
                  />
                </View>
              )}

              <View style={styles.headerInfo}>
                <View style={styles.nameRow}>
                  {!isSelectionMode && (
                    <TouchableOpacity
                      onPress={() => onToggleStar(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isStarred ? 'star' : 'star-outline'}
                        size={18}
                        color={isStarred ? '#F59E0B' : '#94A3B8'}
                      />
                    </TouchableOpacity>
                  )}

                  <Text style={styles.nameText} numberOfLines={1}>
                    {item.Name}
                  </Text>

                  {isNotesMatchOnly && (
                    <View style={styles.noteMatchBadge}>
                      <Ionicons name="document-text" size={11} color="#B45309" />
                      <Text style={styles.noteMatchBadgeText}>Found in Note</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.phoneChipTouchable}
                  onPress={() => onCopyPhone(item.Phonenumber)}
                  activeOpacity={0.6}
                  disabled={isSelectionMode}
                >
                  <View style={styles.phoneRow}>
                    <Ionicons name="call-outline" size={15} color="#2563EB" />
                    <Text style={styles.phoneText}>{item.Phonenumber}</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {!isSelectionMode && (
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.iconButton, styles.whatsappButton]}
                    onPress={() => onWhatsApp(item.Phonenumber)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.iconButton, styles.callButton]}
                    onPress={() => onCall(item.Phonenumber)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="call" size={17} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {tagList.length > 0 && (
              <View style={styles.tagContainer}>
                {tagList.map((tag, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.tagPill}
                    activeOpacity={0.7}
                    onPress={() => onTagPress(tag)}
                    disabled={isSelectionMode}
                  >
                    <Ionicons name="pricetag-outline" size={11} color="#2563EB" style={{ marginRight: 3 }} />
                    <Text style={styles.tagText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {item.OtherDetails ? (
              <View style={[styles.notesContainer, isNotesMatchOnly && styles.notesContainerHighlighted]}>
                {isNotesMatchOnly && (
                  <Ionicons name="return-down-forward" size={13} color="#D97706" style={styles.noteIconShift} />
                )}
                <Text
                  style={[styles.detailsText, isNotesMatchOnly && styles.detailsTextHighlighted]}
                  numberOfLines={isNotesMatchOnly ? 3 : 2}
                >
                  {item.OtherDetails}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </Swipeable>
      </View>
    );
  }
);

export default function ContactsScreen({ navigation, route }: any) {
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [pinnedTags, setPinnedTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isStarredFilterActive, setIsStarredFilterActive] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userPhone, setUserPhone] = useState('9999999999');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Batch Multi-Select Mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());

  // Bulk Add Tag Modal State with Chip Support & Auto-Suggest
  const [isTagModalVisible, setIsTagModalVisible] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [stagedBulkTags, setStagedBulkTags] = useState<string[]>([]);

  // Bulk Remove Tag Draft Modal State
  const [isRemoveTagModalVisible, setIsRemoveTagModalVisible] = useState(false);
  const [originalUniqueTags, setOriginalUniqueTags] = useState<string[]>([]);
  const [activeDraftTags, setActiveDraftTags] = useState<string[]>([]);

  // Track currently open swipeable card ref to auto-close on scroll/tab press
  const openSwipeableRef = useRef<Swipeable | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchInputRef = useRef<TextInput>(null);
  const sectionListRef = useRef<SectionList<Contact>>(null);

  const closeActiveSwipeable = useCallback(() => {
    if (openSwipeableRef.current) {
      openSwipeableRef.current.close();
      openSwipeableRef.current = null;
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('user_phone').then((phone) => {
      if (phone) setUserPhone(phone);
    });
  }, []);

  // Set header title with app name and icon
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleContainer}>
          <Ionicons name="people-circle" size={24} color="#2563EB" />
          <Text style={styles.headerAppTitle}>ContactNow</Text>
        </View>
      ),
    });
  }, [navigation]);

  // Back button handling on Android: Exit modals / selection mode first
  useEffect(() => {
    const onBackPress = () => {
      if (isTagModalVisible) {
        setIsTagModalVisible(false);
        return true;
      }
      if (isRemoveTagModalVisible) {
        setIsRemoveTagModalVisible(false);
        return true;
      }
      if (isSelectionMode) {
        setIsSelectionMode(false);
        setSelectedContactIds(new Set());
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isSelectionMode, isTagModalVisible, isRemoveTagModalVisible]);

  useEffect(() => {
    if (route.params?.selectedTag !== undefined) {
      const chosenTag = route.params.selectedTag ? route.params.selectedTag.trim() : '';
      setSelectedTag(chosenTag || null);
      setIsStarredFilterActive(false);
      setSearchQuery(chosenTag);
      setShowSuggestions(false);
      navigation.setParams({ selectedTag: undefined });
    }
  }, [route.params?.selectedTag, navigation]);

  const showToast = useCallback(
    (message: string) => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToastMessage(message);
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();

      toastTimeoutRef.current = setTimeout(() => {
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setToastMessage(null));
      }, 2000);
    },
    [toastOpacity]
  );

  const fetchPinnedTags = useCallback(async (activePhone: string) => {
    try {
      const { data, error } = await supabase
        .from('PinnedTags')
        .select('Tagname')
        .eq('Userphonenumber', activePhone)
        .eq('Pinned', true);

      if (error) throw error;
      const rawTags = (data || []).map((item: { Tagname: string }) => item.Tagname);
      const sortedTags = rawTags.sort((a, b) => a.length - b.length || a.localeCompare(b));
      setPinnedTags(sortedTags);
    } catch (err: any) {
      console.warn('Failed to load pinned tags:', err.message);
    }
  }, []);

  const fetchContactsData = useCallback(async (phoneOverride?: string) => {
    try {
      const activePhone = phoneOverride || (await AsyncStorage.getItem('user_phone')) || userPhone;
      const { data, error } = await supabase
        .from('Contacts_Table')
        .select('*')
        .eq('Userphonenumber', activePhone)
        .order('Name', { ascending: true });

      if (error) throw error;
      setAllContacts(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch contacts');
    }
  }, [userPhone]);

  const handlePullRefresh = useCallback(async () => {
    if (isSelectionMode) return;
    closeActiveSwipeable();
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (searchQuery || selectedTag || isStarredFilterActive) {
      setSearchQuery('');
      setSelectedTag(null);
      setIsStarredFilterActive(false);
      setShowSuggestions(false);
      Keyboard.dismiss();
    }

    const storedPhone = await AsyncStorage.getItem('user_phone');
    const active = storedPhone || userPhone;
    await Promise.all([fetchPinnedTags(active), fetchContactsData(active)]);
    setRefreshing(false);
  }, [userPhone, isSelectionMode, searchQuery, selectedTag, isStarredFilterActive, fetchPinnedTags, fetchContactsData, closeActiveSwipeable]);

  const handleResetAndRefresh = useCallback(async () => {
    closeActiveSwipeable();
    setSearchQuery('');
    setSelectedTag(null);
    setIsStarredFilterActive(false);
    setIsSelectionMode(false);
    setSelectedContactIds(new Set());
    setShowSuggestions(false);
    Keyboard.dismiss();

    try {
      sectionListRef.current?.scrollToLocation({
        sectionIndex: 0,
        itemIndex: 0,
        viewOffset: 0,
        animated: true,
      });
    } catch {
      // Safe fallback
    }

    const storedPhone = await AsyncStorage.getItem('user_phone');
    const active = storedPhone || userPhone;
    setLoading(true);
    await Promise.all([fetchPinnedTags(active), fetchContactsData(active)]);
    setLoading(false);
  }, [userPhone, fetchPinnedTags, fetchContactsData, closeActiveSwipeable]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      closeActiveSwipeable();
      if (navigation.isFocused()) {
        handleResetAndRefresh();
      }
    });
    return unsubscribe;
  }, [navigation, handleResetAndRefresh, closeActiveSwipeable]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const run = async () => {
        const storedPhone = await AsyncStorage.getItem('user_phone');
        const active = storedPhone || userPhone;
        if (isMounted) {
          if (allContacts.length === 0) setLoading(true);
          await Promise.all([fetchPinnedTags(active), fetchContactsData(active)]);
          if (isMounted) setLoading(false);
        }
      };
      run();
      return () => {
        isMounted = false;
      };
    }, [userPhone, fetchPinnedTags, fetchContactsData, allContacts.length])
  );

  const handleToggleStar = useCallback(
    async (contact: Contact) => {
      const targetStarred = !contact.is_starred;
      await Haptics.selectionAsync();

      setAllContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? { ...c, is_starred: targetStarred } : c))
      );
      showToast(targetStarred ? `Starred ${contact.Name}` : `Removed from Starred`);

      try {
        const { error } = await supabase
          .from('Contacts_Table')
          .update({ is_starred: targetStarred })
          .eq('id', contact.id);

        if (error) throw error;
      } catch {
        setAllContacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, is_starred: !targetStarred } : c))
        );
        Alert.alert('Error', 'Failed to update favorite status. Please check your connection.');
      }
    },
    [showToast]
  );

  const handleDeleteContact = useCallback(
    (contact: Contact) => {
      Alert.alert('Delete Contact', `Are you sure you want to delete ${contact.Name}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setAllContacts((prev) => prev.filter((c) => c.id !== contact.id));
            showToast(`Deleted ${contact.Name}`);

            try {
              const { error } = await supabase.from('Contacts_Table').delete().eq('id', contact.id);
              if (error) throw error;
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete contact');
              const storedPhone = await AsyncStorage.getItem('user_phone');
              fetchContactsData(storedPhone || userPhone);
            }
          },
        },
      ]);
    },
    [showToast, userPhone, fetchContactsData]
  );

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of allContacts) {
      if (!c.Tags) continue;
      const tags = c.Tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      for (const t of tags) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return counts;
  }, [allContacts]);

  const totalStarredCount = useMemo(() => {
    return allContacts.filter((c) => c.is_starred).length;
  }, [allContacts]);

  const suggestions = useMemo(() => {
    const rawQuery = searchQuery.trim().toLowerCase();
    if (!rawQuery || !showSuggestions) return [];

    const nameMatches = new Set<string>();
    const tagMatches = new Set<string>();

    for (const contact of allContacts) {
      const name = (contact.Name || '').trim();
      if (name && name.toLowerCase().includes(rawQuery)) {
        nameMatches.add(name);
      }

      if (contact.Tags) {
        const splitTags = contact.Tags.split(',').map((t) => t.trim()).filter(Boolean);
        for (const t of splitTags) {
          if (t.toLowerCase().includes(rawQuery)) {
            tagMatches.add(t);
          }
        }
      }
    }

    const tagResults = Array.from(tagMatches).slice(0, 5).map((text) => ({ text, type: 'tag' as const }));
    const nameResults = Array.from(nameMatches).slice(0, 5).map((text) => ({ text, type: 'name' as const }));

    return [...tagResults, ...nameResults];
  }, [searchQuery, showSuggestions, allContacts]);

  // Bulk add tag auto-suggestions matching standard Add/Edit Contact behavior with original capitalization
  const bulkTagSuggestions = useMemo(() => {
    const q = bulkTagInput.trim().toLowerCase();
    if (!q) return [];
    
    const uniqueMap = new Map<string, string>();
    pinnedTags.forEach((pt) => uniqueMap.set(pt.toLowerCase(), pt));
    allContacts.forEach((c) => {
      if (c.Tags) {
        c.Tags.split(',').forEach((t) => {
          const clean = t.trim();
          if (clean) uniqueMap.set(clean.toLowerCase(), clean);
        });
      }
    });

    const matches: string[] = [];
    uniqueMap.forEach((orig, lower) => {
      if (lower.includes(q) && !stagedBulkTags.map((st) => st.toLowerCase()).includes(lower)) {
        matches.push(orig);
      }
    });

    return matches.slice(0, 5);
  }, [bulkTagInput, pinnedTags, allContacts, stagedBulkTags]);

  const filteredContacts = useMemo(() => {
    let result = allContacts;

    if (isStarredFilterActive) {
      result = result.filter((c) => Boolean(c.is_starred));
    }

    if (selectedTag && selectedTag.trim()) {
      const tagLower = selectedTag.trim().toLowerCase();
      result = result.filter((c) => {
        if (!c.Tags) return false;
        const currentItemTags = c.Tags.split(',').map((t) => t.trim().toLowerCase());
        return currentItemTags.includes(tagLower);
      });
    }

    const rawQuery = searchQuery.trim().toLowerCase();
    if (rawQuery) {
      const terms = rawQuery.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);

      result = result.filter((c) => {
        const contactName = (c.Name || '').toLowerCase();
        const contactPhone = c.Phonenumber || '';
        const contactTags = (c.Tags || '').toLowerCase();
        const contactDetails = (c.OtherDetails || '').toLowerCase();

        return terms.every((term) => {
          const nameMatch = contactName.includes(term);
          const phoneMatch = contactPhone.includes(term);
          const tagMatch = contactTags.includes(term);
          const detailsMatch = contactDetails.includes(term);

          return nameMatch || phoneMatch || tagMatch || detailsMatch;
        });
      });
    }

    const isFilteringOrSearching = Boolean(searchQuery.trim() || selectedTag);

    return [...result].sort((a, b) => {
      if (isSelectionMode) {
        const aSelected = selectedContactIds.has(a.id);
        const bSelected = selectedContactIds.has(b.id);
        if (aSelected !== bSelected) {
          return aSelected ? -1 : 1;
        }
      }

      if (isFilteringOrSearching) {
        if (Boolean(a.is_starred) !== Boolean(b.is_starred)) {
          return a.is_starred ? -1 : 1;
        }
      }
      return (a.Name || '').localeCompare(b.Name || '');
    });
  }, [allContacts, isStarredFilterActive, selectedTag, searchQuery, isSelectionMode, selectedContactIds]);

  const sections = useMemo(() => {
    return [{ title: 'contacts', data: filteredContacts }];
  }, [filteredContacts]);

  // Selection Logic
  const handleEnterSelectionMode = useCallback((initialId: number) => {
    closeActiveSwipeable();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSelectionMode(true);
    setSelectedContactIds(new Set([initialId]));
  }, [closeActiveSwipeable]);

  const handleToggleSelectCard = useCallback((id: number) => {
    Haptics.selectionAsync();
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) {
        setIsSelectionMode(false);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    Haptics.selectionAsync();
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
      setIsSelectionMode(false);
    } else {
      setSelectedContactIds(new Set(filteredContacts.map((c) => c.id)));
    }
  }, [selectedContactIds.size, filteredContacts]);

  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedContactIds(new Set());
  }, []);

  // Batch Star / Unstar
  const handleBulkToggleStar = useCallback(async () => {
    if (selectedContactIds.size === 0) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const targetContacts = allContacts.filter((c) => selectedContactIds.has(c.id));
    const allAreStarred = targetContacts.every((c) => c.is_starred);
    const newStarState = !allAreStarred;
    const idsArray = Array.from(selectedContactIds);

    setAllContacts((prev) =>
      prev.map((c) => (selectedContactIds.has(c.id) ? { ...c, is_starred: newStarState } : c))
    );
    showToast(newStarState ? `Starred ${idsArray.length} contacts` : `Unstarred ${idsArray.length} contacts`);
    handleExitSelectionMode();

    try {
      const { error } = await supabase
        .from('Contacts_Table')
        .update({ is_starred: newStarState })
        .in('id', idsArray);

      if (error) throw error;
    } catch {
      Alert.alert('Error', 'Failed to update contacts. Refreshing list.');
      const storedPhone = await AsyncStorage.getItem('user_phone');
      fetchContactsData(storedPhone || userPhone);
    }
  }, [selectedContactIds, allContacts, showToast, handleExitSelectionMode, fetchContactsData, userPhone]);

  // Open Bulk Add Tag Modal
  const openBulkTagModal = useCallback(() => {
    if (selectedContactIds.size === 0) return;
    setBulkTagInput('');
    setStagedBulkTags([]);
    setIsTagModalVisible(true);
  }, [selectedContactIds.size]);

  // Handle comma typing & staging for bulk tags
  const handleBulkTagChange = useCallback((text: string) => {
    if (text.endsWith(',')) {
      const newTag = text.replace(',', '').trim();
      if (newTag) {
        Haptics.selectionAsync();
        setStagedBulkTags((prev) => {
          if (!prev.map((t) => t.toLowerCase()).includes(newTag.toLowerCase())) {
            return [...prev, newTag];
          }
          return prev;
        });
      }
      setBulkTagInput('');
    } else {
      setBulkTagInput(text);
    }
  }, []);

  // Add auto-suggested tag on tap
  const handleSelectBulkTagSuggestion = useCallback((tagText: string) => {
    Haptics.selectionAsync();
    const clean = tagText.trim();
    if (clean && !stagedBulkTags.map((t) => t.toLowerCase()).includes(clean.toLowerCase())) {
      setStagedBulkTags((prev) => [...prev, clean]);
    }
    setBulkTagInput('');
  }, [stagedBulkTags]);

  // Execute Bulk Add Tag Application
  const handleExecuteBulkTag = useCallback(async () => {
    let tagsToAdd = [...stagedBulkTags];
    const leftover = bulkTagInput.trim();
    if (leftover) {
      if (!tagsToAdd.map((t) => t.toLowerCase()).includes(leftover.toLowerCase())) {
        tagsToAdd.push(leftover);
      }
    }

    if (tagsToAdd.length === 0) {
      Alert.alert('Error', 'Please enter at least one tag name.');
      return;
    }

    setIsTagModalVisible(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const idsArray = Array.from(selectedContactIds);
    const activePhone = (await AsyncStorage.getItem('user_phone')) || userPhone;

    setAllContacts((prev) =>
      prev.map((c) => {
        if (!selectedContactIds.has(c.id)) return c;
        const existingTags = c.Tags ? c.Tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
        tagsToAdd.forEach((rt) => {
          if (!existingTags.map((t) => t.toLowerCase()).includes(rt.toLowerCase())) {
            existingTags.push(rt);
          }
        });
        return { ...c, Tags: existingTags.join(', ') };
      })
    );

    showToast(`Tagged ${idsArray.length} contacts with ${tagsToAdd.length} tag(s)`);
    handleExitSelectionMode();

    try {
      const { data: currentRows, error: fetchError } = await supabase
        .from('Contacts_Table')
        .select('id, Tags')
        .in('id', idsArray);

      if (fetchError) throw fetchError;

      for (const row of currentRows || []) {
        const existing = row.Tags ? row.Tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        tagsToAdd.forEach((rt) => {
          if (!existing.map((t: string) => t.toLowerCase()).includes(rt.toLowerCase())) {
            existing.push(rt);
          }
        });
        const updatedTagsString = existing.join(', ');

        await supabase
          .from('Contacts_Table')
          .update({ Tags: updatedTagsString })
          .eq('id', row.id);
      }

      for (const rt of tagsToAdd) {
        const { data: existingTagRow } = await supabase
          .from('PinnedTags')
          .select('*')
          .eq('Userphonenumber', activePhone)
          .ilike('Tagname', rt)
          .maybeSingle();

        if (!existingTagRow) {
          await supabase.from('PinnedTags').insert({
            Userphonenumber: activePhone,
            Tagname: rt,
            Pinned: false,
          });
        }
      }

      fetchPinnedTags(activePhone);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to apply tags to selected contacts');
      const storedPhone = await AsyncStorage.getItem('user_phone');
      fetchContactsData(storedPhone || userPhone);
    }
  }, [stagedBulkTags, bulkTagInput, selectedContactIds, showToast, handleExitSelectionMode, fetchContactsData, fetchPinnedTags, userPhone]);

  // Open Bulk Remove Tag Modal (Draft Stage)
  const openBulkRemoveTagModal = useCallback(() => {
    if (selectedContactIds.size === 0) return;

    const tagSet = new Set<string>();
    allContacts.forEach((c) => {
      if (selectedContactIds.has(c.id) && c.Tags) {
        c.Tags.split(',').forEach((t) => {
          const clean = t.trim();
          if (clean) tagSet.add(clean);
        });
      }
    });

    const uniqueTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
    if (uniqueTags.length === 0) {
      Alert.alert('Notice', 'Selected contacts do not have any tags to remove.');
      return;
    }

    setOriginalUniqueTags(uniqueTags);
    setActiveDraftTags(uniqueTags);
    setIsRemoveTagModalVisible(true);
  }, [selectedContactIds, allContacts]);

  // Execute Bulk Remove Tag Changes & Clean Unused Pinned Tags (Enforcing Minimum 1 Tag Rule)
  const handleExecuteBulkRemoveTags = useCallback(async () => {
    if (activeDraftTags.length === 0) {
      Alert.alert('Action Blocked', 'Selected contacts must retain at least one tag.');
      return;
    }

    const tagsToRemove = originalUniqueTags.filter((t: string) => !activeDraftTags.includes(t));
    if (tagsToRemove.length === 0) {
      setIsRemoveTagModalVisible(false);
      return;
    }

    setIsRemoveTagModalVisible(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const idsArray = Array.from(selectedContactIds);
    const activePhone = (await AsyncStorage.getItem('user_phone')) || userPhone;

    setAllContacts((prev) => {
      const nextContacts = prev.map((c) => {
        if (!selectedContactIds.has(c.id)) return c;
        if (!c.Tags) return c;
        const existingTags = c.Tags.split(',').map((t) => t.trim()).filter(Boolean);
        const filteredTags = existingTags.filter(
          (t) => !tagsToRemove.map((rem) => rem.toLowerCase()).includes(t.toLowerCase())
        );
        return { ...c, Tags: filteredTags.join(', ') };
      });

      setTimeout(async () => {
        try {
          for (const remTag of tagsToRemove) {
            const isStillUsed = nextContacts.some((c) => {
              if (!c.Tags) return false;
              return c.Tags.split(',').map((t) => t.trim().toLowerCase()).includes(remTag.toLowerCase());
            });

            if (!isStillUsed) {
              await supabase
                .from('PinnedTags')
                .delete()
                .eq('Userphonenumber', activePhone)
                .ilike('Tagname', remTag);
            }
          }
          fetchPinnedTags(activePhone);
        } catch (e) {
          console.warn('Failed to cleanup unused pinned tags:', e);
        }
      }, 100);

      return nextContacts;
    });

    showToast(`Removed tags from ${idsArray.length} contacts`);
    handleExitSelectionMode();

    try {
      const { data: currentRows, error: fetchError } = await supabase
        .from('Contacts_Table')
        .select('id, Tags')
        .in('id', idsArray);

      if (fetchError) throw fetchError;

      for (const row of currentRows || []) {
        if (!row.Tags) continue;
        const existing = row.Tags.split(',').map((t: string) => t.trim()).filter(Boolean);
        const filtered = existing.filter(
          (t: string) => !tagsToRemove.map((rem) => rem.toLowerCase()).includes(t.toLowerCase())
        );
        const updatedTagsString = filtered.join(', ');

        await supabase
          .from('Contacts_Table')
          .update({ Tags: updatedTagsString })
          .eq('id', row.id);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to remove tags from selected contacts');
      const storedPhone = await AsyncStorage.getItem('user_phone');
      fetchContactsData(storedPhone || userPhone);
    }
  }, [originalUniqueTags, activeDraftTags, selectedContactIds, showToast, handleExitSelectionMode, fetchContactsData, fetchPinnedTags, userPhone]);

  // Batch Delete
  const handleBulkDelete = useCallback(() => {
    if (selectedContactIds.size === 0) return;

    Alert.alert(
      'Delete Selected Contacts',
      `Are you sure you want to delete ${selectedContactIds.size} contact${selectedContactIds.size > 1 ? 's' : ''}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const idsToDelete = Array.from(selectedContactIds);
            const count = idsToDelete.length;

            setAllContacts((prev) => prev.filter((c) => !selectedContactIds.has(c.id)));
            showToast(`Deleted ${count} contact${count > 1 ? 's' : ''}`);
            handleExitSelectionMode();

            try {
              const { error } = await supabase.from('Contacts_Table').delete().in('id', idsToDelete);
              if (error) throw error;
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete selected contacts');
              const storedPhone = await AsyncStorage.getItem('user_phone');
              fetchContactsData(storedPhone || userPhone);
            }
          },
        },
      ]
    );
  }, [selectedContactIds, showToast, handleExitSelectionMode, fetchContactsData, userPhone]);

  const handleSelectSuggestion = useCallback((text: string, type: 'name' | 'tag') => {
    closeActiveSwipeable();
    setSearchQuery(text);
    setIsStarredFilterActive(false);
    if (type === 'tag') {
      setSelectedTag(text);
    } else {
      setSelectedTag(null);
    }
    setShowSuggestions(false);
    Keyboard.dismiss();
  }, [closeActiveSwipeable]);

  const handleTagPress = useCallback((tag: string | null) => {
    closeActiveSwipeable();
    try {
      sectionListRef.current?.scrollToLocation({
        sectionIndex: 0,
        itemIndex: 0,
        viewOffset: 0,
        animated: true,
      });
    } catch {
      // Safe fallback
    }

    setIsStarredFilterActive(false);

    if (!tag) {
      setSelectedTag(null);
      setSearchQuery('');
      setShowSuggestions(false);
      return;
    }

    setSelectedTag((prev) => {
      if (prev === tag) {
        setSearchQuery('');
        setShowSuggestions(false);
        return null;
      } else {
        setSearchQuery(tag);
        setShowSuggestions(false);
        return tag;
      }
    });
  }, [closeActiveSwipeable]);

  const handleToggleStarredTag = useCallback(() => {
    closeActiveSwipeable();
    try {
      sectionListRef.current?.scrollToLocation({
        sectionIndex: 0,
        itemIndex: 0,
        viewOffset: 0,
        animated: true,
      });
    } catch {
      // Safe fallback
    }

    setSelectedTag(null);
    setSearchQuery('');
    setShowSuggestions(false);
    setIsStarredFilterActive((prev) => !prev);
  }, [closeActiveSwipeable]);

  const openTagsModal = useCallback(() => {
    closeActiveSwipeable();
    Keyboard.dismiss();
    navigation.navigate('PopTags', {
      userPhone,
      onSelectTag: (tagResult: string) => {
        const chosenTag = tagResult ? tagResult.trim() : '';
        setIsStarredFilterActive(false);
        setSelectedTag(chosenTag || null);
        setSearchQuery(chosenTag);
        setShowSuggestions(false);
        try {
          sectionListRef.current?.scrollToLocation({
            sectionIndex: 0,
            itemIndex: 0,
            viewOffset: 0,
            animated: true,
          });
        } catch {
          // Safe fallback
        }
      },
    });
  }, [navigation, userPhone, closeActiveSwipeable]);

  const openManageTagsModal = useCallback(() => {
    closeActiveSwipeable();
    Keyboard.dismiss();
    navigation.navigate('ManageTags', { userPhone });
  }, [navigation, userPhone, closeActiveSwipeable]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSelectedTag(null);
    setIsStarredFilterActive(false);
    setShowSuggestions(false);
    searchInputRef.current?.focus();
  }, []);

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

  const handleCopyPhone = useCallback(
    async (phoneNumber: string) => {
      const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
      if (!cleanNumber) return;

      await Clipboard.setStringAsync(cleanNumber);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`Copied ${cleanNumber} to clipboard`);
    },
    [showToast]
  );

  const renderContactCard = useCallback(
    ({ item }: { item: Contact }) => (
      <ContactCard
        item={item}
        isSelectionMode={isSelectionMode}
        isSelected={selectedContactIds.has(item.id)}
        searchQuery={searchQuery}
        onPress={() => {
          if (isSelectionMode) {
            handleToggleSelectCard(item.id);
          } else {
            closeActiveSwipeable();
            navigation.navigate('EditContact', { id: item.id, userPhone });
          }
        }}
        onLongPress={() => {
          if (!isSelectionMode) {
            handleEnterSelectionMode(item.id);
          }
        }}
        onCall={handleCall}
        onWhatsApp={handleWhatsApp}
        onDelete={handleDeleteContact}
        onTagPress={handleTagPress}
        onCopyPhone={handleCopyPhone}
        onToggleStar={handleToggleStar}
        onSwipeOpen={(ref) => {
          if (openSwipeableRef.current && openSwipeableRef.current !== ref) {
            openSwipeableRef.current.close();
          }
          openSwipeableRef.current = ref;
        }}
      />
    ),
    [
      isSelectionMode,
      selectedContactIds,
      searchQuery,
      handleToggleSelectCard,
      handleEnterSelectionMode,
      navigation,
      userPhone,
      handleCall,
      handleWhatsApp,
      handleDeleteContact,
      handleTagPress,
      handleCopyPhone,
      handleToggleStar,
      closeActiveSwipeable,
    ]
  );

  const ListHeader = useMemo(() => {
    const isAllActive = selectedTag === null && !isStarredFilterActive && searchQuery === '';

    return (
      <View style={styles.scrollableHeaderContainer}>
        <View style={styles.searchSection}>
          <Ionicons name="search" size={18} color="#94A3B8" style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search Name, Phone, or Tag..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onFocus={() => {
              closeActiveSwipeable();
              setShowSuggestions(true);
            }}
            onChangeText={(text) => {
              setSearchQuery(text);
              setShowSuggestions(true);
              if (selectedTag && text !== selectedTag) {
                setSelectedTag(null);
              }
              if (isStarredFilterActive) {
                setIsStarredFilterActive(false);
              }
            }}
            autoCorrect={false}
            clearButtonMode="never"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={openTagsModal} style={styles.tagFilterBtn}>
            <Ionicons name="pricetags" size={18} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {suggestions.length > 0 && (
          <View style={styles.suggestionsDropdown}>
            {suggestions.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.suggestionRow}
                onPress={() => handleSelectSuggestion(item.text, item.type)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.type === 'tag' ? 'pricetag-outline' : 'person-outline'}
                  size={14}
                  color={item.type === 'tag' ? '#2563EB' : '#64748B'}
                />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {item.text}
                </Text>
                <Text style={styles.suggestionTypeBadge}>{item.type}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.tagsWindowCard}>
          <View style={styles.tagsWindowHeader}>
            <View style={styles.tagsTitleRow}>
              <Ionicons name="pin" size={14} color="#2563EB" />
              <Text style={styles.tagsTitleText}>Tags</Text>
            </View>
            <TouchableOpacity
              style={styles.settingsIconBtn}
              onPress={openManageTagsModal}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="settings-outline" size={15} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={styles.tagsWrapContainer}>
            <TouchableOpacity
              style={[styles.tagBadge, isAllActive && styles.tagBadgeActive]}
              onPress={() => handleTagPress(null)}
              activeOpacity={0.75}
            >
              <Text style={[styles.tagBadgeText, isAllActive && styles.tagBadgeTextActive]}>All</Text>
              <View style={[styles.countBubble, isAllActive && styles.countBubbleActive]}>
                <Text style={[styles.badgeCount, isAllActive && styles.badgeCountActive]}>
                  {allContacts.length}
                </Text>
              </View>
            </TouchableOpacity>

            {totalStarredCount > 0 && (
              <TouchableOpacity
                style={[
                  styles.tagBadge,
                  styles.starredTagBadge,
                  isStarredFilterActive && styles.starredTagBadgeActive,
                ]}
                onPress={handleToggleStarredTag}
                activeOpacity={0.75}
              >
                <Ionicons name="star" size={12} color={isStarredFilterActive ? '#FFFFFF' : '#D97706'} />
                <Text
                  style={[
                    styles.tagBadgeText,
                    styles.starredTagText,
                    isStarredFilterActive && styles.tagBadgeTextActive,
                  ]}
                >
                  Starred
                </Text>
                <View
                  style={[
                    styles.countBubble,
                    styles.starredCountBubble,
                    isStarredFilterActive && styles.starredCountBubbleActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeCount,
                      styles.starredBadgeCount,
                      isStarredFilterActive && styles.badgeCountActive,
                    ]}
                  >
                    {totalStarredCount}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {pinnedTags.map((tag, idx) => {
              const isActive = selectedTag === tag;
              const count = tagCounts.get(tag.toLowerCase()) || 0;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.tagBadge, isActive && styles.tagBadgeActive]}
                  onPress={() => handleTagPress(tag)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.tagBadgeText, isActive && styles.tagBadgeTextActive]}>{tag}</Text>
                  <View style={[styles.countBubble, isActive && styles.countBubbleActive]}>
                    <Text style={[styles.badgeCount, isActive && styles.badgeCountActive]}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  }, [
    isSelectionMode,
    searchQuery,
    selectedTag,
    isStarredFilterActive,
    totalStarredCount,
    pinnedTags,
    suggestions,
    allContacts.length,
    tagCounts,
    handleClearSearch,
    openTagsModal,
    openManageTagsModal,
    handleTagPress,
    handleToggleStarredTag,
    handleSelectSuggestion,
    closeActiveSwipeable,
  ]);

  // Sticky Bar: Switches to Selection Controller when in Batch Mode
  const renderStickySectionHeader = useCallback(() => {
    if (isSelectionMode) {
      const isAllSelected = selectedContactIds.size === filteredContacts.length && filteredContacts.length > 0;

      return (
        <View style={[styles.stickyBar, styles.stickyBarSelectionMode]}>
          <View style={styles.selectionModeHeaderRow}>
            <TouchableOpacity
              onPress={handleExitSelectionMode}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color="#1E293B" />
            </TouchableOpacity>

            <Text style={styles.selectionCountTitle}>
              {selectedContactIds.size} Selected
            </Text>

            <TouchableOpacity onPress={handleSelectAll} activeOpacity={0.7}>
              <Text style={styles.selectAllText}>
                {isAllSelected ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    let filterLabel = '';
    if (isStarredFilterActive) {
      filterLabel = 'Starred';
    } else if (selectedTag) {
      filterLabel = `Tag: "${selectedTag}"`;
    } else if (searchQuery) {
      filterLabel = `Search: "${searchQuery}"`;
    }

    return (
      <View style={styles.stickyBar}>
        <View style={styles.stickyBarRow}>
          <Text style={styles.counterText}>
            Total Contacts: {filteredContacts.length}
            {filterLabel ? ` (${filterLabel})` : ''}
          </Text>
        </View>
      </View>
    );
  }, [
    isSelectionMode,
    selectedContactIds.size,
    filteredContacts.length,
    isStarredFilterActive,
    selectedTag,
    searchQuery,
    handleExitSelectionMode,
    handleSelectAll,
  ]);

  const renderEmptyComponent = useMemo(() => {
    if (loading) return null;

    const hasFilter = Boolean(searchQuery || selectedTag || isStarredFilterActive);

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name={hasFilter ? 'search-outline' : 'people-outline'} size={36} color="#94A3B8" />
        </View>
        <Text style={styles.emptyTitle}>
          {hasFilter ? 'No matching contacts' : 'No contacts yet'}
        </Text>
        <Text style={styles.emptySubtext}>
          {hasFilter
            ? `We couldn't find anything matching your active filters. Check the spelling or clear filters.`
            : 'Start building your network by saving your first contact with tags.'}
        </Text>

        {hasFilter ? (
          <TouchableOpacity style={styles.emptyActionButton} onPress={handleClearSearch} activeOpacity={0.8}>
            <Ionicons name="close-circle-outline" size={16} color="#2563EB" />
            <Text style={styles.emptyActionText}>Clear Search & Filters</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.emptyActionButton, styles.emptyActionPrimary]}
            onPress={() => navigation.navigate('AddContact', { userPhone })}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add" size={16} color="#FFFFFF" />
            <Text style={[styles.emptyActionText, { color: '#FFFFFF' }]}>Add Contact</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [loading, searchQuery, selectedTag, isStarredFilterActive, handleClearSearch, navigation, userPhone]);

  return (
    <View style={styles.container}>
      {loading && allContacts.length === 0 ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 60 }} />
      ) : (
        <SectionList
          ref={sectionListRef}
          sections={sections}
          keyExtractor={(item, index) => (item?.id != null ? item.id.toString() : index.toString())}
          renderItem={renderContactCard}
          ListHeaderComponent={ListHeader}
          renderSectionHeader={renderStickySectionHeader}
          stickySectionHeadersEnabled={true}
          onScrollBeginDrag={closeActiveSwipeable}
          contentContainerStyle={[
            styles.listContent,
            isSelectionMode && { paddingBottom: 110 },
          ]}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handlePullRefresh}
              colors={['#2563EB']}
              tintColor="#2563EB"
              enabled={!isSelectionMode}
            />
          }
          ListEmptyComponent={renderEmptyComponent}
        />
      )}

      {/* Floating Bottom Action Toolbar for Batch Mode */}
      {isSelectionMode && (
        <View style={styles.floatingActionBar}>
          <TouchableOpacity
            style={styles.floatingActionBtn}
            onPress={handleBulkToggleStar}
            activeOpacity={0.75}
          >
            <Ionicons name="star" size={18} color="#F59E0B" />
            <Text style={styles.floatingActionLabel}>Star</Text>
          </TouchableOpacity>

          <View style={styles.floatingActionDivider} />

          <TouchableOpacity
            style={styles.floatingActionBtn}
            onPress={openBulkTagModal}
            activeOpacity={0.75}
          >
            <Ionicons name="pricetag" size={18} color="#2563EB" />
            <Text style={[styles.floatingActionLabel, { color: '#2563EB' }]}>Add Tag</Text>
          </TouchableOpacity>

          <View style={styles.floatingActionDivider} />

          <TouchableOpacity
            style={styles.floatingActionBtn}
            onPress={openBulkRemoveTagModal}
            activeOpacity={0.75}
          >
            <Ionicons name="pricetag-outline" size={18} color="#D97706" />
            <Text style={[styles.floatingActionLabel, { color: '#D97706' }]}>Remove Tag</Text>
          </TouchableOpacity>

          <View style={styles.floatingActionDivider} />

          <TouchableOpacity
            style={styles.floatingActionBtn}
            onPress={handleBulkDelete}
            activeOpacity={0.75}
          >
            <Ionicons name="trash" size={18} color="#EF4444" />
            <Text style={[styles.floatingActionLabel, { color: '#EF4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Custom Bulk Add Tag Modal matching Add/Edit Contact style */}
      <Modal
        visible={isTagModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsTagModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Tags to Selected</Text>
            <Text style={styles.modalSubtitle}>
              Type tags for {selectedContactIds.size} selected contact{selectedContactIds.size > 1 ? 's' : ''}:
            </Text>

            {/* Staged Tag Chips Container */}
            {stagedBulkTags.length > 0 && (
              <View style={styles.stagedChipsWrapContainer}>
                {stagedBulkTags.map((stagedTag, idx) => (
                  <View key={idx} style={styles.stagedChip}>
                    <Text style={styles.stagedChipText}>{stagedTag}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        setStagedBulkTags((prev) => prev.filter((t) => t !== stagedTag));
                      }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="close-circle" size={14} color="#1D4ED8" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TextInput
              style={styles.modalInput}
              placeholder="Type tag & press comma (,)..."
              placeholderTextColor="#94A3B8"
              value={bulkTagInput}
              onChangeText={handleBulkTagChange}
              autoFocus={true}
              autoCorrect={false}
            />

            {/* Auto-suggest dropdown matching standard Add/Edit Contact behavior */}
            {bulkTagSuggestions.length > 0 && (
              <View style={styles.modalSuggestionsDropdown}>
                {bulkTagSuggestions.map((sug, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.modalSuggestionRow}
                    onPress={() => handleSelectBulkTagSuggestion(sug)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pricetag-outline" size={13} color="#2563EB" />
                    <Text style={styles.modalSuggestionText}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setIsTagModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalApplyBtn]}
                onPress={handleExecuteBulkTag}
                activeOpacity={0.7}
              >
                <Text style={styles.modalApplyText}>Apply Tags</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bulk Remove Tag Draft Selector Modal */}
      <Modal
        visible={isRemoveTagModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsRemoveTagModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Remove Tags</Text>
            <Text style={styles.modalSubtitle}>
              Tap the '✕' on any tag to remove it from your {selectedContactIds.size} selected contact{selectedContactIds.size > 1 ? 's' : ''}.
            </Text>
            <ScrollView contentContainerStyle={styles.draftChipsContainer} style={{ maxHeight: 200 }}>
              {activeDraftTags.length === 0 ? (
                <Text style={styles.noDraftTagsText}>All tags staged for removal.</Text>
              ) : (
                activeDraftTags.map((tag, idx) => (
                  <View key={idx} style={styles.draftChip}>
                    <Text style={styles.draftChipText}>{tag}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        setActiveDraftTags((prev) => prev.filter((t) => t !== tag));
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={[styles.modalButtonsRow, { marginTop: 16 }]}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setIsRemoveTagModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              {/* Uniform blue theme applied here, disabled if 0 tags remain */}
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalApplyBtn,
                  activeDraftTags.length === 0 && { opacity: 0.5 }
                ]}
                onPress={handleExecuteBulkRemoveTags}
                disabled={activeDraftTags.length === 0}
                activeOpacity={0.7}
              >
                <Text style={styles.modalApplyText}>Update Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {toastMessage && (
        <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollableHeaderContainer: {
    backgroundColor: '#F1F5F9',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAppTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: '#0F172A' },
  tagFilterBtn: { padding: 4, marginLeft: 4 },
  suggestionsDropdown: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: -2,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },
  suggestionTypeBadge: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: '#94A3B8',
    fontWeight: '700',
  },
  tagsWindowCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  tagsWindowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tagsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tagsTitleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  settingsIconBtn: {
    padding: 2,
  },
  tagsWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4.5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 5,
  },
  tagBadgeActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  tagBadgeText: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
  },
  tagBadgeTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  starredTagBadge: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  starredTagBadgeActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  starredTagText: {
    color: '#92400E',
  },
  countBubble: {
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBubbleActive: {
    backgroundColor: '#1D4ED8',
  },
  starredCountBubble: {
    backgroundColor: '#FEF3C7',
  },
  starredCountBubbleActive: {
    backgroundColor: '#B45309',
  },
  badgeCount: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '700',
  },
  badgeCountActive: {
    color: '#FFFFFF',
  },
  starredBadgeCount: {
    color: '#B45309',
  },
  stickyBar: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 6,
  },
  stickyBarSelectionMode: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  stickyBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionModeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionCountTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  counterText: {
    fontSize: 12.5,
    color: '#515d6e',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 40,
    flexGrow: 1,
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
  cardSelected: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#2563EB',
  },
  checkboxContainer: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightSwipeActionsContainer: {
    width: 80,
    flexDirection: 'row',
  },
  leftSwipeActionsContainer: {
    width: 80,
    flexDirection: 'row',
  },
  swipeActionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteSwipeBtn: {
    backgroundColor: '#EF4444',
  },
  callSwipeBtn: {
    backgroundColor: '#2563EB',
  },
  swipeActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    maxWidth: '65%',
  },
  noteMatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  noteMatchBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338CA',
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
    fontSize: 14,
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
  notesContainerHighlighted: {
    backgroundColor: '#F8FAFC',
    padding: 6,
    borderRadius: 6,
    borderLeftWidth: 2.5,
    borderLeftColor: '#6366F1',
  },
  noteIconShift: {
    marginTop: 1.5,
  },
  detailsText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  detailsTextHighlighted: {
    color: '#1E293B',
    fontWeight: '500',
  },
  floatingActionBar: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  floatingActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  floatingActionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  floatingActionDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  modalInput: {
    height: 46,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
  },
  stagedChipsWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  stagedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
  },
  stagedChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  modalSuggestionsDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  modalSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  modalSuggestionText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },
  draftChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 4,
  },
  draftChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  draftChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  noDraftTagsText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
    width: '100%',
    paddingVertical: 12,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  modalApplyBtn: {
    backgroundColor: '#2563EB',
  },
  modalApplyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 64,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  emptyActionPrimary: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  toastText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
});
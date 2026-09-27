import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  SectionList,
  TouchableOpacity,
  Pressable,
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
import { Contact, FollowupItem } from '../types';

interface ResolvedLinkBadge {
  name: string;
  phone: string;
  matchedTag?: string;
  matchedName?: boolean;
}

interface StagedLinkedContact {
  name: string;
  phone: string;
}

interface DraftRemoveItem {
  id: string;
  type: 'tag' | 'link';
  label: string;
  value: string;
}

interface ContactCardProps {
  item: Contact;
  isSelectionMode: boolean;
  isSelected: boolean;
  hasActiveFollowup: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onCall: (phone: string) => void;
  onWhatsApp: (phone: string) => void;
  onDelete: (contact: Contact) => void;
  onTagPress: (tag: string) => void;
  onCopyPhone: (phone: string) => void;
  onToggleStar: (contact: Contact) => void;
  onFollowupBellPress: (contact: Contact) => void;
  onSwipeFollowupPress: (contact: Contact, hasActive: boolean) => void;
  searchQuery: string;
  activeTerms: string[];
  onSwipeOpen: (ref: Swipeable) => void;
  contactsMap: Map<string, Contact>;
  onLinkedBadgePress: (targetContact: Contact) => void;
  onLinkedBadgeLongPress: (targetContact: Contact) => void;
}

const ContactCard = React.memo(
  ({
    item,
    isSelectionMode,
    isSelected,
    hasActiveFollowup,
    onPress,
    onLongPress,
    onCall,
    onWhatsApp,
    onDelete,
    onTagPress,
    onCopyPhone,
    onToggleStar,
    onFollowupBellPress,
    onSwipeFollowupPress,
    activeTerms,
    onSwipeOpen,
    contactsMap,
    onLinkedBadgePress,
    onLinkedBadgeLongPress,
  }: ContactCardProps) => {
    const isStarred = Boolean(item.is_starred);
    const swipeableRef = useRef<Swipeable>(null);

    const tagList = useMemo(() => {
      if (!item.Tags) return [];
      const raw = item.Tags.split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (activeTerms.length === 0) {
        return raw.sort((a, b) => a.length - b.length || a.localeCompare(b));
      }

      const matched: string[] = [];
      const unmatched: string[] = [];

      raw.forEach((t) => {
        const lower = t.toLowerCase();
        if (activeTerms.some((term) => lower.includes(term))) {
          matched.push(t);
        } else {
          unmatched.push(t);
        }
      });

      return [...matched, ...unmatched];
    }, [item.Tags, activeTerms]);

    const resolvedLinks = useMemo<ResolvedLinkBadge[]>(() => {
      const linkedPhoneField = (item as any).LinkedContactPhone;
      if (!linkedPhoneField) return [];

      const phoneList = linkedPhoneField
        .split(',')
        .map((p: string) => p.trim().slice(-10))
        .filter(Boolean);

      return phoneList
        .map((lPhone: string) => {
          const linkedContact = contactsMap.get(lPhone);
          if (!linkedContact) return null;

          const linkedName = linkedContact.Name || 'Contact';
          const linkedTags = linkedContact.Tags
            ? linkedContact.Tags.split(',').map((t) => t.trim()).filter(Boolean)
            : [];

          let matchedTag: string | undefined = undefined;
          let matchedName = false;

          if (activeTerms.length > 0) {
            matchedName = activeTerms.some((term) => linkedName.toLowerCase().includes(term));

            for (const t of linkedTags) {
              if (activeTerms.some((term) => t.toLowerCase().includes(term))) {
                matchedTag = t;
                break;
              }
            }
          }

          return {
            name: linkedName,
            phone: lPhone,
            matchedTag,
            matchedName,
          };
        })
        .filter(Boolean) as ResolvedLinkBadge[];
    }, [(item as any).LinkedContactPhone, contactsMap, activeTerms]);

    const isNotesMatchOnly = useMemo(() => {
      if (activeTerms.length === 0) return false;

      const contactName = (item.Name || '').toLowerCase();
      const contactPhone = item.Phonenumber || '';
      const contactTags = (item.Tags || '').toLowerCase();
      const contactDetails = (item.OtherDetails || '').toLowerCase();

      const fullMatch = activeTerms.every(
        (t) =>
          contactName.includes(t) ||
          contactPhone.includes(t) ||
          contactTags.includes(t) ||
          contactDetails.includes(t)
      );

      const matchedPrimaries = activeTerms.every(
        (t) =>
          contactName.includes(t) ||
          contactPhone.includes(t) ||
          contactTags.includes(t)
      );

      return fullMatch && !matchedPrimaries && contactDetails.length > 0;
    }, [activeTerms, item.Name, item.Phonenumber, item.Tags, item.OtherDetails]);

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

    const renderLeftActions = (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
      if (isSelectionMode) return null;
      const trans = dragX.interpolate({
        inputRange: [0, 95],
        outputRange: [-95, 0],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View style={[styles.leftSwipeActionsContainer, { transform: [{ translateX: trans }] }]}>
          <TouchableOpacity
            style={[
              styles.swipeActionBtn,
              hasActiveFollowup ? styles.followupSwipeBtn : styles.newFollowupSwipeBtn,
            ]}
            onPress={() => {
              swipeableRef.current?.close();
              onSwipeFollowupPress(item, hasActiveFollowup);
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={hasActiveFollowup ? 'notifications' : 'notifications-outline'}
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.swipeActionText}>
              {hasActiveFollowup ? 'Follow-up' : 'New Reminder'}
            </Text>
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
                  {hasActiveFollowup && (
                    <TouchableOpacity
                      style={[styles.iconButton, styles.followupBellButton]}
                      onPress={() => onFollowupBellPress(item)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="notifications" size={17} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}

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

            {(tagList.length > 0 || resolvedLinks.length > 0) && (
              <View style={styles.tagContainer}>
                {tagList.map((tag, index) => {
                  const isMatched = activeTerms.some((term) => tag.toLowerCase().includes(term));

                  return (
                    <TouchableOpacity
                      key={`tag-${index}`}
                      style={[styles.tagPill, isMatched && styles.tagPillMatched]}
                      activeOpacity={0.7}
                      onPress={() => onTagPress(tag)}
                      disabled={isSelectionMode}
                    >
                      <Ionicons
                        name="pricetag-outline"
                        size={11}
                        color={isMatched ? '#1D4ED8' : '#2563EB'}
                        style={{ marginRight: 3 }}
                      />
                      <Text style={[styles.tagText, isMatched && styles.tagTextMatched]}>{tag}</Text>
                    </TouchableOpacity>
                  );
                })}

                {resolvedLinks.map((link, lIdx) => {
                  const target = contactsMap.get(link.phone);
                  const isLinkedSearchMatch = Boolean(link.matchedTag || link.matchedName);

                  return (
                    <TouchableOpacity
                      key={`link-${lIdx}`}
                      style={[
                        styles.tagPill,
                        isLinkedSearchMatch && styles.tagPillMatched,
                      ]}
                      activeOpacity={0.75}
                      onPress={() => {
                        if (target) {
                          onLinkedBadgePress(target);
                        }
                      }}
                      onLongPress={() => {
                        if (target) {
                          onLinkedBadgeLongPress(target);
                        }
                      }}
                      delayLongPress={300}
                      disabled={isSelectionMode}
                    >
                      <Ionicons
                        name="link"
                        size={11}
                        color={isLinkedSearchMatch ? '#1D4ED8' : '#2563EB'}
                        style={{ marginRight: 3 }}
                      />
                      <Text
                        style={[
                          styles.tagText,
                          isLinkedSearchMatch && styles.tagTextMatched,
                        ]}
                        numberOfLines={1}
                      >
                        {link.name}
                        {link.matchedTag ? ` (${link.matchedTag})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
  const [activeFollowups, setActiveFollowups] = useState<FollowupItem[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isStarredFilterActive, setIsStarredFilterActive] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');

  const activeTerms = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return [];
    return q.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
  }, [searchQuery]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userPhone, setUserPhone] = useState('9999999999');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());

  // Bulk Add Modal State
  const [isTagModalVisible, setIsTagModalVisible] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [stagedBulkTags, setStagedBulkTags] = useState<string[]>([]);
  const [stagedBulkLinks, setStagedBulkLinks] = useState<StagedLinkedContact[]>([]);

  // Bulk Remove Modal State
  const [isRemoveTagModalVisible, setIsRemoveTagModalVisible] = useState(false);
  const [originalDraftItems, setOriginalDraftItems] = useState<DraftRemoveItem[]>([]);
  const [activeDraftItemIds, setActiveDraftItemIds] = useState<string[]>([]);

  const [quickContactModalVisible, setQuickContactModalVisible] = useState(false);
  const [quickContactTarget, setQuickContactTarget] = useState<Contact | null>(null);

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

  const saveSearchState = useCallback((query: string, tag: string | null, starred: boolean) => {
    AsyncStorage.setItem(
      'active_contacts_search_state',
      JSON.stringify({ query, tag, starred })
    ).catch(() => {});
  }, []);

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

  useEffect(() => {
    const onBackPress = () => {
      if (quickContactModalVisible) {
        setQuickContactModalVisible(false);
        return true;
      }
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
  }, [isSelectionMode, isTagModalVisible, isRemoveTagModalVisible, quickContactModalVisible]);

  useEffect(() => {
    if (route.params?.selectedTag !== undefined) {
      const chosenTag = route.params.selectedTag ? route.params.selectedTag.trim() : '';
      setSelectedTag(chosenTag || null);
      setIsStarredFilterActive(false);
      setSearchQuery(chosenTag);
      setShowSuggestions(false);
      saveSearchState(chosenTag, chosenTag || null, false);
      navigation.setParams({ selectedTag: undefined });
    }
  }, [route.params?.selectedTag, navigation, saveSearchState]);

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

  const fetchFollowupsData = useCallback(async (phoneOverride?: string) => {
    try {
      const activePhone = phoneOverride || (await AsyncStorage.getItem('user_phone')) || userPhone;
      const { data, error } = await supabase
        .from('Followups_Table')
        .select('*')
        .eq('Userphonenumber', activePhone)
        .eq('is_completed', false);

      if (error) throw error;
      setActiveFollowups(data || []);
    } catch (err: any) {
      console.warn('Failed to load active followups:', err.message);
    }
  }, [userPhone]);

  const activeFollowupContactIdSet = useMemo(() => {
    const set = new Set<number>();
    activeFollowups.forEach((f) => {
      if (f.contact_id) set.add(f.contact_id);
    });
    return set;
  }, [activeFollowups]);

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

  const linkedPeopleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allContacts) {
      const rawField = (c as any).LinkedContactPhone;
      if (rawField) {
        rawField.split(',').forEach((p: string) => {
          const cleanP = p.trim().slice(-10);
          const person = contactsMap.get(cleanP);
          if (person?.Name) {
            map.set(person.Name.toLowerCase(), cleanP);
          }
        });
      }
    }
    return map;
  }, [allContacts, contactsMap]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const run = async () => {
        const storedPhone = await AsyncStorage.getItem('user_phone');
        const active = storedPhone || userPhone;
        if (storedPhone) setUserPhone(storedPhone);

        const savedState = await AsyncStorage.getItem('active_contacts_search_state');
        if (savedState && isMounted) {
          try {
            const { query, tag, starred } = JSON.parse(savedState);
            if (query !== undefined) setSearchQuery(query);
            if (tag !== undefined) setSelectedTag(tag);
            if (starred !== undefined) setIsStarredFilterActive(Boolean(starred));
          } catch {
            // Quiet fail
          }
        }

        if (isMounted) {
          if (allContacts.length === 0) setLoading(true);
          await Promise.all([
            fetchPinnedTags(active),
            fetchContactsData(active),
            fetchFollowupsData(active),
          ]);
          if (isMounted) setLoading(false);
        }
      };
      run();
      return () => {
        isMounted = false;
      };
    }, [userPhone, fetchPinnedTags, fetchContactsData, fetchFollowupsData, allContacts.length])
  );

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
      saveSearchState('', null, false);
    }

    const storedPhone = await AsyncStorage.getItem('user_phone');
    const active = storedPhone || userPhone;
    await Promise.all([
      fetchPinnedTags(active),
      fetchContactsData(active),
      fetchFollowupsData(active),
    ]);
    setRefreshing(false);
  }, [
    userPhone,
    isSelectionMode,
    searchQuery,
    selectedTag,
    isStarredFilterActive,
    fetchPinnedTags,
    fetchContactsData,
    fetchFollowupsData,
    closeActiveSwipeable,
    saveSearchState,
  ]);

  const handleResetAndRefresh = useCallback(async () => {
    closeActiveSwipeable();
    setSearchQuery('');
    setSelectedTag(null);
    setIsStarredFilterActive(false);
    setIsSelectionMode(false);
    setSelectedContactIds(new Set());
    setShowSuggestions(false);
    Keyboard.dismiss();
    saveSearchState('', null, false);

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
    await Promise.all([
      fetchPinnedTags(active),
      fetchContactsData(active),
      fetchFollowupsData(active),
    ]);
    setLoading(false);
  }, [userPhone, fetchPinnedTags, fetchContactsData, fetchFollowupsData, closeActiveSwipeable, saveSearchState]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      closeActiveSwipeable();
      if (navigation.isFocused()) {
        handleResetAndRefresh();
      }
    });
    return unsubscribe;
  }, [navigation, handleResetAndRefresh, closeActiveSwipeable]);

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

  const itemCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const c of allContacts) {
      if (c.Tags) {
        const tags = c.Tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        for (const t of tags) {
          counts.set(t, (counts.get(t) || 0) + 1);
        }
      }
    }

    linkedPeopleMap.forEach((targetPhone, lowerName) => {
      let count = 0;
      for (const c of allContacts) {
        const links = ((c as any).LinkedContactPhone || '')
          .split(',')
          .map((p: string) => p.trim().slice(-10))
          .filter(Boolean);

        if (links.includes(targetPhone)) {
          count++;
        }
      }
      counts.set(lowerName, count);
    });

    return counts;
  }, [allContacts, linkedPeopleMap]);

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

  const bulkDualSuggestions = useMemo(() => {
    const q = bulkTagInput.trim().toLowerCase();
    if (!q) return { tags: [], contacts: [] };

    const stagedTagSet = new Set(stagedBulkTags.map((t) => t.toLowerCase()));
    const stagedLinkPhoneSet = new Set(stagedBulkLinks.map((l) => l.phone));

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

    const matchingTags: string[] = [];
    uniqueMap.forEach((orig, lower) => {
      if (lower.includes(q) && !stagedTagSet.has(lower)) {
        matchingTags.push(orig);
      }
    });

    const matchingContacts = allContacts
      .filter((contact) => {
        const cleanContactPhone = (contact.Phonenumber || '').replace(/\D/g, '').slice(-10);
        if (!cleanContactPhone) return false;
        if (stagedLinkPhoneSet.has(cleanContactPhone)) return false;

        const nameMatch = contact.Name?.toLowerCase().includes(q);
        const phoneMatch = cleanContactPhone.includes(q);
        const tagsMatch = contact.Tags?.toLowerCase().includes(q);

        return nameMatch || phoneMatch || tagsMatch;
      })
      .map((contact) => {
        const rawTags = contact.Tags
          ? contact.Tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [];

        const matchedTags: string[] = [];
        const otherTags: string[] = [];

        rawTags.forEach((t) => {
          if (t.toLowerCase().includes(q)) {
            matchedTags.push(t);
          } else {
            otherTags.push(t);
          }
        });

        const sortedTags = [...matchedTags, ...otherTags];
        const clean10 = (contact.Phonenumber || '').replace(/\D/g, '').slice(-10);

        return {
          ...contact,
          cleanPhone: clean10,
          sortedTags,
        };
      });

    return {
      tags: matchingTags,
      contacts: matchingContacts,
    };
  }, [bulkTagInput, pinnedTags, allContacts, stagedBulkTags, stagedBulkLinks]);

  const filteredContacts = useMemo(() => {
    let result = allContacts;

    if (isStarredFilterActive) {
      result = result.filter((c) => Boolean(c.is_starred));
    }

    if (selectedTag && selectedTag.trim()) {
      const tagLower = selectedTag.trim().toLowerCase();
      const targetLinkedPhone = linkedPeopleMap.get(tagLower);

      result = result.filter((c) => {
        if (c.Tags) {
          const currentItemTags = c.Tags.split(',').map((t) => t.trim().toLowerCase());
          if (currentItemTags.includes(tagLower)) return true;
        }

        const contactNameLower = (c.Name || '').toLowerCase();
        const contactCleanPhone = (c.Phonenumber || '').replace(/\D/g, '').slice(-10);
        if (contactNameLower === tagLower) return true;
        if (targetLinkedPhone && contactCleanPhone === targetLinkedPhone) return true;

        const linkedPhones = ((c as any).LinkedContactPhone || '')
          .split(',')
          .map((p: string) => p.trim().slice(-10))
          .filter(Boolean);

        if (targetLinkedPhone && linkedPhones.includes(targetLinkedPhone)) {
          return true;
        }

        for (const lPhone of linkedPhones) {
          const linkedPerson = contactsMap.get(lPhone);
          if (linkedPerson) {
            if ((linkedPerson.Name || '').toLowerCase() === tagLower) return true;
            if (linkedPerson.Tags) {
              const lTags = linkedPerson.Tags.split(',').map((t: string) => t.trim().toLowerCase());
              if (lTags.includes(tagLower)) return true;
            }
          }
        }

        return false;
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

        const directMatch = terms.every(
          (term) =>
            contactName.includes(term) ||
            contactPhone.includes(term) ||
            contactTags.includes(term) ||
            contactDetails.includes(term)
        );

        if (directMatch) return true;

        const linkedPhones = ((c as any).LinkedContactPhone || '')
          .split(',')
          .map((p: string) => p.trim().slice(-10))
          .filter(Boolean);

        if (linkedPhones.length === 0) return false;

        return terms.every((term) => {
          return linkedPhones.some((lPhone: string) => {
            const linkedPerson = contactsMap.get(lPhone);
            if (!linkedPerson) return false;

            const lName = (linkedPerson.Name || '').toLowerCase();
            const lPhoneRaw = linkedPerson.Phonenumber || '';
            const lTags = (linkedPerson.Tags || '').toLowerCase();

            return lName.includes(term) || lPhoneRaw.includes(term) || lTags.includes(term);
          });
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
  }, [allContacts, isStarredFilterActive, selectedTag, searchQuery, isSelectionMode, selectedContactIds, contactsMap, linkedPeopleMap]);

  const sections = useMemo(() => {
    return [{ title: 'contacts', data: filteredContacts }];
  }, [filteredContacts]);

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

  const openBulkTagModal = useCallback(() => {
    if (selectedContactIds.size === 0) return;
    setBulkTagInput('');
    setStagedBulkTags([]);
    setStagedBulkLinks([]);
    setIsTagModalVisible(true);
  }, [selectedContactIds.size]);

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

  const handleSelectBulkTagSuggestion = useCallback((tagText: string) => {
    Haptics.selectionAsync();
    const clean = tagText.trim();
    if (clean && !stagedBulkTags.map((t) => t.toLowerCase()).includes(clean.toLowerCase())) {
      setStagedBulkTags((prev) => [...prev, clean]);
    }
    setBulkTagInput('');
  }, [stagedBulkTags]);

  const handleSelectBulkLinkSuggestion = useCallback((contact: any) => {
    Haptics.selectionAsync();
    const clean10 = contact.cleanPhone || (contact.Phonenumber || '').replace(/\D/g, '').slice(-10);
    if (!clean10) return;

    setStagedBulkLinks((prev) => {
      if (prev.some((l) => l.phone === clean10)) return prev;
      return [
        ...prev,
        {
          name: contact.Name || 'Unnamed',
          phone: clean10,
        },
      ];
    });
    setBulkTagInput('');
  }, []);

  const handleExecuteBulkTag = useCallback(async () => {
    let tagsToAdd = [...stagedBulkTags];
    const leftover = bulkTagInput.trim();
    if (leftover) {
      if (!tagsToAdd.map((t) => t.toLowerCase()).includes(leftover.toLowerCase())) {
        tagsToAdd.push(leftover);
      }
    }

    if (tagsToAdd.length === 0 && stagedBulkLinks.length === 0) {
      Alert.alert('Error', 'Please enter at least one tag or link at least one contact.');
      return;
    }

    setIsTagModalVisible(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const idsArray = Array.from(selectedContactIds);
    const activePhone = (await AsyncStorage.getItem('user_phone')) || userPhone;

    setAllContacts((prev) =>
      prev.map((c) => {
        if (!selectedContactIds.has(c.id)) return c;
        const current10 = (c.Phonenumber || '').replace(/\D/g, '').slice(-10);

        const existingTags: string[] = c.Tags ? c.Tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        tagsToAdd.forEach((rt: string) => {
          if (!existingTags.map((t: string) => t.toLowerCase()).includes(rt.toLowerCase())) {
            existingTags.push(rt);
          }
        });

        const existingLinks = ((c as any).LinkedContactPhone || '')
          .split(',')
          .map((p: string) => p.trim().slice(-10))
          .filter(Boolean);

        stagedBulkLinks.forEach((l) => {
          if (l.phone !== current10 && !existingLinks.includes(l.phone)) {
            existingLinks.push(l.phone);
          }
        });

        return {
          ...c,
          Tags: existingTags.join(', '),
          LinkedContactPhone: existingLinks.length > 0 ? existingLinks.join(', ') : null,
        };
      })
    );

    const summaryParts: string[] = [];
    if (tagsToAdd.length > 0) summaryParts.push(`${tagsToAdd.length} tag(s)`);
    if (stagedBulkLinks.length > 0) summaryParts.push(`${stagedBulkLinks.length} contact link(s)`);
    showToast(`Updated ${idsArray.length} contacts with ${summaryParts.join(' & ')}`);
    handleExitSelectionMode();

    try {
      const { data: currentRows, error: fetchError } = await supabase
        .from('Contacts_Table')
        .select('id, Phonenumber, Tags, LinkedContactPhone')
        .in('id', idsArray);

      if (fetchError) throw fetchError;

      for (const row of currentRows || []) {
        const current10 = (row.Phonenumber || '').replace(/\D/g, '').slice(-10);

        const existingTags: string[] = row.Tags ? row.Tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        tagsToAdd.forEach((rt: string) => {
          if (!existingTags.map((t: string) => t.toLowerCase()).includes(rt.toLowerCase())) {
            existingTags.push(rt);
          }
        });
        const updatedTagsString = existingTags.join(', ');

        const existingLinks = (row.LinkedContactPhone || '')
          .split(',')
          .map((p: string) => p.trim().slice(-10))
          .filter(Boolean);

        stagedBulkLinks.forEach((l) => {
          if (l.phone !== current10 && !existingLinks.includes(l.phone)) {
            existingLinks.push(l.phone);
          }
        });
        const updatedLinksString = existingLinks.length > 0 ? existingLinks.join(', ') : null;

        await supabase
          .from('Contacts_Table')
          .update({
            Tags: updatedTagsString,
            LinkedContactPhone: updatedLinksString,
          })
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
      Alert.alert('Error', err.message || 'Failed to apply changes in bulk');
      const storedPhone = await AsyncStorage.getItem('user_phone');
      fetchContactsData(storedPhone || userPhone);
    }
  }, [
    stagedBulkTags,
    stagedBulkLinks,
    bulkTagInput,
    selectedContactIds,
    showToast,
    handleExitSelectionMode,
    fetchContactsData,
    fetchPinnedTags,
    userPhone,
  ]);

  const openBulkRemoveTagModal = useCallback(() => {
    if (selectedContactIds.size === 0) return;

    const tagSet = new Set<string>();
    const linkPhoneSet = new Set<string>();

    allContacts.forEach((c) => {
      if (selectedContactIds.has(c.id)) {
        if (c.Tags) {
          c.Tags.split(',').forEach((t) => {
            const clean = t.trim();
            if (clean) tagSet.add(clean);
          });
        }

        const linkedField = (c as any).LinkedContactPhone;
        if (linkedField) {
          linkedField.split(',').forEach((p: string) => {
            const cleanP = p.trim().slice(-10);
            if (cleanP) linkPhoneSet.add(cleanP);
          });
        }
      }
    });

    const items: DraftRemoveItem[] = [];

    Array.from(tagSet)
      .sort((a, b) => a.localeCompare(b))
      .forEach((t) => {
        items.push({
          id: `tag:${t.toLowerCase()}`,
          type: 'tag',
          label: t,
          value: t,
        });
      });

    Array.from(linkPhoneSet)
      .map((phone) => {
        const linkedPerson = contactsMap.get(phone);
        const name = linkedPerson?.Name || `Contact (${phone})`;
        return {
          id: `link:${phone}`,
          type: 'link' as const,
          label: name,
          value: phone,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach((item) => items.push(item));

    if (items.length === 0) {
      Alert.alert('Notice', 'Selected contacts do not have any tags or linked contacts to remove.');
      return;
    }

    setOriginalDraftItems(items);
    setActiveDraftItemIds(items.map((it) => it.id));
    setIsRemoveTagModalVisible(true);
  }, [selectedContactIds, allContacts, contactsMap]);

  const handleRemoveDraftItem = useCallback(
    (item: DraftRemoveItem) => {
      Haptics.selectionAsync();
      setActiveDraftItemIds((prev) => prev.filter((id) => id !== item.id));
      showToast(`Staged for removal: ${item.label}`);
    },
    [showToast]
  );

  const handleExecuteBulkRemoveTags = useCallback(async () => {
    const remainingTagItems = originalDraftItems.filter(
      (it) => it.type === 'tag' && activeDraftItemIds.includes(it.id)
    );
    const hasOriginalTags = originalDraftItems.some((it) => it.type === 'tag');

    if (hasOriginalTags && remainingTagItems.length === 0) {
      Alert.alert('Action Blocked', 'Selected contacts must retain at least one tag.');
      return;
    }

    const removedItems = originalDraftItems.filter((it) => !activeDraftItemIds.includes(it.id));
    if (removedItems.length === 0) {
      setIsRemoveTagModalVisible(false);
      return;
    }

    const tagsToRemove = removedItems.filter((it) => it.type === 'tag').map((it) => it.value);
    const linksToRemove = removedItems.filter((it) => it.type === 'link').map((it) => it.value);

    setIsRemoveTagModalVisible(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const idsArray = Array.from(selectedContactIds);
    const activePhone = (await AsyncStorage.getItem('user_phone')) || userPhone;

    setAllContacts((prev) => {
      const nextContacts = prev.map((c) => {
        if (!selectedContactIds.has(c.id)) return c;

        let updatedTags = c.Tags;
        if (c.Tags && tagsToRemove.length > 0) {
          const existing = c.Tags.split(',').map((t) => t.trim()).filter(Boolean);
          const filtered = existing.filter(
            (t) => !tagsToRemove.map((rem) => rem.toLowerCase()).includes(t.toLowerCase())
          );
          updatedTags = filtered.join(', ');
        }

        let updatedLinks = (c as any).LinkedContactPhone;
        if (updatedLinks && linksToRemove.length > 0) {
          const existingL = updatedLinks.split(',').map((p: string) => p.trim().slice(-10)).filter(Boolean);
          const filteredL = existingL.filter((p: string) => !linksToRemove.includes(p));
          updatedLinks = filteredL.length > 0 ? filteredL.join(', ') : null;
        }

        return { ...c, Tags: updatedTags, LinkedContactPhone: updatedLinks };
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

    handleExitSelectionMode();

    try {
      const { data: currentRows, error: fetchError } = await supabase
        .from('Contacts_Table')
        .select('id, Tags, LinkedContactPhone')
        .in('id', idsArray);

      if (fetchError) throw fetchError;

      for (const row of currentRows || []) {
        let updatedTagsString = row.Tags;
        if (row.Tags && tagsToRemove.length > 0) {
          const existing: string[] = row.Tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);
          const filtered = existing.filter(
            (t: string) => !tagsToRemove.map((rem: string) => rem.toLowerCase()).includes(t.toLowerCase())
          );
          updatedTagsString = filtered.join(', ');
        }

        let updatedLinksString = row.LinkedContactPhone;
        if (row.LinkedContactPhone && linksToRemove.length > 0) {
          const existingL = row.LinkedContactPhone.split(',').map((p: string) => p.trim().slice(-10)).filter(Boolean);
          const filteredL = existingL.filter((p: string) => !linksToRemove.includes(p));
          updatedLinksString = filteredL.length > 0 ? filteredL.join(', ') : null;
        }

        await supabase
          .from('Contacts_Table')
          .update({
            Tags: updatedTagsString,
            LinkedContactPhone: updatedLinksString,
          })
          .eq('id', row.id);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to remove items from selected contacts');
      const storedPhone = await AsyncStorage.getItem('user_phone');
      fetchContactsData(storedPhone || userPhone);
    }
  }, [
    originalDraftItems,
    activeDraftItemIds,
    selectedContactIds,
    handleExitSelectionMode,
    fetchContactsData,
    fetchPinnedTags,
    userPhone,
  ]);

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
      saveSearchState(text, text, false);
    } else {
      setSelectedTag(null);
      saveSearchState(text, null, false);
    }
    setShowSuggestions(false);
    Keyboard.dismiss();
  }, [closeActiveSwipeable, saveSearchState]);

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
      saveSearchState('', null, false);
      return;
    }

    setSelectedTag((prev) => {
      if (prev === tag) {
        setSearchQuery('');
        setShowSuggestions(false);
        saveSearchState('', null, false);
        return null;
      } else {
        setSearchQuery(tag);
        setShowSuggestions(false);
        saveSearchState(tag, tag, false);
        return tag;
      }
    });
  }, [closeActiveSwipeable, saveSearchState]);

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
    setIsStarredFilterActive((prev) => {
      const next = !prev;
      saveSearchState('', null, next);
      return next;
    });
  }, [closeActiveSwipeable, saveSearchState]);

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
        saveSearchState(chosenTag, chosenTag || null, false);
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
  }, [navigation, userPhone, closeActiveSwipeable, saveSearchState]);

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
    saveSearchState('', null, false);
    searchInputRef.current?.focus();
  }, [saveSearchState]);

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

  const handleLinkedBadgeSinglePress = useCallback((targetContact: Contact) => {
    closeActiveSwipeable();
    const targetName = targetContact.Name ? targetContact.Name.trim() : '';
    if (!targetName) return;

    Haptics.selectionAsync();
    setSelectedTag(null);
    setIsStarredFilterActive(false);
    setSearchQuery(targetName);
    setShowSuggestions(false);
    saveSearchState(targetName, null, false);

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
  }, [closeActiveSwipeable, saveSearchState]);

  const handleLinkedBadgeLongPress = useCallback((targetContact: Contact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuickContactTarget(targetContact);
    setQuickContactModalVisible(true);
  }, []);

  const handleFollowupBellPress = useCallback((contact: Contact) => {
    closeActiveSwipeable();
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('Followups', {
      userPhone,
      filterContactId: contact.id,
    });
  }, [closeActiveSwipeable, navigation, userPhone]);

  const handleSwipeFollowupPress = useCallback((contact: Contact, hasActive: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (hasActive) {
      navigation.navigate('Followups', {
        userPhone,
        filterContactId: contact.id,
      });
    } else {
      navigation.navigate('Followups', {
        userPhone,
        openCreate: true,
        preselectedContact: contact,
      });
    }
  }, [navigation, userPhone]);

  const renderContactCard = useCallback(
    ({ item }: { item: Contact }) => {
      const hasActive = activeFollowupContactIdSet.has(item.id);

      return (
        <ContactCard
          item={item}
          isSelectionMode={isSelectionMode}
          isSelected={selectedContactIds.has(item.id)}
          hasActiveFollowup={hasActive}
          searchQuery={searchQuery}
          activeTerms={activeTerms}
          contactsMap={contactsMap}
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
          onFollowupBellPress={handleFollowupBellPress}
          onSwipeFollowupPress={handleSwipeFollowupPress}
          onLinkedBadgePress={handleLinkedBadgeSinglePress}
          onLinkedBadgeLongPress={handleLinkedBadgeLongPress}
          onSwipeOpen={(ref) => {
            if (openSwipeableRef.current && openSwipeableRef.current !== ref) {
              openSwipeableRef.current.close();
            }
            openSwipeableRef.current = ref;
          }}
        />
      );
    },
    [
      isSelectionMode,
      selectedContactIds,
      activeFollowupContactIdSet,
      searchQuery,
      activeTerms,
      contactsMap,
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
      handleFollowupBellPress,
      handleSwipeFollowupPress,
      handleLinkedBadgeSinglePress,
      handleLinkedBadgeLongPress,
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
                saveSearchState(text, null, isStarredFilterActive);
              } else {
                saveSearchState(text, selectedTag, isStarredFilterActive);
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

            {/* Permanent Default Starred Tag Badge */}
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

            {/* Permanent Default Follow-ups Tag Badge */}
            <TouchableOpacity
              style={[styles.tagBadge, styles.followupsTagBadge]}
              onPress={() => {
                closeActiveSwipeable();
                Haptics.selectionAsync().catch(() => {});
                navigation.navigate('Followups', { userPhone });
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="notifications" size={12} color="#059669" />
              <Text style={[styles.tagBadgeText, styles.followupsTagText]}>
                Follow-ups
              </Text>
              <View style={[styles.countBubble, styles.followupsCountBubble]}>
                <Text style={[styles.badgeCount, styles.followupsBadgeCount]}>
                  {activeFollowups.length}
                </Text>
              </View>
            </TouchableOpacity>

            {pinnedTags.map((tag, idx) => {
              const isActive = selectedTag === tag;
              const isLinkedContact = linkedPeopleMap.has(tag.toLowerCase());
              const count = itemCounts.get(tag.toLowerCase()) || 0;

              return (
                <TouchableOpacity
                  key={`pinned-${idx}`}
                  style={[styles.tagBadge, isActive && styles.tagBadgeActive]}
                  onPress={() => handleTagPress(tag)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={isLinkedContact ? 'link' : 'pricetag-outline'}
                    size={11}
                    color={isActive ? '#FFFFFF' : '#2563EB'}
                    style={{ marginRight: 2 }}
                  />
                  <Text style={[styles.tagBadgeText, isActive && styles.tagBadgeTextActive]}>{tag}</Text>
                  {count > 0 && (
                    <View style={[styles.countBubble, isActive && styles.countBubbleActive]}>
                      <Text style={[styles.badgeCount, isActive && styles.badgeCountActive]}>{count}</Text>
                    </View>
                  )}
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
    activeFollowups.length,
    pinnedTags,
    linkedPeopleMap,
    suggestions,
    allContacts.length,
    itemCounts,
    handleClearSearch,
    openTagsModal,
    openManageTagsModal,
    handleTagPress,
    handleToggleStarredTag,
    handleSelectSuggestion,
    closeActiveSwipeable,
    navigation,
    userPhone,
    saveSearchState,
  ]);

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
      filterLabel = `Filter: "${selectedTag}"`;
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

          <TouchableOpacity
            style={styles.recentTriggerBtn}
            onPress={() => {
              closeActiveSwipeable();
              navigation.navigate('RecentActivity', {
                allContacts,
                userPhone,
              });
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
          >
            <Ionicons name="time-outline" size={13.5} color="#515D6E" />
            <Text style={styles.recentTriggerText}>Recent</Text>
          </TouchableOpacity>
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
    closeActiveSwipeable,
    navigation,
    allContacts,
    userPhone,
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
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add" size={16} color="#FFFFFF" />
            <Text style={[styles.emptyActionText, { color: '#FFFFFF' }]}>Add Contact</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [loading, searchQuery, selectedTag, isStarredFilterActive, handleClearSearch, navigation]);

  const quickTargetLinkedContacts = useMemo(() => {
    if (!quickContactTarget) return [];
    const linkedField = (quickContactTarget as any).LinkedContactPhone;
    if (!linkedField) return [];

    const phones = linkedField
      .split(',')
      .map((p: string) => p.trim().slice(-10))
      .filter(Boolean);

    return phones
      .map((p: string) => contactsMap.get(p))
      .filter(Boolean) as Contact[];
  }, [quickContactTarget, contactsMap]);

  const draftTagsList = useMemo(() => {
    return originalDraftItems.filter(
      (it) => it.type === 'tag' && activeDraftItemIds.includes(it.id)
    );
  }, [originalDraftItems, activeDraftItemIds]);

  const draftLinksList = useMemo(() => {
    return originalDraftItems.filter(
      (it) => it.type === 'link' && activeDraftItemIds.includes(it.id)
    );
  }, [originalDraftItems, activeDraftItemIds]);

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
            <Text style={[styles.floatingActionLabel, { color: '#2563EB' }]}>Add Tag/Link</Text>
          </TouchableOpacity>

          <View style={styles.floatingActionDivider} />

          <TouchableOpacity
            style={styles.floatingActionBtn}
            onPress={openBulkRemoveTagModal}
            activeOpacity={0.75}
          >
            <Ionicons name="trash-bin-outline" size={18} color="#475569" />
            <Text style={[styles.floatingActionLabel, { color: '#334155' }]}>Remove</Text>
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

      {/* Quick View Linked Contact Modal with Click-Outside Backdrop Dismissal */}
      <Modal
        visible={quickContactModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setQuickContactModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setQuickContactModalVisible(false)}
        >
          <Pressable style={styles.quickModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.quickModalHeader}>
              <View style={styles.quickAvatar}>
                <Ionicons name="person" size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickModalName} numberOfLines={1}>
                  {quickContactTarget?.Name}
                </Text>
                <Text style={styles.quickModalPhone}>{quickContactTarget?.Phonenumber}</Text>
              </View>

              <View style={styles.quickHeaderActionsRow}>
                <TouchableOpacity
                  style={[styles.quickIconButton, styles.quickWhatsAppButton]}
                  onPress={() => {
                    setQuickContactModalVisible(false);
                    if (quickContactTarget?.Phonenumber) {
                      handleWhatsApp(quickContactTarget.Phonenumber);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickIconButton, styles.quickCallButton]}
                  onPress={() => {
                    setQuickContactModalVisible(false);
                    if (quickContactTarget?.Phonenumber) {
                      handleCall(quickContactTarget.Phonenumber);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="call" size={17} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickIconButton, styles.quickEditButton]}
                  onPress={() => {
                    setQuickContactModalVisible(false);
                    if (quickContactTarget?.id) {
                      navigation.navigate('EditContact', { id: quickContactTarget.id, userPhone });
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="create-outline" size={18} color="#2563EB" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setQuickContactModalVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 4 }}
                >
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.quickTagsContainer}>
              {quickContactTarget?.Tags &&
                quickContactTarget.Tags.split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((t, idx) => {
                    const isMatched = activeTerms.some((term) => t.toLowerCase().includes(term));

                    return (
                      <TouchableOpacity
                        key={`quick-tag-${idx}`}
                        style={[styles.tagPill, isMatched && styles.tagPillMatched]}
                        activeOpacity={0.7}
                        onPress={() => {
                          setQuickContactModalVisible(false);
                          handleTagPress(t);
                        }}
                      >
                        <Ionicons
                          name="pricetag-outline"
                          size={11}
                          color={isMatched ? '#1D4ED8' : '#2563EB'}
                          style={{ marginRight: 3 }}
                        />
                        <Text style={[styles.tagText, isMatched && styles.tagTextMatched]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}

              {quickTargetLinkedContacts.map((lContact, lIdx) => {
                const lName = lContact.Name || 'Contact';
                const isMatched = activeTerms.some((term) => lName.toLowerCase().includes(term));

                return (
                  <TouchableOpacity
                    key={`quick-linked-${lIdx}`}
                    style={[styles.tagPill, isMatched && styles.tagPillMatched]}
                    activeOpacity={0.75}
                    onPress={() => {
                      setQuickContactTarget(lContact);
                    }}
                  >
                    <Ionicons
                      name="link"
                      size={11}
                      color={isMatched ? '#1D4ED8' : '#2563EB'}
                      style={{ marginRight: 3 }}
                    />
                    <Text style={[styles.tagText, isMatched && styles.tagTextMatched]} numberOfLines={1}>
                      {lName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bulk Add Tags & Linked Contacts Modal */}
      <Modal
        visible={isTagModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsTagModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setIsTagModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add Tags / Link Contacts</Text>
            <Text style={styles.modalSubtitle}>
              Apply tags or link people to {selectedContactIds.size} selected contact{selectedContactIds.size > 1 ? 's' : ''}:
            </Text>

            {(stagedBulkTags.length > 0 || stagedBulkLinks.length > 0) && (
              <View style={styles.stagedChipsWrapContainer}>
                {stagedBulkTags.map((stagedTag, idx) => (
                  <View key={`staged-tag-${idx}`} style={styles.stagedChip}>
                    <Ionicons name="pricetag-outline" size={11} color="#1D4ED8" style={{ marginRight: 2 }} />
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

                {stagedBulkLinks.map((stagedLink, idx) => (
                  <View key={`staged-link-${idx}`} style={styles.stagedChip}>
                    <Ionicons name="link" size={11} color="#1D4ED8" style={{ marginRight: 2 }} />
                    <Text style={styles.stagedChipText} numberOfLines={1}>{stagedLink.name}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        setStagedBulkLinks((prev) => prev.filter((l) => l.phone !== stagedLink.phone));
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
              placeholder="Search tag or contact name/phone..."
              placeholderTextColor="#94A3B8"
              value={bulkTagInput}
              onChangeText={handleBulkTagChange}
              autoFocus={true}
              autoCorrect={false}
            />

            {(bulkDualSuggestions.tags.length > 0 || bulkDualSuggestions.contacts.length > 0) && (
              <View style={styles.modalSuggestionsDropdown}>
                <ScrollView
                  style={{ maxHeight: 220 }}
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="always"
                  showsVerticalScrollIndicator={true}
                >
                  {bulkDualSuggestions.tags.length > 0 && (
                    <View>
                      <View style={styles.modalDropdownSectionHeader}>
                        <Ionicons name="pricetag-outline" size={11} color="#64748B" />
                        <Text style={styles.modalDropdownSectionTitle}>Tags ({bulkDualSuggestions.tags.length})</Text>
                      </View>
                      {bulkDualSuggestions.tags.map((sug, idx) => (
                        <TouchableOpacity
                          key={`sug-tag-${idx}`}
                          style={styles.modalSuggestionRow}
                          onPress={() => handleSelectBulkTagSuggestion(sug)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="pricetag-outline" size={13} color="#2563EB" />
                          <Text style={styles.modalSuggestionText}>{sug}</Text>
                          <Text style={styles.modalSuggestionBadge}>Tag</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {bulkDualSuggestions.contacts.length > 0 && (
                    <View>
                      <View
                        style={[
                          styles.modalDropdownSectionHeader,
                          bulkDualSuggestions.tags.length > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: '#E2E8F0',
                            marginTop: 4,
                          },
                        ]}
                      >
                        <Ionicons name="people-outline" size={11} color="#64748B" />
                        <Text style={styles.modalDropdownSectionTitle}>
                          Link Contact (People) ({bulkDualSuggestions.contacts.length})
                        </Text>
                      </View>
                      {bulkDualSuggestions.contacts.map((contactItem) => {
                        const tagsArray = contactItem.sortedTags || [];
                        const remainingCount = tagsArray.length > 2 ? tagsArray.length - 2 : 0;

                        return (
                          <TouchableOpacity
                            key={`sug-contact-${contactItem.id || contactItem.cleanPhone}`}
                            style={styles.modalContactSuggestionRow}
                            onPress={() => handleSelectBulkLinkSuggestion(contactItem)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.modalAvatarSmall}>
                              <Ionicons name="person" size={13} color="#2563EB" />
                            </View>
                            <View style={{ flex: 1, justifyContent: 'center' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                                <Text style={styles.modalContactNameText} numberOfLines={1}>
                                  {contactItem.Name || 'Unnamed'}
                                </Text>
                                <Text style={styles.modalContactPhoneSub}>{contactItem.cleanPhone}</Text>
                              </View>
                              {tagsArray.length > 0 && (
                                <View style={styles.modalContactTagsPreviewRow}>
                                  {tagsArray.slice(0, 2).map((t: string, i: number) => {
                                    const isQueryMatch =
                                      bulkTagInput.trim() &&
                                      t.toLowerCase().includes(bulkTagInput.trim().toLowerCase());

                                    return (
                                      <View
                                        key={i}
                                        style={[
                                          styles.modalPreviewTagPill,
                                          isQueryMatch && styles.modalPreviewTagPillMatched,
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.modalPreviewTagText,
                                            isQueryMatch && styles.modalPreviewTagTextMatched,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {t}
                                        </Text>
                                      </View>
                                    );
                                  })}
                                  {remainingCount > 0 && (
                                    <Text style={styles.modalPreviewTagMore}>+{remainingCount} more</Text>
                                  )}
                                </View>
                              )}
                            </View>
                            <Ionicons name="link-outline" size={17} color="#2563EB" />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
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
                <Text style={styles.modalApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bulk Remove Selector Modal with Backdrop Dismissal */}
      <Modal
        visible={isRemoveTagModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsRemoveTagModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setIsRemoveTagModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Remove Tags / Linked Contacts</Text>
            <Text style={styles.modalSubtitle}>
              Tap the '✕' on any item to remove it from your {selectedContactIds.size} selected contact{selectedContactIds.size > 1 ? 's' : ''}.
            </Text>

            <ScrollView contentContainerStyle={{ paddingVertical: 4 }} style={{ maxHeight: 260 }} showsVerticalScrollIndicator={true}>
              {draftTagsList.length === 0 && draftLinksList.length === 0 ? (
                <Text style={styles.noDraftTagsText}>All items staged for removal.</Text>
              ) : (
                <>
                  {draftTagsList.length > 0 && (
                    <View style={styles.orderlySectionBlock}>
                      <View style={styles.orderlySectionHeader}>
                        <Ionicons name="pricetag-outline" size={12} color="#475569" />
                        <Text style={styles.orderlySectionTitle}>Tags ({draftTagsList.length})</Text>
                      </View>
                      <View style={styles.draftChipsContainer}>
                        {draftTagsList.map((item) => (
                          <View key={item.id} style={styles.draftChipStandard}>
                            <Ionicons name="pricetag-outline" size={12} color="#2563EB" style={{ marginRight: 2 }} />
                            <Text style={styles.draftChipStandardText} numberOfLines={1}>{item.label}</Text>
                            <TouchableOpacity
                              onPress={() => handleRemoveDraftItem(item)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="close-circle" size={15} color="#64748B" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {draftLinksList.length > 0 && (
                    <View style={[styles.orderlySectionBlock, draftTagsList.length > 0 && { marginTop: 12 }]}>
                      <View style={styles.orderlySectionHeader}>
                        <Ionicons name="people-outline" size={12} color="#475569" />
                        <Text style={styles.orderlySectionTitle}>Linked Contacts ({draftLinksList.length})</Text>
                      </View>
                      <View style={styles.draftChipsContainer}>
                        {draftLinksList.map((item) => (
                          <View key={item.id} style={styles.draftChipStandard}>
                            <Ionicons name="link" size={12} color="#2563EB" style={{ marginRight: 2 }} />
                            <Text style={styles.draftChipStandardText} numberOfLines={1}>{item.label}</Text>
                            <TouchableOpacity
                              onPress={() => handleRemoveDraftItem(item)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="close-circle" size={15} color="#64748B" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </>
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
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalApplyBtn,
                  activeDraftItemIds.length === originalDraftItems.length && { opacity: 0.5 },
                ]}
                onPress={handleExecuteBulkRemoveTags}
                disabled={activeDraftItemIds.length === originalDraftItems.length}
                activeOpacity={0.7}
              >
                <Text style={styles.modalApplyText}>Update Changes</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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
  followupsTagBadge: {
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  followupsTagText: {
    color: '#065F46',
    fontWeight: '700',
  },
  followupsCountBubble: {
    backgroundColor: '#D1FAE5',
  },
  followupsBadgeCount: {
    color: '#047857',
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
  recentTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  recentTriggerText: {
    fontSize: 12,
    color: '#515D6E',
    fontWeight: '700',
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
    width: 95,
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
  followupSwipeBtn: {
    backgroundColor: '#D97706',
  },
  newFollowupSwipeBtn: {
    backgroundColor: '#2563EB',
  },
  swipeActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
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
  followupBellButton: {
    backgroundColor: '#F59E0B',
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
  tagPillMatched: {
    backgroundColor: '#DBEAFE',
    borderColor: '#3B82F6',
    borderWidth: 1.5,
  },
  tagText: {
    color: '#081b50',
    fontSize: 12.3,
    fontWeight: '600',
  },
  tagTextMatched: {
    color: '#122866',
    fontWeight: '800',
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
  quickModalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  quickModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  quickAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickModalName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  quickModalPhone: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  quickHeaderActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickWhatsAppButton: {
    backgroundColor: '#25D366',
  },
  quickCallButton: {
    backgroundColor: '#2563EB',
  },
  quickEditButton: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quickTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
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
    marginBottom: 14,
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
    maxWidth: '100%',
  },
  stagedChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
    flexShrink: 1,
  },
  modalSuggestionsDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  modalDropdownSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#F8FAFC',
  },
  modalDropdownSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },
  modalSuggestionBadge: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: '#94A3B8',
    fontWeight: '700',
  },
  modalContactSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  modalAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContactNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  modalContactPhoneSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  modalContactTagsPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  modalPreviewTagPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalPreviewTagPillMatched: {
    backgroundColor: '#DBEAFE',
    borderWidth: 0.5,
    borderColor: '#93C5FD',
  },
  modalPreviewTagText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  modalPreviewTagTextMatched: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  modalPreviewTagMore: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  orderlySectionBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  orderlySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  orderlySectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  draftChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  draftChipStandard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    gap: 5,
    maxWidth: '100%',
  },
  draftChipStandardText: {
    fontSize: 12.3,
    fontWeight: '600',
    color: '#081b50',
    flexShrink: 1,
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
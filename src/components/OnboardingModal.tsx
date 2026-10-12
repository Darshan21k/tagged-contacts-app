import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const SLIDES = [
  // --- CONTACTS TAB ---
  {
    navTitle: 'Contacts',
    navIcon: 'people',
    title: 'Smart Search',
    description: 'Use the search bar at the top\n\n• Type multiple words to filter easily\n• Tap the tag icon to browse by tags',
    icon: 'search',
  },
  {
    navTitle: 'Contacts',
    navIcon: 'people',
    title: 'Starred & Priority',
    description: 'Quickly organize your important contacts\n\n• Single tap a star on contact to bookmark as starred\n• Long press a star on contact to set search priority (floats to the top of results)',
    icon: 'star',
  },
  {
    navTitle: 'Contacts',
    navIcon: 'people',
    title: 'Follow-up Reminders',
    description: 'Stay on top of your schedule\n\n• Click to view scheduled calls\n• Never miss a follow up',
    icon: 'notifications',
  },
  {
    navTitle: 'Contacts',
    navIcon: 'people',
    title: 'Quick Actions & Sorting',
    description: 'Manage your list effortlessly\n\n• Swipe contacts for fast actions \n(Swipe Right - Set & View Follow Up)\n(Swipe Left - Delete)\n• Tap "Recent" to view latest updates',
    icon: 'stats-chart',
  },

  // --- ADD CONTACT TAB ---
  {
    navTitle: 'Add Contact',
    navIcon: 'person-add',
    title: 'Grow Your Contacts',
    description: 'Save new connections in seconds\n\n• Use recent & mostly used tags to save time\n• Add phone number and notes',
    icon: 'add-circle',
  },

  // --- TAG SETTINGS TAB ---
  {
    navTitle: 'Tag Settings',
    navIcon: 'settings',
    title: 'Organize Your Tags',
    description: 'Keep your workspace tidy\n\n• Configure and manage your tags\n• Pin your favorites for fast access',
    icon: 'pricetags',
  },

  // --- PROFILE TAB ---
  {
    navTitle: 'Profile',
    navIcon: 'person-circle',
    title: 'Account, Lock & Support',
    description: 'Manage your app preferences\n\n• Secure your app with Screen Lock\n• Access Help & Support anytime',
    icon: 'shield-checkmark',
  },

  // --- GET STARTED ---
  {
    navTitle: 'Get Started',
    navIcon: 'rocket',
    title: 'Ready to Explore',
    description: 'You are all set!\n\n• Jump right into your workspace\n• Start organizing your contacts',
    icon: 'checkmark-circle',
  },
];

export default function OnboardingModal({ onComplete }: { onComplete: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  
  const handleFinish = async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      // Set the value now that the tour is done or skipped
      await AsyncStorage.setItem('@has_seen_onboarding', 'true'); 
    } catch (err) {
      console.warn('Failed to save onboarding state:', err);
    }
    onComplete(); // Tells ContactsScreen to close the modal
  };
  const handleNext = async () => {
    Haptics.selectionAsync().catch(() => {});
    if (currentIndex < SLIDES.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      await handleFinish();
    }
  };

  const slide = SLIDES[currentIndex];
  const primaryBlue = '#2563EB';
  const lightBlueBg = '#EFF6FF';

  return (
    <Modal visible={true} transparent={true} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Top Exact Navigation Context Bar & Skip */}
          <View style={styles.topRow}>
            <View style={[styles.navIndicatorBadge, { backgroundColor: lightBlueBg }]}>
              <Ionicons name={slide.navIcon as any} size={13} color={primaryBlue} style={{ marginRight: 5 }} />
              <Text style={[styles.navIndicatorText, { color: primaryBlue }]}>{slide.navTitle}</Text>
            </View>
            <TouchableOpacity style={styles.skipBtn} onPress={handleFinish} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          {/* Central Hero Icon */}
          <View style={[styles.iconContainer, { backgroundColor: lightBlueBg }]}>
            <Ionicons name={slide.icon as any} size={36} color={primaryBlue} />
          </View>

          {/* Title & Multi-Line Description */}
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.description}>{slide.description}</Text>

          {/* Dots Indicator */}
          <View style={styles.dotsRow}>
            {SLIDES.map((_, idx) => (
              <View
                key={idx}
                style={[styles.dot, currentIndex === idx && { backgroundColor: primaryBlue, width: 14 }]}
              />
            ))}
          </View>

          {/* Action Button */}
          <TouchableOpacity style={[styles.button, { backgroundColor: primaryBlue }]} onPress={handleNext}>
            <Text style={styles.buttonText}>
              {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next Feature'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  navIndicatorText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  skipBtn: {
    paddingVertical: 2,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 20,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  button: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
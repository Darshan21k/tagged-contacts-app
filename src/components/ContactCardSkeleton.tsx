import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

export default function ContactCardSkeleton() {
  const shimmerAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [shimmerAnim]);

  return (
    <Animated.View style={[styles.card, { opacity: shimmerAnim }]}>
      <View style={styles.headerRow}>
        <View style={styles.avatarPlaceholder} />
        <View style={styles.infoCol}>
          <View style={styles.nameLine} />
          <View style={styles.phoneLine} />
        </View>
        <View style={styles.actionsRow}>
          <View style={styles.circleBtn} />
          <View style={styles.circleBtn} />
        </View>
      </View>
      <View style={styles.tagsRow}>
        <View style={styles.tagPill} />
        <View style={styles.tagPillShort} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E2E8F0',
    marginRight: 12,
  },
  infoCol: {
    flex: 1,
    marginRight: 12,
  },
  nameLine: {
    width: '55%',
    height: 16,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    marginBottom: 6,
  },
  phoneLine: {
    width: '40%',
    height: 12,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  circleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E2E8F0',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  tagPill: {
    width: 70,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  tagPillShort: {
    width: 50,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
});
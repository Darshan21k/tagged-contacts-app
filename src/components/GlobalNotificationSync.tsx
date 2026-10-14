import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

export default function GlobalNotificationSync() {
  useEffect(() => {
    const runGlobalSync = async () => {
      try {
        const userPhone = await AsyncStorage.getItem('user_phone');
        if (!userPhone) return;

        const { data, error } = await supabase
          .from('Followups_Table')
          .select('*')
          .eq('Userphonenumber', userPhone);

        if (error || !data) return;

        // Run your smart sync logic here
        const Notifications = require('expo-notifications');
        if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') return;

        const activeFollowups = data.filter(
          item => !item.is_completed && item.due_date && item.due_time
        );

        const currentSignature = activeFollowups
          .map(item => `${item.id}-${item.due_date}-${item.due_time}`)
          .sort()
          .join(',');

        const CHECK_SYNC_KEY = '@last_notification_sync_state';
        const lastSignature = await AsyncStorage.getItem(CHECK_SYNC_KEY);

        if (lastSignature === currentSignature) return;

        if (typeof Notifications.cancelAllScheduledNotificationsAsync === 'function') {
          await Notifications.cancelAllScheduledNotificationsAsync();
        }

        const schedulingPromises = activeFollowups.map(async (item) => {
          const dueT = item.due_time;
          const match = dueT ? dueT.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i) : null;
          if (!match) return;

          let h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const mer = match[3].toUpperCase();
          if (mer === 'PM' && h < 12) h += 12;
          if (mer === 'AM' && h === 12) h = 0;

          const [y, mo, d] = item.due_date.split('-').map(Number);
          const triggerDate = new Date(y, mo - 1, d, h, m, 0);

          if (triggerDate.getTime() > Date.now()) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Follow-up Reminder ⏰',
                body: item.type === 'task' ? `Group Task: ${item.note}` : `Reminder: ${item.note}`,
                sound: true,
                data: { followupId: item.id },
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: triggerDate,
              },
            });
          }
        });

        await Promise.all(schedulingPromises);
        await AsyncStorage.setItem(CHECK_SYNC_KEY, currentSignature);
      } catch (err) {
        console.warn('Global notification sync background error:', err);
      }
    };

    runGlobalSync();
  }, []);

  return null;
}
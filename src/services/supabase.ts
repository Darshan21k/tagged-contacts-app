import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ghexbohcyujandwoempo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZXhib2hjeXVqYW5kd29lbXBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MjcxNjEsImV4cCI6MjA2MDQwMzE2MX0.JI8heYbjd8K8OL8EA1sZjCkXOZ4daRUCVu9GYgxhYJ8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
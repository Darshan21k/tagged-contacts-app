import React from 'react';
import { View, Text, Platform, StyleSheet, TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import AuthLoadingScreen from '../screens/AuthLoadingScreen';
import LoginPage from '../screens/LoginPage';
import RegistrationPage from '../screens/RegistrationPage';
import AccessBlockedPage from '../screens/AccessBlockedPage';
import EditContactPage from '../screens/EditContactPage';
import PopTagsModal from '../screens/PopTagsModal';
import AdminPage from '../screens/AdminPage';
import TagsPopupPage from '../screens/TagsPopupPage';

import HomeScreen from '../screens/HomeScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 14);

  return (
    <Tab.Navigator
      initialRouteName="Contacts"
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          elevation: 10,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: -3 },
          shadowRadius: 5,
          height: 62 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ color, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Home') iconName = focused ? 'add-circle' : 'add-circle-outline';
          else if (route.name === 'Contacts') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{
          tabBarLabel: 'Add',
          header: () => (
            <View style={[styles.compactHeaderContainer, { paddingTop: insets.top + 6 }]}>
              <View style={styles.compactHeaderRow}>
                <Text style={styles.compactHeaderTitle}>Add Contact</Text>
                <View style={styles.badgeIndicator} />
              </View>
            </View>
          ),
        }} 
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          header: () => (
            <View style={[styles.compactHeaderContainer, { paddingTop: insets.top + 6 }]}>
              <View style={styles.compactHeaderRow}>
                <Text style={styles.compactHeaderTitle}>Contacts</Text>
                <View style={styles.badgeIndicator} />
              </View>
            </View>
          ),
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{
          header: () => (
            <View style={[styles.compactHeaderContainer, { paddingTop: insets.top + 6 }]}>
              <View style={styles.compactHeaderRow}>
                <Text style={styles.compactHeaderTitle}>Profile</Text>
                <View style={styles.badgeIndicator} />
              </View>
            </View>
          ),
        }} 
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Stack.Navigator initialRouteName="AuthLoading">
      <Stack.Screen name="AuthLoading" component={AuthLoadingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Login" component={LoginPage} options={{ headerShown: false }} />
      <Stack.Screen name="Registration" component={RegistrationPage} options={{ title: 'Register' }} />
      <Stack.Screen name="AccessBlocked" component={AccessBlockedPage} options={{ headerShown: false }} />
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="EditContact" component={EditContactPage} options={{ title: 'Edit Contact' }} />
      <Stack.Screen
        name="PopTags"
        component={PopTagsModal}
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="ManageTags"
        component={TagsPopupPage}
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'fade',
        }}
      />
      <Stack.Screen 
        name="Admin" 
        component={AdminPage} 
        options={({ navigation }) => ({
          header: () => (
            <View style={[styles.compactHeaderContainer, { paddingTop: insets.top + 6 }]}>
              <View style={styles.compactHeaderRow}>
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ marginRight: 6 }}
                >
                  <Ionicons name="chevron-back" size={24} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.compactHeaderTitle}>Admin</Text>
                <View style={styles.badgeIndicator} />
              </View>
            </View>
          ),
        })} 
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  compactHeaderContainer: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 20,
    paddingBottom: 2,
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
});
# Project Rules & Architectural Specifications: ContactNow

You are an expert React Native & Expo developer working on the ContactNow Contact Management app.

## Current Stack
- **Framework & Runtime**: Expo SDK, React Native, TypeScript
- **Database & Backend**: Supabase (PostgreSQL)
  - `Userprofile` (`Name`, `Phonenumber`, `Mail_id`, `Login_Access`, `User_type`)
  - `Contacts_Table` (`id`, `Name`, `Phonenumber`, `Tags`, `OtherDetails`, `Userphonenumber`, `is_starred`, `LinkedContactPhone`, `created_at`)
  - `PinnedTags` (`Tagname`, `Userphonenumber`, `Pinned`)
  - `Followups_Table` (`id`, `Userphonenumber`, `type`, `contact_id`, `linked_contact_ids`, `target_tags`, `completed_contact_ids`, `note`, `due_date`, `due_time`, `is_completed`, `completed_at`, `created_at`, `updated_at`)
- **Storage & Plugins**: `AsyncStorage`, `expo-status-bar`, `expo-clipboard`, `expo-haptics`, `expo-linking`, `Ionicons`, `react-native-gesture-handler`, `react-native-safe-area-context`

---

## Implemented Features & Core UX Architecture

1. **Global App Shell & Status Bar**:
   - Translucent dark icons (`barStyle="dark-content"`, background `#F1F5F9`) preventing light header blending.
   - Screen-level safe-area inset handling (`useSafeAreaInsets`) with unified compact header bars (`compactHeaderContainer`).

2. **Contact Management & Data Model**:
   - Creating, viewing, filtering, editing, and deleting contacts directly in Supabase.
   - Timestamps stored as PostgreSQL `timestamptz` and consumed as ISO strings (`created_at?: string`) in TypeScript.

3. **ContactsScreen Enhancements**:
   - **Pinned Tags Bar**: Live in-memory count bubbles (e.g., `All (142)`, `Tag (12)`).
   - **Dynamic Starred Filter**: Starred pill badge placed beside `All` showing total favorite count; ranks favorites first during active searches.
   - **Interactive Tag Pills**: Clicking any tag pill locks the search/filter state and auto-scrolls to index 0.
   - **Linked Contacts Badges (`LinkedContactPhone`)**:
     - Single-tap on a linked contact badge applies that person's name to the search bar and filters the list immediately.
     - Long-press (300ms) on a linked contact badge opens the Quick View overview popup modal.
     - Quick View modal includes an interactive backdrop that closes on click-outside.
   - **Multi-Token Search Engine**: Evaluates query tokens across `Name`, `Phonenumber`, `Tags`, and `OtherDetails` (with "Found in Note" indicator).
   - **Sticky Counter Bar & Header**: Anchored bar displaying `Total Contacts: X` on the left and a subtle `Recent` activity trigger button on the far right.
   - **Single-Tap Phone Copy**: Tight hit-box target with clipboard copy, haptic feedback, and floating toast notification.
   - **Tab Press & Pull-to-Refresh**: Resets queries, deselects filters, scrolls to top, and fetches fresh Supabase data.
   - **Batch Multi-Select Mode**: Long-press activation, Select All / Deselect All, floating action toolbar for bulk star/unstar, bulk delete, and bulk tag/link modifications.

4. **Recent Activity Screen (`RecentActivityScreen.tsx`)**:
   - Dedicated stack screen accessed from the `Recent` trigger button.
   - Native stack header explicitly suppressed (`headerShown: false`) in favor of unified in-screen compact header.
   - Two top tabs: **Contacts** and **Recent Tags**.
   - Structured time filters: **Latest 10** (strictly caps results to 10 entries for performance), **1 Week**, **1 Month**, **6 Months**, and **1 Year** (shows all records in period).
   - Card time badges display relative time followed by exact date in brackets (e.g., `Today (27 Sep 2026)`, `3d ago (24 Sep 2026)`).
   - Tapping any tag inside cards or the Recent Tags list persists search state to `AsyncStorage` and navigates directly to the `Contacts` tab.

---

## Active Feature In Progress: Follow-ups & Reminders

### Specifications & Rules:
1. **Entry Triggers on `ContactsScreen`**:
   - **Top Pinned Tags Bar**: Amber pill `🔔 Follow-ups (X)` displaying the count of **all active reminders** (Overdue + Due Today + Upcoming; excluding completed).
   - **Contact Card Bell**: Solid amber bell button `🔔` displayed next to Call/WhatsApp **only** if that contact has active follow-up(s); hidden otherwise.
   - **Right Swipe Action (Tap-Only)**:
     - If contact has active follow-up: reveals amber `🔔 Follow-up` action. Tapping opens `FollowupsScreen` filtered to that contact.
     - If contact has NO active follow-up: reveals blue `🔔+ New Reminder` action. Tapping opens the Create Follow-up sheet pre-filled with this contact.
     - Swiping without tapping does not auto-trigger any action.
2. **Follow-ups Screen Architecture (`FollowupsScreen.tsx`)**:
   - Search bar supporting contact names, note text, and `#tags`.
   - 4 Top Category Tabs: **All (N)**, **Overdue (N)**, **Due Today (N)**, and **Upcoming (N)**.
   - **Individual Reminder Cards**: Checkmark toggle, note, contact metadata, WhatsApp/Call buttons, and 3-dots edit/delete menu.
   - **Group / Task Cards**:
     - **Note first**, followed by target tag pills below the note.
     - Expandable target contacts drawer (`View List ▾`) with individual contact checkmarks, progress tracker (e.g., `2/6 Completed`), and 1-tap undo capability.
   - **Completed Section**: Accordion/drawer at bottom (`Completed (X) ▾`) showing grayed-out items with `↺ Re-open` action.
   - **Clickable Tags & Contacts**: Tapping any tag or contact pushes `ContactsScreen`; pressing back returns to `FollowupsScreen` with exact scroll and open-drawer state preserved.
3. **Interactive Note Creation Input (`@` and `#` Shortcuts)**:
   - Placeholder explicitly states: `"e.g. Call regarding quotation. Use @ to mention contacts, # to add tags..."`.
   - Tap-able quick-insert buttons above note input: `[@ Mention Contact]` and `[# Add Tag]`.
   - Real-time suggestions row above keyboard displaying matching contacts on `@` and matching tags on `#`.

---

## Context Self-Update & Architecture Rules

1. **Dynamic Context Tracking**: Whenever new requirements, database tables, or plugins are introduced, immediately reflect them in the active project memory and update this file at milestone completion.
2. **Self-Updating Instruction Block**: Conclude responses to major feature additions with an updated copy of this instruction block for easy syncing with System Instructions.
3. **Code Integrity**: Retain all existing design tokens (e.g., `#2563EB`, `#F1F5F9`, `#0F172A`, `#D97706`), navigation routes, and state patterns. Always provide the full screen file when delivering updates.
4. **Scope Control**: Never install or introduce unrequested third-party packages unless explicitly instructed.
5. **Code Output**: Provide clean, production-ready, fully typed TypeScript code with zero placeholders or omissions.
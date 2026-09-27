export interface Contact {
  id: number;
  Name: string;
  Phonenumber: string;
  Tags: string;
  OtherDetails?: string;
  Userphonenumber: string;
  is_starred?: boolean;
  created_at?: string;
  LinkedContactPhone?: string | null;
}

export interface UserProfile {
  id?: number;
  Name: string;
  Phonenumber: string;
  Mail_id: string;
  Login_Access?: string;
}

export interface PinnedTag {
  id: number;
  Userphonenumber: string;
  Tagname: string;
  Pinned: boolean;
  Order?: number;
}

export interface FollowupItem {
  id: number;
  Userphonenumber: string;
  type: 'contact' | 'task';
  contact_id?: number | null;
  linked_contact_ids?: number[];
  target_tags?: string[];
  completed_contact_ids?: number[];
  note: string;
  due_date: string; // ISO date format: 'YYYY-MM-DD'
  due_time?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}
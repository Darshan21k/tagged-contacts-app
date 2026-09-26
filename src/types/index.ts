export interface Contact {
  id: number;
  Name: string;
  Phonenumber: string;
  Tags: string;
  OtherDetails?: string;
  Userphonenumber: string;
  is_starred?: boolean;
  created_at?: string;
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
export type AvatarState = {
  seed: string;
  selections: Record<string, string>;
  colors: Record<string, string>;
};

export type UserProfile = {
  id?: string;
  name: string;
  phone?: string;
  email: string;
  avatar: AvatarState;
  defaultViewMode?: 'mindmap' | 'outline';
};

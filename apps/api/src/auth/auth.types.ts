export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
};

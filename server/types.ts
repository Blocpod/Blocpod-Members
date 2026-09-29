export type Entitlements = Record<string, number | boolean>;
export type User = {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'moderator' | 'staff' | 'admin';
  organization_id: string | null;
  plan_id: string;
  membership_status: string;
  onboarded: boolean;
  profile: Record<string, unknown>;
  entitlements: Entitlements;
  email_verified: boolean;
};
export type AppEnv = { Variables: { user: User | null } };

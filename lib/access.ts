export type WorkspaceRole = 'editor' | 'hr' | 'approver' | 'viewer';
export type WorkspaceSession = {
  mode: 'cloudflare' | 'basic' | 'local';
  email: string;
  roles: WorkspaceRole[];
  canEdit: boolean;
  canValidate: boolean;
  canApprove: boolean;
  canManageApprovers: boolean;
};

// Only used by the existing local/Sites workspace and explicit legacy password mode.
export const legacySession: WorkspaceSession = {
  mode: 'local',
  email: '',
  roles: [],
  canEdit: true,
  canValidate: true,
  canApprove: true,
  canManageApprovers: true,
};

export function emailSession(
  email: string,
  roles: WorkspaceRole[],
): WorkspaceSession {
  return {
    mode: 'cloudflare',
    email,
    roles,
    canEdit: roles.includes('editor'),
    canValidate: roles.includes('hr'),
    canApprove: roles.includes('hr') || roles.includes('approver'),
    canManageApprovers: roles.includes('hr'),
  };
}

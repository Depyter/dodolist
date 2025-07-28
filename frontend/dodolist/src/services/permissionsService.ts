import pb from './pbClient';
import type { PocketBasePermissionsRecord } from '../lib/types';

/**
 * Utility class for accessing and mutating the 'permissions' collection.
 */
export class PermissionsService {
  static collection = 'permissions';

  /**
   * Get all permissions for a given list.
   */
  static async getPermissionsForList(listId: string): Promise<PocketBasePermissionsRecord[]> {
    // Example: return pb.collection(this.collection).getFullList({ filter: `task_list = '${listId}'` });
    throw new Error('Not implemented: getPermissionsForList');
  }

  /**
   * Get all permissions (invites) for the current user using PocketBase web API.
   */
  static async getPermissionsForCurrentUser(): Promise<PocketBasePermissionsRecord[]> {
    // Uses pb.authStore.model.id for current user
    const userId = pb.authStore.model?.id;
    if (!userId) throw new Error('No authenticated user');
    // Get all invites (status = 'invited') for the current user
    return await pb.collection(PermissionsService.collection).getFullList({
      filter: `user_id = '${userId}' && status = 'invited'`
    });
  }

  /**
   * Invite a user to a list (creates a permission record with status 'invited').
   */
  static async inviteUserToList({
    listId,
    userId,
    invitedBy,
    inviterEmail,
    permission
  }: { listId: string; userId: string; invitedBy: string; inviterEmail: string; permission: 'edit' | 'view' }) {
    const record = await pb.collection(PermissionsService.collection).create({
      task_list: listId,
      user_id: userId,
      invited_by: invitedBy,
      inviter_email: inviterEmail,
      status: 'invited',
      permission
    });
    return record;
  }

  /**
   * Accept an invite (sets status to 'active').
   */
  static async acceptInvite(permissionId: string) {
    // Example: return pb.collection(this.collection).update(permissionId, { status: 'active' });
    throw new Error('Not implemented: acceptInvite');
  }

  /**
   * Reject an invite (sets status to 'rejected').
   */
  static async rejectInvite(permissionId: string) {
    // Example: return pb.collection(this.collection).update(permissionId, { status: 'rejected' });
    throw new Error('Not implemented: rejectInvite');
  }

  /**
   * Remove a collaborator (delete the permission record).
   */
  static async removeCollaborator(permissionId: string) {
    // Example: return pb.collection(this.collection).delete(permissionId);
    throw new Error('Not implemented: removeCollaborator');
  }

  /**
   * Change a collaborator's permission (edit/view).
   */
  static async changePermission(permissionId: string, permission: 'edit' | 'view') {
    // Example: return pb.collection(this.collection).update(permissionId, { permission });
    throw new Error('Not implemented: changePermission');
  }

  /**
   * Lookup a user by email using the custom backend endpoint.
   */
  static async getUserIdByEmail(email: string): Promise<string | null> {
    try {
      const res = await fetch('/api/lookup-user-by-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) return null;
      const user = await res.json();
      return user?.id || null;
    } catch (e) {
      return null;
    }
  }
}

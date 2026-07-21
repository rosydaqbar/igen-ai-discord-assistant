export class PermissionChecker {
  async assertAllowed(skill, args, context) {
    if (!context.memberPermissions?.has && !context.memberPermissions) return;
    for (const permission of skill.permissions?.user ?? []) {
      if (!hasPermission(context.memberPermissions, permission)) {
        throw new Error(`Caller lacks Discord permission: ${permission}`);
      }
    }
  }
}

function hasPermission(permissions, permission) {
  if (typeof permissions.has === 'function') return permissions.has(permission);
  if (Array.isArray(permissions)) return permissions.includes(permission) || permissions.includes('Administrator');
  return false;
}

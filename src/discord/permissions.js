export class PermissionChecker {
  async assertAllowed(skill, args, context) {
    if (!context.memberPermissions?.has && !context.memberPermissions) return;
    for (const permission of skill.permissions?.user ?? []) {
      if (!hasPermission(context.memberPermissions, permission)) {
        throw new Error(`Caller lacks Discord permission: ${permission}`);
      }
    }
  }

  getAllowedSkillNames(registry, context) {
    const perms = context.memberPermissions;
    if (!perms) return registry.all().map((s) => s.name);

    const allSkills = registry.all();
    const discordSkills = allSkills.filter((s) => s.discord);
    const userHasAnyDiscordPerm = discordSkills.some((s) =>
      (s.permissions?.user ?? []).some((p) => hasPermission(perms, p)),
    );

    return allSkills.filter((skill) => {
      if (skill.terminal) return true;
      if (!userHasAnyDiscordPerm) return false;
      const required = skill.permissions?.user ?? [];
      if (required.length === 0) return true;
      return required.every((p) => hasPermission(perms, p));
    }).map((s) => s.name);
  }
}

function hasPermission(permissions, permission) {
  if (typeof permissions.has === 'function') return permissions.has(permission);
  if (Array.isArray(permissions)) return permissions.includes(permission) || permissions.includes('Administrator');
  return false;
}

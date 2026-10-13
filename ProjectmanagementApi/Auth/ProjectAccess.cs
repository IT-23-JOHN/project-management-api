using ProjectmanagementApi.Controllers;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;

namespace ProjectmanagementApi.Auth;

/// <summary>
/// Who may do what on a project. These are the same rules ProjectsController uses
/// (RoleOn / CanEdit), kept in one place so other controllers can't drift from them.
/// </summary>
public static class ProjectAccess
{
    /// <summary>Roles that may change things inside a project (add, move, assign, delete tasks).</summary>
    // "Manager" and "Member" are older role names from the first version of the database.
    public static bool CanEdit(string? role) => role is "Admin" or "Owner" or "Manager" or "Editor" or "Member";

    /// <summary>
    /// The caller's role on one project: "Admin", "Owner", "Editor", "Viewer" (or an older name),
    /// or null when they have no access. A collaborator whose invite hasn't been accepted has no access.
    /// </summary>
    public static async Task<string?> RoleOnAsync(AppDbContext db, SessionUser me, Project project)
    {
        if (me.Role == "Admin") return "Admin";
        if (project.OwnerId == me.Id) return "Owner";
        var member = await db.ProjectMembers.FindAsync(project.Id, me.Id);
        return member is not null && member.AcceptedAt != null ? member.Role : null;
    }
}

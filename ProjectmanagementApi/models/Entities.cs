namespace ProjectmanagementApi.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public string AuthCodeLast4 { get; set; } = string.Empty;
    public string Role { get; set; } = "User";
    public bool IsActive { get; set; } = true;
    public string ThemePreference { get; set; } = "System";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
}

public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int SeqNo { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerId { get; set; }
    public string Status { get; set; } = "Active";
    public string? StatusReason { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? TargetEndDate { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedById { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public User Owner { get; set; } = null!;
}

public class ProjectMember
{
    public Guid ProjectId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "Viewer";
    public Guid? InvitedById { get; set; }
    public DateTime JoinedAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public Project Project { get; set; } = null!;
    public User User { get; set; } = null!;
}

public class TaskItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Guid? AssigneeId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Status { get; set; } = "Todo";
    public string Priority { get; set; } = "Medium";
    public DateTime? DueDate { get; set; }
    public decimal? EstimatedHours { get; set; }
    public DateTime CreatedAt { get; set; }
    public Project Project { get; set; } = null!;
    public User? Assignee { get; set; }
}

public class TaskComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TaskId { get; set; }
    public Guid AuthorId { get; set; }
    public string Body { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public TaskItem Task { get; set; } = null!;
    public User Author { get; set; } = null!;
}

public class AuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? ActorUserId { get; set; }
    public string ActionType { get; set; } = string.Empty;
    public string TargetType { get; set; } = string.Empty;
    public Guid TargetId { get; set; }
    public string? Details { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>A one-time sign-in code. Only a hash is stored; rows are kept for rate limiting and then cleaned up.</summary>
public class OtpCode
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Destination { get; set; } = string.Empty;   // lower-cased email or phone
    public string CodeHash { get; set; } = string.Empty;
    public string Purpose { get; set; } = "login";
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTime? UsedAt { get; set; }                       // set when consumed, locked or superseded
}

/// <summary>A signed-in browser session. Only a hash of the token is stored.</summary>
public class UserSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public DateTime ExpiresAt { get; set; }                     // sliding idle expiry
    public DateTime AbsoluteExpiresAt { get; set; }             // hard cap, never extended
    public DateTime? RevokedAt { get; set; }
    public Guid? CurrentProjectId { get; set; }
    public string? ProjectRole { get; set; }
    public string? UserAgent { get; set; }
}

namespace ProjectmanagementApi.Services;

public interface IEmailSender
{
    /// <summary>Whether SMTP is configured. When false, nothing can be sent.</summary>
    bool IsConfigured { get; }

    /// <summary>Emails a one-time sign-in code. Throws if delivery fails.</summary>
    Task SendOtpAsync(string toEmail, string code, int expiresInMinutes, CancellationToken cancellationToken = default);

    /// <summary>Emails someone that they were added to a project. Throws if delivery fails.</summary>
    Task SendInviteAsync(string toEmail, string invitedBy, string projectName, string role, string appUrl, CancellationToken cancellationToken = default);
}

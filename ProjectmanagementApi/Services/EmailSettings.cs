namespace ProjectmanagementApi.Services;

/// <summary>
/// SMTP settings, bound from the "Email" section of configuration.
/// Keep Username/Password out of source control (use user-secrets or environment variables).
/// </summary>
public class EmailSettings
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    /// <summary>Use STARTTLS/SSL. Keep true for Gmail, Outlook, Brevo, SendGrid, etc.</summary>
    public bool EnableSsl { get; set; } = true;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromAddress { get; set; } = "";
    public string FromName { get; set; } = "Project Hub";

    /// <summary>True when enough is configured to actually send mail.</summary>
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(FromAddress);
}

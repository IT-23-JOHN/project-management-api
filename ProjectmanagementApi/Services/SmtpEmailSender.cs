using System.Net;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace ProjectmanagementApi.Services;

/// <summary>
/// Sends the sign-in code over SMTP using MailKit.
/// Port 465 uses an implicit TLS connection (what Gmail expects on 465);
/// any other port uses STARTTLS when <see cref="EmailSettings.EnableSsl"/> is true.
/// </summary>
public class SmtpEmailSender : IEmailSender
{
    private readonly EmailSettings _settings;

    public SmtpEmailSender(IOptions<EmailSettings> options) => _settings = options.Value;

    public bool IsConfigured => _settings.IsConfigured;

    /// <summary>Picks the TLS mode from the port and the EnableSsl setting.</summary>
    public static SecureSocketOptions ChooseSecurity(int port, bool enableSsl) =>
        port == 465 ? SecureSocketOptions.SslOnConnect
        : enableSsl ? SecureSocketOptions.StartTls
        : SecureSocketOptions.None;

    public async Task SendOtpAsync(string toEmail, string code, int expiresInMinutes, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Email delivery is not configured.");

        var text =
            $"Your Project Hub sign-in code is {code}.\n\n" +
            $"It expires in {expiresInMinutes} minutes. If you didn't request it, you can ignore this email.";

        var html = $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;background:#f3f5f4;padding:32px 0">
              <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px;border:1px solid #e6e9e7">
                <div style="font-size:13px;color:#7b8780;letter-spacing:.08em;text-transform:uppercase">Project Hub</div>
                <h1 style="margin:12px 0 8px;font-size:22px;color:#0e1c15">Your sign-in code</h1>
                <p style="margin:0 0 20px;color:#4b5851;font-size:15px;line-height:1.5">
                  Enter this code to finish signing in. It expires in {expiresInMinutes} minutes.
                </p>
                <div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;color:#0f4d33;background:#e3f3ea;border-radius:14px;padding:18px 0">{code}</div>
                <p style="margin:20px 0 0;color:#7b8780;font-size:13px;line-height:1.5">
                  If you didn't request this code, you can safely ignore this email. Never share this code with anyone.
                </p>
              </div>
            </div>
            """;

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_settings.FromName, _settings.FromAddress));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = $"Your Project Hub sign-in code: {code}";
        message.Body = new BodyBuilder { TextBody = text, HtmlBody = html }.ToMessageBody();

        await SendAsync(message, cancellationToken);
    }

    public async Task SendInviteAsync(string toEmail, string invitedBy, string projectName, string role, string appUrl, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Email delivery is not configured.");

        var who = WebUtility.HtmlEncode(invitedBy);
        var project = WebUtility.HtmlEncode(projectName);
        var roleText = WebUtility.HtmlEncode(role);
        var link = WebUtility.HtmlEncode(appUrl);

        var text =
            $"{invitedBy} added you to the project \"{projectName}\" on Project Hub as {role}.\n\n" +
            $"Sign in to open it: {appUrl}";

        var html = $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;background:#f3f5f4;padding:32px 0">
              <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px;border:1px solid #e6e9e7">
                <div style="font-size:13px;color:#7b8780;letter-spacing:.08em;text-transform:uppercase">Project Hub</div>
                <h1 style="margin:12px 0 8px;font-size:22px;color:#0e1c15">You've been added to a project</h1>
                <p style="margin:0 0 20px;color:#4b5851;font-size:15px;line-height:1.5">
                  <strong>{who}</strong> added you to <strong>{project}</strong> as <strong>{roleText}</strong>.
                </p>
                <a href="{link}" style="display:inline-block;background:#1f7a4d;color:#ffffff;text-decoration:none;font-weight:600;border-radius:999px;padding:12px 24px">Open Project Hub</a>
                <p style="margin:20px 0 0;color:#7b8780;font-size:13px;line-height:1.5">
                  Sign in with this email address to see the project.
                </p>
              </div>
            </div>
            """;

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_settings.FromName, _settings.FromAddress));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = $"You've been added to {projectName} on Project Hub";
        message.Body = new BodyBuilder { TextBody = text, HtmlBody = html }.ToMessageBody();

        await SendAsync(message, cancellationToken);
    }

    private async Task SendAsync(MimeMessage message, CancellationToken cancellationToken)
    {
        using var client = new SmtpClient { Timeout = 15000 };

        await client.ConnectAsync(_settings.Host, _settings.Port, ChooseSecurity(_settings.Port, _settings.EnableSsl), cancellationToken);

        if (!string.IsNullOrWhiteSpace(_settings.Username))
            await client.AuthenticateAsync(_settings.Username, _settings.Password, cancellationToken);

        await client.SendAsync(message, cancellationToken);

        try { await client.DisconnectAsync(true, cancellationToken); }
        catch { /* the email was already accepted; a failed goodbye must not count as a failed send */ }
    }
}

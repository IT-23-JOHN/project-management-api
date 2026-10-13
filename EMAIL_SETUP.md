# Sending sign-in codes by email

> Sending now uses the **MailKit** package over **port 465** (implicit TLS). In the backend folder run once:
> `dotnet add package MailKit`

The API now emails the 6-digit sign-in code to the address the user typed.
The code is **never** returned to the browser when email is configured.

## One-time setup (Gmail)

1. Sign in to the Gmail account that will SEND the codes (e.g. your project's Gmail).
2. Turn on **2-Step Verification**: https://myaccount.google.com/security
3. Create an **App password**: https://myaccount.google.com/apppasswords
   (name it "Project Hub"). Google shows a 16-character password. Copy it WITHOUT spaces.
4. In PowerShell, from the BACKEND project folder (the one containing `ProjectmanagementApi.csproj`):

   ```powershell
   cd "C:\Users\JOHN KIBUNA\source\repos\ProjectmanagementApi\ProjectmanagementApi"
   dotnet user-secrets set "Email:Username"    "your-sender@gmail.com"
   dotnet user-secrets set "Email:Password"    "abcdefghijklmnop"
   dotnet user-secrets set "Email:FromAddress" "your-sender@gmail.com"
   ```

   These are stored outside the project (not in git).
5. **Restart the API** from Visual Studio. Sign in again: the code arrives by email.

Check what is stored with: `dotnet user-secrets list`

## Behaviour

| Situation                                   | Result                                              |
|---------------------------------------------|-----------------------------------------------------|
| Email configured (any environment)          | Code is emailed. Never shown in the response.       |
| Not configured + Development                | Code is shown on the login screen (so you can work).|
| Not configured + Production                 | Sign-in is refused (503). Nothing is leaked.        |
| Phone number entered (no SMS provider yet)  | Refused with a message to use email.                |
| SMTP fails + Development                    | The code is printed in the API console window and still works; the login screen says so and shows the reason. |
| SMTP fails + Production                     | "Couldn't send the email" (502). Doesn't count toward the 3/hour limit. |

## Other providers

Change `Host`/`Port` in `appsettings.json` (and use that provider's credentials in user-secrets):
Outlook `smtp.office365.com:587`, Brevo `smtp-relay.brevo.com:587`, SendGrid `smtp.sendgrid.net:587`
(username `apikey`). Port 465 (implicit TLS) and 587 (STARTTLS) are both supported; set `Port` accordingly.

## Production

Set environment variables instead of user-secrets, e.g. `Email__Host`, `Email__Username`,
`Email__Password`, `Email__FromAddress`.

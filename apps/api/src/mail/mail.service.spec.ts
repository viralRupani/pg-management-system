import type { AppEnv } from "../config/env";
import type { EmailMessage, EmailProvider } from "./email-provider";
import { MailService } from "./mail.service";
import { MailTemplateService } from "./mail-template.service";

/**
 * Exercises the REAL Handlebars templates (compiled from src/mail/templates) end
 * to end through MailService into a capturing transport. This is the coverage
 * the e2e suite gives implicitly — made explicit and assertable here.
 */
describe("MailService — password reset", () => {
  const env = { MAIL_FROM_NAME: "PG Manager" } as AppEnv;
  const resetUrl = "https://admin.example.com/reset-password?token=abc123";

  let sent: EmailMessage[];
  let mail: MailService;

  beforeAll(() => {
    const templates = new MailTemplateService();
    templates.onModuleInit(); // compile templates (also proves they load)

    sent = [];
    const transport: EmailProvider = {
      async send(message) {
        sent.push(message);
      },
    };

    mail = new MailService(transport, env, templates);
  });

  it("renders the reset link into BOTH the html and text parts", async () => {
    await mail.sendPasswordResetEmail("manager@example.com", {
      resetUrl,
      ttlMinutes: 15,
    });

    expect(sent).toHaveLength(1);
    const msg = sent[0]!;
    expect(msg.to).toBe("manager@example.com");
    expect(msg.subject).toBe("Reset your PG Manager password");
    // Text part is unescaped → the raw URL must be present verbatim (a broken
    // URL here = a broken email in text-only clients).
    expect(msg.text).toContain(resetUrl);
    // HTML part escapes values for safety (`=` → `&#x3D;`, which clients decode
    // in href), so assert the link is present via its token + path, not raw.
    expect(msg.html).toContain("abc123");
    expect(msg.html).toContain("reset-password");
    // Layout wrapped the content, and the expiry made it through both parts.
    expect(msg.html).toContain("<!DOCTYPE html>");
    expect(msg.html).toContain("15 minutes");
    expect(msg.text).toContain("15 minutes");
  });
});

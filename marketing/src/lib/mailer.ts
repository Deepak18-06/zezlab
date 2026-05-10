import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (SMTP_HOST) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }

  // Console stub — logs instead of sending in dev/test
  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });
}

const transport = createTransport();
const FROM = process.env.SMTP_FROM ?? "marketing@localhost";

export async function sendEmail(msg: MailMessage): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.log(
      `[mailer stub] To: ${msg.to} | Subject: ${msg.subject}\n${msg.text ?? "(html only)"}`
    );
    return;
  }

  await transport.sendMail({
    from: FROM,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
}

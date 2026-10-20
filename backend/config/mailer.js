import nodemailer from "nodemailer";
import { promises as fs } from "node:fs";

let transporter = null;
let isTestAccount = false;
let genericFallbackTransporter = null;
let brevoSmtpAuthenticationFailed = false;

const parseEmailAddress = (value, fallbackName = "ACGC Services") => {
  const address = String(value || "").trim();
  const match = address.match(/^(?:"?([^"<]+)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>$/);
  if (match) {
    return {
      name: (match[1] || fallbackName).trim(),
      email: match[2].trim(),
    };
  }

  return {
    name: fallbackName,
    email: address,
  };
};

const resolveSenderAddress = (mailOptions) => {
  const brevoSender = process.env.BREVO_SENDER_EMAIL?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  const configuredSender = brevoSender || emailFrom;
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (isProduction && !configuredSender) {
    throw new Error("Email sender is not configured. Set EMAIL_FROM to a verified sender address; for Brevo, set BREVO_SENDER_EMAIL to that same verified address.");
  }

  const sender = configuredSender || mailOptions.from;
  if (isProduction) {
    const parsedSender = parseEmailAddress(sender);
    const domain = parsedSender.email.split("@").at(-1)?.toLowerCase();
    const emailFromDomain = parseEmailAddress(emailFrom).email.split("@").at(-1)?.toLowerCase();
    const brevoSenderDomain = parseEmailAddress(brevoSender).email.split("@").at(-1)?.toLowerCase();
    if (!domain || domain === "localhost" || domain.endsWith(".local") || domain === "example.com") {
      throw new Error("Production email requires a real, verified sender domain. Configure EMAIL_FROM and the matching provider sender.");
    }
    if (emailFromDomain && brevoSenderDomain && emailFromDomain !== brevoSenderDomain) {
      throw new Error("EMAIL_FROM and BREVO_SENDER_EMAIL must use the same domain so sender authentication can align.");
    }
  }
  return sender;
};

const normalizeRecipients = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap(normalizeRecipients);
  }

  return String(value || "")
    .split(",")
    .map((entry) => parseEmailAddress(entry))
    .filter((entry) => entry.email);
};

const normalizeAttachment = async (attachment) => {
  if (!attachment) return null;

  const name = attachment.filename || attachment.name || "attachment";
  const contentId = attachment.cid || attachment.contentId;
  const contentType = attachment.contentType || attachment.content_type;
  const inlineMetadata = {
    ...(contentId ? { contentId } : {}),
    ...(contentType ? { contentType } : {}),
  };
  if (attachment.href || attachment.url) {
    return { name, url: attachment.href || attachment.url, ...inlineMetadata };
  }

  if (attachment.path) {
    const content = await fs.readFile(attachment.path);
    return { name, content: content.toString("base64"), ...inlineMetadata };
  }

  if (attachment.content) {
    const content = Buffer.isBuffer(attachment.content)
      ? attachment.content
      : Buffer.from(String(attachment.content));
    return { name, content: content.toString("base64"), ...inlineMetadata };
  }

  return null;
};

const sendBrevoMail = async (mailOptions) => {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return null;

  const senderSource = process.env.BREVO_SENDER_EMAIL || mailOptions.from || process.env.EMAIL_FROM;
  const sender = parseEmailAddress(senderSource, process.env.BREVO_SENDER_NAME || process.env.SMTP_SENDER_NAME || "ACGC Services");
  const to = normalizeRecipients(mailOptions.to);
  if (!sender.email) {
    throw new Error("Missing Brevo sender address. Set EMAIL_FROM or BREVO_SENDER_EMAIL.");
  }
  if (to.length === 0) {
    throw new Error("Missing email recipient.");
  }

  const attachments = (await Promise.all((mailOptions.attachments || []).map(normalizeAttachment))).filter(Boolean);
  const payload = {
    sender,
    to,
    subject: mailOptions.subject || "",
    htmlContent: mailOptions.html || undefined,
    textContent: mailOptions.text || undefined,
    attachment: attachments.length > 0 ? attachments : undefined,
  };

  const cc = normalizeRecipients(mailOptions.cc);
  const bcc = normalizeRecipients(mailOptions.bcc);
  if (cc.length > 0) payload.cc = cc;
  if (bcc.length > 0) payload.bcc = bcc;
  if (mailOptions.replyTo) payload.replyTo = parseEmailAddress(mailOptions.replyTo);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let responseBody = null;
  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    const message = typeof responseBody?.message === "string"
      ? responseBody.message
      : `Brevo API returned ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.provider = "brevo";
    error.response = responseBody;
    throw error;
  }

  return {
    provider: "brevo",
    messageId: responseBody?.messageId,
    response: responseBody,
  };
};

const getSmtpConfig = () => {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_PASSWORD,
    SMTP_SECURE,
    EMAIL_FROM,
  } = process.env;
  const smtpPassword = SMTP_PASS || SMTP_PASSWORD;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !smtpPassword || !EMAIL_FROM) {
    if (process.env.NODE_ENV !== "production") {
      return null;
    }

    throw new Error(
      "Missing SMTP environment variables. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS or SMTP_PASSWORD, and EMAIL_FROM."
    );
  }

  const portNumber = Number(SMTP_PORT);
  const secure = String(SMTP_SECURE || "").toLowerCase() === "true" || portNumber === 465;
  const requireTLS = portNumber === 587;

  return {
    host: SMTP_HOST,
    port: portNumber,
    secure,
    requireTLS,
    auth: {
      user: SMTP_USER,
      pass: smtpPassword.replace(/\s+/g, ""),
    },
    tls: {
      rejectUnauthorized: true,
    },
  };
};

const getBrevoSmtpConfig = () => {
  const login = process.env.BREVO_SMTP_LOGIN || process.env.BREVO_SMTP_USER;
  const key = process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASSWORD;
  if (!login || !key) return null;

  const portNumber = Number(process.env.BREVO_SMTP_PORT || 587);
  const secure = portNumber === 465;

  return {
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: portNumber,
    secure,
    requireTLS: !secure,
    auth: {
      user: login.trim(),
      pass: key.replace(/\s+/g, ""),
    },
    tls: {
      rejectUnauthorized: true,
    },
  };
};

const createTransporter = async () => {
  if (transporter) {
    return transporter;
  }

  const smtpConfig = (brevoSmtpAuthenticationFailed ? null : getBrevoSmtpConfig()) || getSmtpConfig();
  if (smtpConfig) {
    transporter = nodemailer.createTransport({
      ...smtpConfig,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 60000,
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    isTestAccount = true;
    console.info("SMTP config missing; using Nodemailer test account for development.");
  }

  return transporter;
};

const sendSmtpMail = async (mailOptions) => {
  const transport = await createTransporter();
  const result = await transport.sendMail(mailOptions);

  if (isTestAccount) {
    const previewUrl = nodemailer.getTestMessageUrl(result);
    if (previewUrl) {
      console.info("Test email preview URL:", previewUrl);
    }
  }

  return result;
};

const createPooledTransport = (smtpConfig) => nodemailer.createTransport({
  ...smtpConfig,
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 60000,
});

const sendGenericSmtpMail = async (mailOptions) => {
  const smtpConfig = getSmtpConfig();
  if (!smtpConfig) {
    throw new Error("Generic SMTP fallback is not configured.");
  }

  genericFallbackTransporter ||= createPooledTransport(smtpConfig);
  return genericFallbackTransporter.sendMail(mailOptions);
};

const hasSmtpCredentials = () =>
  Boolean(
    (process.env.BREVO_SMTP_LOGIN || process.env.BREVO_SMTP_USER) &&
    (process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASSWORD)
  ) || Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD));

const hasGenericSmtpCredentials = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD));

const hasBrevoSmtpCredentials = () =>
  Boolean(
    (process.env.BREVO_SMTP_LOGIN || process.env.BREVO_SMTP_USER) &&
    (process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASSWORD)
  );

export const sendMail = async (mailOptions) => {
  const normalizedMailOptions = { ...mailOptions, from: resolveSenderAddress(mailOptions) };
  let lastProviderError = null;

  if (process.env.BREVO_API_KEY?.trim()) {
    try {
      return await sendBrevoMail(normalizedMailOptions);
    } catch (error) {
      lastProviderError = error;
      console.warn("Brevo API send failed; trying SMTP providers.", {
        status: error.status,
        message: error.message,
      });
    }
  }

  if (hasBrevoSmtpCredentials() && !brevoSmtpAuthenticationFailed) {
    try {
      return await sendSmtpMail(normalizedMailOptions);
    } catch (error) {
      lastProviderError = error;
      if (error.code === "EAUTH") {
        brevoSmtpAuthenticationFailed = true;
        transporter?.close();
        transporter = null;
      }
      console.warn("Brevo SMTP send failed; trying the next configured email provider.", {
        code: error.code,
        responseCode: error.responseCode,
        message: error.message,
      });
    }
  }

  if (hasGenericSmtpCredentials()) {
    try {
      return await sendGenericSmtpMail(normalizedMailOptions);
    } catch (error) {
      lastProviderError = error;
    }
  }

  if (!hasSmtpCredentials() && !process.env.BREVO_API_KEY?.trim() && process.env.NODE_ENV !== "production") {
    try {
      console.warn("No production mail provider is configured; using a Nodemailer test account for development email.");
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      isTestAccount = true;
      return await sendSmtpMail(normalizedMailOptions);
    } catch (error) {
      lastProviderError = error;
    }
  }

  if (lastProviderError) {
    console.error("All configured email providers failed:", lastProviderError);
    throw lastProviderError;
  }

  return await sendSmtpMail(normalizedMailOptions);
};

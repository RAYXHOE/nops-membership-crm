import { SolapiMessageService } from "solapi";

function configured(value) {
  return Boolean(value && String(value).trim());
}

function summarizeError(error) {
  if (!error || typeof error !== "object") {
    return { name: "Error", message: String(error) };
  }

  const value = error;
  const failedMessageList = Array.isArray(value.failedMessageList)
    ? value.failedMessageList.map((message) => ({
        type: message?.type ?? null,
        statusCode: message?.statusCode ?? null,
        statusMessage: message?.statusMessage ?? null,
      }))
    : [];

  return {
    name: value.name ?? "Error",
    message: value.message ?? String(error),
    statusCode: value.statusCode ?? null,
    statusMessage: value.statusMessage ?? null,
    totalCount: value.totalCount ?? null,
    failedMessageCount: failedMessageList.length,
    failedMessageList,
  };
}

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const templateId = process.env.SOLAPI_TEMPLATE_WELCOME;
const pfId = process.env.SOLAPI_KAKAO_PFID;
const sender = process.env.SOLAPI_SENDER_PHONE;

const report = {
  checkedAt: new Date().toISOString(),
  configuration: {
    apiKeyConfigured: configured(apiKey),
    apiSecretConfigured: configured(apiSecret),
    welcomeTemplateConfigured: configured(templateId),
    kakaoProfileConfigured: configured(pfId),
    senderConfigured: configured(sender),
  },
  balance: null,
  welcomeTemplate: null,
  errors: [],
};

if (!report.configuration.apiKeyConfigured || !report.configuration.apiSecretConfigured) {
  report.errors.push({ name: "ConfigurationError", message: "SOLAPI API credentials are not configured." });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  const client = new SolapiMessageService(apiKey, apiSecret);

  try {
    const balance = await client.getBalance();
    report.balance = { accessible: true, balance: balance?.balance ?? null };
  } catch (error) {
    report.balance = { accessible: false };
    report.errors.push({ operation: "getBalance", ...summarizeError(error) });
  }

  if (!report.configuration.welcomeTemplateConfigured) {
    report.welcomeTemplate = { accessible: false, reason: "welcome template ID is not configured" };
  } else {
    try {
      const template = await client.getKakaoAlimtalkTemplate(templateId);
      const templateChannelId = template?.channelId ?? null;
      report.welcomeTemplate = {
        accessible: true,
        status: template?.status ?? null,
        messageType: template?.messageType ?? null,
        templateName: template?.templateName ?? null,
        channelMatchesConfiguredProfile: Boolean(templateChannelId && pfId && templateChannelId === pfId),
        hasContent: configured(template?.content),
      };
    } catch (error) {
      report.welcomeTemplate = { accessible: false };
      report.errors.push({ operation: "getKakaoAlimtalkTemplate", ...summarizeError(error) });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) process.exitCode = 1;
}

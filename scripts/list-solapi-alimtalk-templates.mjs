import { SolapiMessageService } from "solapi";

function configured(value) {
  return Boolean(value && String(value).trim());
}

function summarizeError(error) {
  const value = error && typeof error === "object" ? error : {};
  return {
    name: value.name ?? "Error",
    message: value.message ?? String(error),
    statusCode: value.statusCode ?? null,
    statusMessage: value.statusMessage ?? null,
  };
}

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const configuredTemplateId = process.env.SOLAPI_TEMPLATE_WELCOME;
const configuredPfId = process.env.SOLAPI_KAKAO_PFID;

if (!configured(apiKey) || !configured(apiSecret)) {
  throw new Error("SOLAPI API credentials are not configured.");
}

const client = new SolapiMessageService(apiKey, apiSecret);
const report = {
  checkedAt: new Date().toISOString(),
  configuredWelcomeTemplateFound: false,
  templates: [],
  error: null,
};

async function withRetry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError;
}

try {
  const response = await withRetry(() => client.getKakaoAlimtalkTemplates({ limit: 100 }));
  report.templates = response.templateList.map((template) => ({
    isConfiguredWelcomeTemplate: template.templateId === configuredTemplateId,
    templateId: template.templateId,
    name: template.name ?? null,
    status: template.status ?? null,
    messageType: template.messageType ?? null,
    channelMatchesConfiguredProfile: Boolean(template.channelId && configuredPfId && template.channelId === configuredPfId),
    variables: Array.isArray(template.variables) ? template.variables.map((item) => item.name) : [],
    contentPreview: String(template.content ?? "").replace(/\s+/g, " ").slice(0, 140),
  }));
  report.configuredWelcomeTemplateFound = report.templates.some((template) => template.isConfiguredWelcomeTemplate);
} catch (error) {
  report.error = summarizeError(error);
  process.exitCode = 1;
}

console.log(JSON.stringify(report, null, 2));

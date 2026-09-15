import { SolapiMessageService } from "solapi";

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
if (!apiKey || !apiSecret) throw new Error("SOLAPI API credentials are not configured.");

const client = new SolapiMessageService(apiKey, apiSecret);
const response = await client.getGroups({ limit: 20 });
const rawGroups = Array.isArray(response.groupList)
  ? response.groupList
  : Object.values(response.groupList ?? {});
const groups = rawGroups
  .filter((group) => group?.dateCreated && new Date(group.dateCreated).getTime() >= new Date("2026-09-15T04:15:00.000Z").getTime())
  .map((group) => ({
    groupId: group.groupId,
    status: group.status,
    scheduledDate: group.scheduledDate ?? null,
    dateCreated: group.dateCreated,
    total: group.count?.total ?? null,
    registeredSuccess: group.count?.registeredSuccess ?? null,
    registeredFailed: group.count?.registeredFailed ?? null,
    campaignKey: group.customFields?.campaignKey ?? null,
    operation: group.customFields?.operation ?? null,
  }));

console.log(JSON.stringify({ groups }, null, 2));

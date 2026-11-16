import { createHmac, randomBytes } from 'node:crypto';

async function get(route: string): Promise<any> {
  const apiKey = process.env.SOLAPI_API_KEY, secret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !secret) throw new Error('provider_configuration_missing');
  const date = new Date().toISOString(), salt = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', secret).update(date + salt).digest('hex');
  const response = await fetch(`https://api.solapi.com/${route}`, {headers:{Authorization:`HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`},signal:AbortSignal.timeout(10_000)});
  if (!response.ok) throw new Error('provider_preflight_failed');
  return response.json();
}

export function remainingQuota(q:any):number {
  const limit=Number(q?.currentQuota), used=Number(q?.today?.maxCount);
  if(!Number.isFinite(limit)||!Number.isFinite(used)||limit<0||used<0)throw new Error('quota_unverified');
  return Math.max(0,limit-used);
}

export function lmsFundsAvailable(b:any):boolean {
  // balance(VAT 별도)와 deposit(VAT 포함)을 혼용하거나 합산하지 않는다.
  const cash=Number(b?.balance),deposit=Number(b?.deposit);
  if(!Number.isFinite(cash)||!Number.isFinite(deposit))return false;
  return cash>=45 && deposit>=49.5;
}

async function readPages(route:string,field:string):Promise<any[]> {
  let startKey:string|undefined;const seen=new Set<string>();const rows:any[]=[];
  for(let page=0;page<100;page++){
    const sep=route.includes('?')?'&':'?';
    const data=await get(`${route}${sep}limit=100${startKey?`&startKey=${encodeURIComponent(startKey)}`:''}`);
    if(!Array.isArray(data?.[field]))throw new Error('refusal_unverified');
    rows.push(...data[field]);
    const next=data.nextKey;
    if(next==null||next==='')return rows;
    if(typeof next!=='string'||seen.has(next))throw new Error('refusal_cursor_invalid');
    seen.add(next);startKey=next;
  }
  throw new Error('refusal_page_limit');
}

export async function occasionSmsPreflight(phone:string):Promise<{allowed:boolean;reason?:string}> {
  const normalized=phone.replace(/\D/g,'');
  if(!/^01[016789]\d{7,8}$/.test(normalized))return {allowed:false,reason:'invalid_phone'};
  if(String(process.env.SOLAPI_SENDER_PHONE??'').replace(/\D/g,'')!=='025974030')return {allowed:false,reason:'sender_unverified'};
  try {
    const balance=await get('cash/v1/balance');
    if(!lmsFundsAvailable(balance))return {allowed:false,reason:'insufficient_balance'};
    const quota=await get('quota/v1/estimate');
    if(remainingQuota(quota)<1)return {allowed:false,reason:'daily_quota_exhausted'};
    // 공급사 전체 DENIAL 및 080 그룹·번호를 모두 끝까지 읽는다. 조회 실패 시 전송 금지.
    const black=await readPages('iam/v1/black?type=DENIAL','blackList');
    const groups=await readPages('iam/v1/block/groups?status=ACTIVE','blockGroups');
    const numbers=await readPages('iam/v1/block/numbers','blockNumbers');
    const norm=(v:unknown)=>String(v??'').replace(/\D/g,'');
    if(black.some(x=>typeof x.recipientNumber!=='string')||numbers.some(x=>typeof x.phoneNumber!=='string'||!Array.isArray(x.blockGroupIds)))return {allowed:false,reason:'refusal_shape_unverified'};
    const applicable=new Set(groups.filter(x=>x.status==='ACTIVE'&&(x.useAll||x.senderNumbers?.some((n:string)=>norm(n)==='025974030'))).map(x=>x.blockGroupId));
    // 080-500-4233은 SOLAPI 공용 수신거부(DENIAL)이며 수동 차단 그룹 존재가 전제는 아니다.
    // https://solapi.com/guides/blocklist / https://solapi.com/developers/api/kisa-getBlacks
    if(black.some(x=>(!x.senderNumber||norm(x.senderNumber)==='025974030')&&norm(x.recipientNumber)===normalized)||numbers.some(x=>norm(x.phoneNumber)===normalized&&x.blockGroupIds.some((id:string)=>applicable.has(id))))return {allowed:false,reason:'sms_refused'};
    return {allowed:true};
  }catch{return {allowed:false,reason:'provider_preflight_unverified'};}
}

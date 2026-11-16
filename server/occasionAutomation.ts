import { and, eq, sql } from 'drizzle-orm';
import { createHmac, randomBytes } from 'node:crypto';
import { getDb } from './db';
import { members, coupons, couponTemplates, consentLogs, occasionAutomationSettings, occasionNotifications } from '../drizzle/schema';
import { getDueOccasion, getKstDateKey, occasionGrantKey, type OccasionType } from '@shared/occasionCouponPolicy';
import { getCouponExpiryAt } from '@shared/couponPolicy';
import { sendOccasionNotice, readOccasionNoticeDelivery, type OccasionNotice } from './occasionNotification';
import { occasionSmsPreflight } from './occasionSmsPreflight';

export const OCCASION_SETTINGS_KEY='occasion_d30_v1';
const dateOnly=(x:Date|string)=>x instanceof Date?x.toISOString().slice(0,10):String(x).slice(0,10);
const dayDate=(s:string)=>new Date(s+'T00:00:00Z');
const destinationHash=(s:string)=>createHmac('sha256',process.env.JWT_SECRET??'disabled-no-secret').update(s).digest('hex');
const channels=(mode:string):Array<'email'|'sms'>=>mode==='email_sms'?['email','sms']:mode==='email'?['email']:mode==='sms'?['sms']:[];
export function legacyOccasionYear(c:{birthdayYear:number|null;issuedAt:Date|string}):number {
 return c.birthdayYear??Number(new Date(c.issuedAt).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul',year:'numeric'}));
}
export function sameOccasionYear(c:{type:string;birthdayYear:number|null;issuedAt:Date|string;grantKey:string|null},type:OccasionType,year:number):boolean {
 return c.type===type&&(c.grantKey===occasionGrantKey(type,year)||legacyOccasionYear(c)===year);
}

export async function getOccasionSettings(){
 const db=await getDb();if(!db)throw new Error('database_unavailable');
 return (await db.select().from(occasionAutomationSettings).where(eq(occasionAutomationSettings.key,OCCASION_SETTINGS_KEY)).limit(1))[0]??null;
}
export async function getOccasionSettingsForTask(taskUid:string,type:OccasionType|'dispatch'){
 const db=await getDb();if(!db)throw new Error('database_unavailable');
 const ownerColumn=type==='birthday'?occasionAutomationSettings.birthdayTaskUid:type==='anniversary'?occasionAutomationSettings.anniversaryTaskUid:occasionAutomationSettings.dispatchTaskUid;
 return (await db.select().from(occasionAutomationSettings).where(and(eq(ownerColumn,taskUid),eq(occasionAutomationSettings.key,OCCASION_SETTINGS_KEY))).limit(1))[0]??null;
}
export async function getOccasionAutomationStatus(){
 const db=await getDb();if(!db)throw new Error('database_unavailable');
 const settings=await getOccasionSettings();
 const rows=await db.select({channel:occasionNotifications.channel,status:occasionNotifications.status,count:sql<number>`COUNT(*)`}).from(occasionNotifications).groupBy(occasionNotifications.channel,occasionNotifications.status);
 return {enabled:settings?.enabled??false,channelMode:settings?.channelMode??'none',startDate:settings?dateOnly(settings.startDate):'2026-11-16',leadDays:30 as const,counts:rows.map(r=>({...r,count:Number(r.count)})),nextStep:settings?.enabled?'접수·수신 완료는 별도 상태입니다. 결과 불명·실패는 자동 재발송하지 않습니다.':'최신 버전 게시 확인 후 예약·알림을 활성화해야 합니다.'};
}

async function marketingEligible(tx:any,m:any):Promise<boolean>{
 if(m.status!=='active'||!m.marketingConsent)return false;
 const history=await tx.select().from(consentLogs).where(and(eq(consentLogs.memberId,m.id),sql`${consentLogs.consentType} IN ('marketing','marketing_withdraw')`)).orderBy(sql`${consentLogs.createdAt} DESC`,sql`${consentLogs.id} DESC`).limit(1);
 if(history[0]&&(history[0].consentType==='marketing_withdraw'||!history[0].agreed))return false;
 return Boolean(m.marketingConsentAt&&m.marketingConsentContent?.trim()||history[0]?.agreed&&history[0]?.consentContent?.trim());
}

/** 실제 D-30에만 생성한다. 가입·동의 변경도 이 함수로 들어와 월초 즉시 발급을 우회하지 못한다. */
export async function queueMemberOccasions(memberId:number, now=new Date(), onlyType?:OccasionType):Promise<{issued:number;queued:number}>{
 const db=await getDb();if(!db)throw new Error('database_unavailable');
 const settings=await getOccasionSettings();
 if(!settings?.enabled||!channels(settings.channelMode).length||getKstDateKey(now)<dateOnly(settings.startDate))return {issued:0,queued:0};
 return db.transaction(async(tx)=>{
  await tx.execute(sql`SELECT id FROM members WHERE id=${memberId} FOR UPDATE`);
  const m=(await tx.select().from(members).where(eq(members.id,memberId)).limit(1))[0];
  if(!m||!await marketingEligible(tx,m))return {issued:0,queued:0};
  let issued=0,queued=0;
  for(const type of onlyType?[onlyType]:['birthday','anniversary'] as OccasionType[]){
   const due=getDueOccasion(type==='birthday'?m.birthDate:m.anniversaryDate,now);if(!due)continue;
   const history=await tx.select().from(coupons).where(and(eq(coupons.memberId,m.id),eq(coupons.type,type)));
   const sameYear=history.filter(c=>sameOccasionYear(c,type,due.occasionYear));
   let coupon=sameYear.find(c=>c.status==='active'&&!c.usedAt&&new Date(c.expiresAt)>now);
   // 이미 사용/만료된 같은 연도 쿠폰도 발급 이력이다. '사용 가능'이라는 거짓 안내나 추가 발급 금지.
   if(!coupon&&sameYear.length)continue;
   if(!coupon){
    const template=(await tx.select().from(couponTemplates).where(and(eq(couponTemplates.type,type),eq(couponTemplates.isActive,true))).limit(1))[0];
    if(!template)continue;
    const code=(type==='birthday'?'BDAY-':'ANNI-')+randomBytes(6).toString('hex').toUpperCase();
    await tx.insert(coupons).values({memberId:m.id,templateId:template.id,code,type,name:template.name,discountPercent:template.discountPercent,description:`${due.occasionYear}년 ${type==='birthday'?'생일':'결혼기념일'} D-30 쿠폰`,status:'active',issuedAt:now,expiresAt:getCouponExpiryAt(now),birthdayYear:due.occasionYear,grantKey:occasionGrantKey(type,due.occasionYear)});
    coupon=(await tx.select().from(coupons).where(eq(coupons.code,code)).limit(1))[0];
    if(!coupon)throw new Error('coupon_insert_unverified');issued++;
   }
   for(const channel of channels(settings.channelMode)){
    const destination=channel==='sms'?m.phone.replace(/\D/g,''):m.email.trim().toLowerCase();
    const prior=(await tx.select().from(occasionNotifications).where(and(eq(occasionNotifications.memberId,m.id),eq(occasionNotifications.type,type),eq(occasionNotifications.occasionYear,due.occasionYear),eq(occasionNotifications.channel,channel))).limit(1))[0];
    if(prior)continue;
    await tx.insert(occasionNotifications).values({memberId:m.id,couponId:coupon.id,type,occasionYear:due.occasionYear,occasionDate:dayDate(due.occasionDate),scheduledDate:dayDate(due.reminderDate),channel,destinationHash:destinationHash(destination),status:'pending'});
    queued++;
   }
  }
  return {issued,queued};
 });
}

export async function queueDueOccasions(type:OccasionType,now=new Date()):Promise<{issued:number;queued:number;scanned:number;remaining:boolean}>{
 const db=await getDb();if(!db)throw new Error('database_unavailable');
 const cfg=await getOccasionSettings();if(!cfg?.enabled)return {issued:0,queued:0,scanned:0,remaining:false};
 const dates=await db.select({id:members.id,birthDate:members.birthDate,anniversaryDate:members.anniversaryDate}).from(members).where(and(eq(members.status,'active'),eq(members.marketingConsent,true)));
 const due=dates.filter(m=>getDueOccasion(type==='birthday'?m.birthDate:m.anniversaryDate,now));
 let issued=0,queued=0,scanned=0;const started=Date.now();
 for(const m of due){if(Date.now()-started>65_000)break;const r=await queueMemberOccasions(m.id,now,type);issued+=r.issued;queued+=r.queued;scanned++;}
 return {issued,queued,scanned,remaining:scanned<due.length};
}

/** 미시도 pending만 처리. 같은 안내는 attemptAt 저장 후 한 번만 요청한다. */
export async function dispatchOccasionNotifications(now=new Date()):Promise<{accepted:number;failed:number;unknown:number;blocked:number;cancelled:number;remaining:number}>{
 const db=await getDb();if(!db)throw new Error('database_unavailable');
 const cfg=await getOccasionSettings();const summary={accepted:0,failed:0,unknown:0,blocked:0,cancelled:0,remaining:0};
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hour12:false}).format(now));
 if(!cfg?.enabled||hour<9||hour>=20)return summary;
 const today=getKstDateKey(now);const started=Date.now();
 const pending=await db.select().from(occasionNotifications).where(and(eq(occasionNotifications.status,'pending'),sql`${occasionNotifications.scheduledDate}<=${today}`)).orderBy(occasionNotifications.id).limit(100);
 for(const n of pending){
  if(Date.now()-started>70_000){summary.remaining++;continue;}
  let preflight:{allowed:boolean;reason?:string}={allowed:true};
  const snap=(await db.select().from(members).where(eq(members.id,n.memberId)).limit(1))[0];
  if(n.channel==='sms'&&snap)preflight=await occasionSmsPreflight(snap.phone);
  const claim=await db.transaction(async(tx)=>{
   await tx.execute(sql`SELECT id FROM occasion_notifications WHERE id=${n.id} FOR UPDATE`);
   const row=(await tx.select().from(occasionNotifications).where(eq(occasionNotifications.id,n.id)).limit(1))[0];
   if(!row||row.status!=='pending'||row.attemptAt)return null;
   const m=(await tx.select().from(members).where(eq(members.id,row.memberId)).limit(1))[0];
   const c=(await tx.select().from(coupons).where(eq(coupons.id,row.couponId)).limit(1))[0];
   const due=m?getDueOccasion(row.type==='birthday'?m.birthDate:m.anniversaryDate,now):null;
   const destination=m?(row.channel==='sms'?m.phone.replace(/\D/g,''):m.email.trim().toLowerCase()):'';
   let reason:string|null=null;
   if(!m||!await marketingEligible(tx,m))reason='consent_or_member_changed';
   else if(!due||due.occasionDate!==dateOnly(row.occasionDate)||dateOnly(row.scheduledDate)!==today)reason='occasion_date_changed_or_missed';
   else if(!c||c.memberId!==m.id||c.type!==row.type||c.status!=='active'||c.usedAt||new Date(c.expiresAt)<=now)reason='coupon_not_usable';
   else if(destinationHash(destination)!==row.destinationHash)reason='contact_changed';
   else if(!channels(cfg.channelMode).includes(row.channel))reason='channel_disabled';
   if(reason){await tx.update(occasionNotifications).set({status:'cancelled',reason,finishedAt:now}).where(eq(occasionNotifications.id,row.id));return {skip:'cancelled' as const};}
   if(row.channel==='sms'){
    const duplicate=await tx.select({id:members.id}).from(members).where(and(eq(members.status,'active'),sql`REGEXP_REPLACE(${members.phone}, '[^0-9]', '')=${destination}`)).limit(2);
    if(duplicate.length!==1)preflight={allowed:false,reason:'duplicate_phone'};
   }
   if(!preflight.allowed){await tx.update(occasionNotifications).set({status:'blocked',reason:preflight.reason??'preflight_blocked',finishedAt:now}).where(eq(occasionNotifications.id,row.id));return {skip:'blocked' as const};}
   await tx.update(occasionNotifications).set({status:'sending',attemptAt:now}).where(eq(occasionNotifications.id,row.id));
   return {id:row.id,channel:row.channel,destination,notice:{type:row.type,name:m!.name,couponCode:c!.code,couponName:c!.name,discountPercent:c!.discountPercent??15,expiresAt:c!.expiresAt,occasionDate:dateOnly(row.occasionDate)} as OccasionNotice};
  });
  if(!claim)continue;
  if('skip'in claim && claim.skip){summary[claim.skip]++;continue;}
  let result:Awaited<ReturnType<typeof sendOccasionNotice>>;
  try{result=await sendOccasionNotice(claim.channel,claim.destination,claim.notice,`nops-occasion-${claim.id}`);}catch{result={status:'unknown',reason:'provider_response_unknown'};}
  await db.update(occasionNotifications).set({status:result.status,providerMessageId:result.providerMessageId??null,reason:result.reason??null,finishedAt:new Date()}).where(and(eq(occasionNotifications.id,claim.id),eq(occasionNotifications.status,'sending')));
  summary[result.status]++;
 }
 return summary;
}

/** 제공사 GET만 사용한다. 수신 대기·추적 불가를 성공으로 바꾸거나 재전송하지 않는다. */
export async function refreshOccasionDeliveryStates(now=new Date()):Promise<{checked:number;delivered:number;failed:number}>{
 const db=await getDb();if(!db)throw new Error('database_unavailable');
 const rows=await db.select().from(occasionNotifications).where(eq(occasionNotifications.status,'accepted')).orderBy(occasionNotifications.updatedAt,occasionNotifications.id).limit(10);
 const summary={checked:0,delivered:0,failed:0};const started=Date.now();
 for(const row of rows){
  if(Date.now()-started>35_000)break;
  if(!row.providerMessageId)continue;
  const result=await readOccasionNoticeDelivery(row.channel,row.providerMessageId);
  summary.checked++;
  if(result.status==='delivered'||result.status==='failed'){
   await db.update(occasionNotifications).set({status:result.status,reason:result.reason??null,finishedAt:now}).where(and(eq(occasionNotifications.id,row.id),eq(occasionNotifications.status,'accepted')));
   summary[result.status]++;
  }else{
   await db.update(occasionNotifications).set({reason:result.reason??null,updatedAt:now}).where(and(eq(occasionNotifications.id,row.id),eq(occasionNotifications.status,'accepted')));
  }
 }
 await db.update(occasionNotifications).set({status:'unknown',reason:'attempt_result_unrecorded'}).where(and(eq(occasionNotifications.status,'sending'),sql`${occasionNotifications.attemptAt}<${new Date(now.getTime()-30*60*1000)}`));
 return summary;
}

import mysql from 'mysql2/promise';
import {execFileSync} from 'node:child_process';
// 실제 발급·발송·예약 변경은 하지 않는다. 개인정보 결과는 출력하지 않는다.
const conn=await mysql.createConnection(process.env.DATABASE_URL);
try{
 const [settings]=await conn.execute("SELECT `key`,enabled,channelMode,startDate,birthdayTaskUid,anniversaryTaskUid,dispatchTaskUid FROM occasion_automation_settings WHERE `key`='occasion_d30_v1'");
 const target=new Date(Date.now()+(30*24+9)*3600000),month=target.getUTCMonth()+1,day=target.getUTCDate();
 const [counts]=await conn.query("SELECT 'birthday' type, COUNT(*) count FROM members WHERE status='active' AND marketingConsent=1 AND MONTH(birthDate)=? AND DAY(birthDate)=? UNION ALL SELECT 'anniversary',COUNT(*) FROM members WHERE status='active' AND marketingConsent=1 AND MONTH(anniversaryDate)=? AND DAY(anniversaryDate)=?",[month,day,month,day]);
 const [logs]=await conn.query('SELECT channel,status,COUNT(*) count FROM occasion_notifications GROUP BY channel,status');
 console.log(JSON.stringify({readOnly:true,settings,dueDateCounts:counts,notificationStates:logs},null,2));
 const raw=execFileSync('manus-heartbeat',['list','--page','1','--page-size','200'],{encoding:'utf8'});
 const data=JSON.parse(raw.slice(raw.indexOf('{')));
 console.log(JSON.stringify({registeredJobs:(data.jobs??[]).filter(j=>['/api/scheduled/birthday-coupons','/api/scheduled/anniversary-coupons','/api/scheduled/occasion-notifications'].includes(j.callback_path)).map(j=>({taskUid:j.task_uid,path:j.callback_path,cron:j.cron_expression,enabled:j.is_enable}))},null,2));
}finally{await conn.end();}

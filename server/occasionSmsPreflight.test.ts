import {describe,it,expect,vi,afterEach} from 'vitest';
import {remainingQuota,lmsFundsAvailable,occasionSmsPreflight} from './occasionSmsPreflight';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function fixtures(extra:any[]=[]){return [
 {balance:1000,deposit:1100}, {currentQuota:2400,today:{maxCount:100}},
 {blackList:[],nextKey:null},
 {blockGroups:[{status:'ACTIVE',useAll:false,senderNumbers:['02-597-4030'],blockGroupId:'TEST'}],nextKey:null},
 {blockNumbers:extra,nextKey:null}
];}
function provider(items:any[]){vi.stubEnv('SOLAPI_API_KEY','mock');vi.stubEnv('SOLAPI_API_SECRET','mock');vi.stubEnv('SOLAPI_SENDER_PHONE','025974030');const mock=vi.fn();items.forEach(x=>mock.mockResolvedValueOnce({ok:true,json:async()=>x}));vi.stubGlobal('fetch',mock);return mock;}
describe('occasion SMS preflight (no actual send)',()=>{
 it('does not add cash to deposit or double-count VAT',()=>{expect(lmsFundsAvailable({balance:45,deposit:49.5})).toBe(true);expect(lmsFundsAvailable({balance:44,deposit:49.5})).toBe(false);expect(lmsFundsAvailable({balance:100,deposit:49.49})).toBe(false);expect(lmsFundsAvailable({balance:100})).toBe(false);});
 it('rejects malformed quota',()=>{expect(remainingQuota({currentQuota:2400,today:{maxCount:2399}})).toBe(1);expect(()=>remainingQuota({currentQuota:2400})).toThrow();});
 it('allows only after known full refusal and resource responses',async()=>{const f=provider(fixtures());expect(await occasionSmsPreflight('01000000000')).toEqual({allowed:true});expect(f).toHaveBeenCalledTimes(5);expect(f.mock.calls.every(c=>!c[1].method||c[1].method==='GET')).toBe(true);});
 it('blocks exact applicable 080 refusal',async()=>{provider(fixtures([{phoneNumber:'01000000000',blockGroupIds:['TEST']}]));expect((await occasionSmsPreflight('01000000000')).reason).toBe('sms_refused');});
 it('does not treat a different sender block group as applicable',async()=>{provider(fixtures([{phoneNumber:'01000000000',blockGroupIds:['OTHER']}]));expect((await occasionSmsPreflight('01000000000')).allowed).toBe(true);});
 it('uses recipientNumber in the direct denial API',async()=>{const x=fixtures();x[2]={blackList:[{recipientNumber:'01000000000',senderNumber:'025974030'}],nextKey:null};provider(x);expect((await occasionSmsPreflight('01000000000')).allowed).toBe(false);});
 it('blocks unknown denial row schema',async()=>{const x=fixtures();x[2]={blackList:[{to:'01000000000'}],nextKey:null};provider(x);expect((await occasionSmsPreflight('01000000000')).reason).toBe('refusal_shape_unverified');});
 it('does not require optional manual block groups for public 080 DENIAL',async()=>{const x=fixtures();x[3]={blockGroups:[],nextKey:null};provider(x);expect((await occasionSmsPreflight('01000000000')).allowed).toBe(true);});
 it('blocks low balance before any other API call',async()=>{const f=provider([{balance:1,deposit:1.1}]);expect((await occasionSmsPreflight('01000000000')).reason).toBe('insufficient_balance');expect(f).toHaveBeenCalledTimes(1);});
 it('blocks network errors with no retry',async()=>{const f=provider([]);f.mockRejectedValueOnce(new Error('secret phone mock'));expect(await occasionSmsPreflight('01000000000')).toEqual({allowed:false,reason:'provider_preflight_unverified'});expect(f).toHaveBeenCalledTimes(1);});
});

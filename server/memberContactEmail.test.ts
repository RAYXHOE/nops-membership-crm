import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({send:vi.fn()}));
vi.mock("resend",()=>({Resend:vi.fn(()=>({emails:{send:mocks.send}}))}));
import {sendOtpEmail} from "./email";
beforeEach(()=>{vi.clearAllMocks();mocks.send.mockResolvedValue({data:{id:"mock-otp-delivery"},error:null});});
describe("회원 연락처 인증 메일",()=>{
 it("새 이메일 확인과 실제 변경 저장을 구분한다",async()=>{const result=await sendOtpEmail({to:"new@example.com",name:"<b>회원</b>",code:"012345",purpose:"email_change"});expect(result.success).toBe(true);const arg=mocks.send.mock.calls[0][0];expect(arg.subject).toContain("이메일 변경 인증");expect(arg.subject).not.toContain("012345");expect(arg.html).toContain("변경 저장");expect(arg.html).toContain("&lt;b&gt;회원&lt;/b&gt;");expect(arg.html).toContain("012345");});
 it("로그인 메일도 코드가 제목에 들어가지 않는다",async()=>{await sendOtpEmail({to:"member@example.com",name:"회원",code:"123456"});expect(mocks.send.mock.calls[0][0].subject).toContain("로그인 인증");expect(mocks.send.mock.calls[0][0].subject).not.toContain("123456");});
 it.each([{data:null,error:{message:"private delivery error"}},{data:{},error:null}])("API 오류나 접수 ID 누락을 실패로 반환한다",async(value)=>{mocks.send.mockResolvedValue(value);expect((await sendOtpEmail({to:"member@example.com",name:"회원",code:"123456"})).success).toBe(false);});
 it("예외의 주소·코드를 다시 노출하지 않는다",async()=>{mocks.send.mockRejectedValue(new Error("private recipient code"));await expect(sendOtpEmail({to:"member@example.com",name:"회원",code:"123456"})).resolves.toEqual({success:false});});
});

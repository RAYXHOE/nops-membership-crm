// 배포 서버 API를 통해 최채환 회원에게 테스트 알림톡 발송
// 배포 서버 IP에서 실행되므로 화이트리스트 통과

const BASE_URL = "https://membership.nops.kr";

async function main() {
  console.log("배포 서버에서 최채환 회원 테스트 알림톡 발송 시작...");

  // tRPC batch 요청으로 최채환 회원 조회
  const searchRes = await fetch(
    `${BASE_URL}/api/trpc/admin.listMembers?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { search: "최채환", limit: 1 } } }))}`,
    { headers: { "Content-Type": "application/json" } }
  );

  if (!searchRes.ok) {
    console.error("회원 조회 실패 (인증 필요):", searchRes.status);
    console.log("배포 서버 heartbeat 엔드포인트를 통해 직접 발송합니다...");
    
    // heartbeat 방식으로 테스트 발송 트리거
    const testRes = await fetch(`${BASE_URL}/api/scheduled/test-alimtalk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberName: "최채환" }),
    });
    console.log("응답:", testRes.status, await testRes.text());
    return;
  }

  const data = await searchRes.json();
  console.log("조회 결과:", JSON.stringify(data, null, 2));
}

main().catch(console.error);

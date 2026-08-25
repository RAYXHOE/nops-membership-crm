import { SolapiMessageService } from "solapi";

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const channelId = process.env.SOLAPI_KAKAO_PFID;

if (!apiKey || !apiSecret || !channelId) {
  throw new Error("SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_KAKAO_PFID 설정이 필요합니다.");
}

const templates = [
  {
    key: "SOLAPI_TEMPLATE_WELCOME",
    name: "NOPS 멤버십 가입 완료",
    content: `안녕하세요, #{이름}님.
NOPS 멤버십 가입이 완료되었습니다.

발급된 쿠폰
#{쿠폰목록}

쿠폰별 유효기간과 사용 가능 여부는 마이페이지에서 확인해 주세요.
#{링크}

Mr. 놉스 올림`,
  },
  {
    key: "SOLAPI_TEMPLATE_BIRTHDAY",
    name: "NOPS 생일 쿠폰 발급",
    content: `안녕하세요, #{이름}님.
생일을 맞아 멤버십 쿠폰이 발급되었습니다.

쿠폰명: #{쿠폰명}
할인율: #{할인율}%
쿠폰번호: #{쿠폰코드}
유효기간: #{만료일}

마이페이지에서 쿠폰을 확인해 주세요.
#{링크}

Mr. 놉스 올림`,
  },
  {
    key: "SOLAPI_TEMPLATE_ANNIVERSARY",
    name: "NOPS 결혼기념일 쿠폰 발급",
    content: `안녕하세요, #{이름}님.
결혼기념일을 맞아 멤버십 쿠폰이 발급되었습니다.

쿠폰명: #{쿠폰명}
할인율: #{할인율}%
쿠폰번호: #{쿠폰코드}
유효기간: #{만료일}

마이페이지에서 쿠폰을 확인해 주세요.
#{링크}

Mr. 놉스 올림`,
  },
  {
    key: "SOLAPI_TEMPLATE_CORKAGE",
    name: "NOPS 콜키지 프리 쿠폰 재발급",
    content: `안녕하세요, #{이름}님.
멤버십 #{쿠폰명}이 재발급되었습니다.

쿠폰번호: #{쿠폰코드}
유효기간: #{만료일}

마이페이지에서 쿠폰을 확인해 주세요.
#{링크}

Mr. 놉스 올림`,
  },
  {
    key: "SOLAPI_TEMPLATE_POINTS_EXPIRY",
    name: "NOPS 적립금 만료 예정 안내",
    content: `안녕하세요, #{이름}님.
보유 적립금 중 일부가 30일 후 만료될 예정입니다.

만료 예정 적립금: #{만료예정적립금}원
현재 적립금 잔액: #{잔액}원
만료일: #{만료일}

적립금은 1만원 단위로 사용 가능합니다.
마이페이지에서 상세 내역을 확인해 주세요.
#{링크}

Mr. 놉스 올림`,
  },
];

if (process.argv[2] !== "--apply") {
  console.log(JSON.stringify({
    dryRun: true,
    channelId,
    categoryCode: "999999",
    templates: templates.map(({ key, name }) => ({ key, name })),
    instruction: "실제 생성은 node scripts/create-solapi-alimtalk-templates.mjs --apply 로 실행합니다.",
  }, null, 2));
  process.exit(0);
}

const client = new SolapiMessageService(apiKey, apiSecret);
const created = [];

for (const template of templates) {
  const result = await client.createKakaoAlimtalkTemplate({
    channelId,
    categoryCode: "999999",
    name: template.name,
    content: template.content,
    messageType: "BA",
    emphasizeType: "NONE",
  });

  created.push({
    key: template.key,
    name: result.name,
    templateId: result.templateId,
    status: result.status,
  });
}

console.log(JSON.stringify({ created }, null, 2));

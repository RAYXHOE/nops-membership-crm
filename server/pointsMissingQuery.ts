/**
 * 적립 누락 감지용 구매 조회 SQL.
 * purchases 테이블에는 상태 컬럼이 없으며, 구매 취소 건은 이미 earn 포인트 이력이 남아
 * LEFT JOIN의 earn 존재 조건으로 누락 대상에서 제외된다.
 */
export const MISSING_POINTS_QUERY = `
  SELECT p.id as purchaseId, p.memberId, p.finalAmount, p.purchasedAt,
         m.name as memberName, m.email as memberEmail
  FROM purchases p
  LEFT JOIN points pt ON pt.purchaseId = p.id AND pt.type = 'earn'
  LEFT JOIN members m ON m.id = p.memberId
  WHERE p.finalAmount >= 3334
  AND pt.id IS NULL
  ORDER BY p.purchasedAt DESC
  LIMIT 50
`;

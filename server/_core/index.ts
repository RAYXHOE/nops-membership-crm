import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { birthdayCouponHandler, couponExpiryReminderHandler, anniversaryCouponHandler, corkageReissueHandler, cleanupExpiredOtpsHandler, expirePointsHandler, checkMissingCouponsHandler, checkPointsMissingHandler } from "../scheduledHandlers";
import { dbBackupHandler } from "../backupHandler";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Scheduled handlers (must be before tRPC and Vite fallthrough)
  app.post("/api/scheduled/birthday-coupons", birthdayCouponHandler);
  app.post("/api/scheduled/coupon-expiry-reminder", couponExpiryReminderHandler);
  app.post("/api/scheduled/anniversary-coupons", anniversaryCouponHandler);
  app.post("/api/scheduled/corkage-reissue", corkageReissueHandler);
  app.post("/api/scheduled/cleanup-expired-otps", cleanupExpiredOtpsHandler);
  app.post("/api/scheduled/expire-points", expirePointsHandler);
  app.post("/api/scheduled/check-missing-coupons", checkMissingCouponsHandler);
  app.post("/api/scheduled/db-backup", dbBackupHandler);
  app.post("/api/scheduled/check-points-missing", checkPointsMissingHandler);

  // 테스트 알림톡 발송 (관리자 전용)
  app.post("/api/admin/test-alimtalk", async (req, res) => {
    try {
      const { memberName } = req.body as { memberName?: string };
      if (!memberName) return res.status(400).json({ error: "memberName 필요" });
      const { getDb } = await import("../db");
      const { members, coupons } = await import("../../drizzle/schema");
      const { like, eq, and, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB 연결 실패" });
      const memberRows = await db.select().from(members)
        .where(and(like(members.name, `%${memberName}%`), eq(members.status, "active"))).limit(1);
      const member = memberRows[0];
      if (!member) return res.status(404).json({ error: `${memberName} 회원 없음` });
      const couponRows = await db.select().from(coupons)
        .where(and(eq(coupons.memberId, member.id), eq(coupons.status, "active")))
        .orderBy(desc(coupons.issuedAt)).limit(3);
      const { sendWelcomeAlimtalk } = await import("../kakao");
      const alimtalkResult = await sendWelcomeAlimtalk({
        to: member.phone,
        name: member.name,
        coupons: couponRows.map(c => ({ name: c.name, code: c.code })),
      });
      return res.json({
        ok: true,
        member: member.name,
        phone: member.phone,
        coupons: couponRows.map(c => ({ name: c.name, code: c.code })),
        alimtalk: alimtalkResult,
      });
    } catch (err) {
      console.error("[Test Alimtalk]", err);
      return res.status(500).json({ error: String(err) });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

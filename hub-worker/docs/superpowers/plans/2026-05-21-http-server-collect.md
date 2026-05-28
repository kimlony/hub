# HTTP Server Collect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hub-worker를 Kafka consumer에서 Express HTTP 서버로 전환하여 DBHub의 POST /collect 요청을 받아 몰 API를 호출하고 결과를 응답으로 반환한다.

**Architecture:** DBHub가 `POST /collect`로 요청 → Worker가 채널 API 호출 → 결과를 JSON 응답으로 반환 → DBHub가 Oracle 저장 및 status 업데이트. Kafka consumer 코드는 유지하되 index.ts에서 실행하지 않는다. 기존 채널 파일(elevenst, gchan, coupang, nfa)은 수정하지 않는다.

**Tech Stack:** Node.js, TypeScript (ESM), Express, axios, 기존 채널별 ApiClient 재사용

---

## 파일 구조

| 작업 | 파일 | 설명 |
|------|------|------|
| 생성 | `src/handlers/ICollectHandler.ts` | HTTP용 핸들러 인터페이스, CollectResult 타입 정의 |
| 생성 | `src/handlers/CollectHandlerRegistry.ts` | HTTP용 channelCd 라우팅 레지스트리 |
| 생성 | `src/channels/elevenst/ElevenStCollectHandler.ts` | 11ST HTTP 핸들러 |
| 생성 | `src/channels/gchan/GchanCollectHandler.ts` | GCHAN HTTP 핸들러 |
| 생성 | `src/channels/coupang/CoupangCollectHandler.ts` | COUPANG HTTP 핸들러 |
| 생성 | `src/channels/nfa/NfaCollectHandler.ts` | NSS HTTP 핸들러 |
| 생성 | `src/server.ts` | Express 앱, POST /collect 라우터 |
| 수정 | `src/index.ts` | HTTP 서버만 시작 (Kafka 코드 주석처리) |
| 수정 | `.env.example` | PORT 항목 추가 |
| 수정 | `package.json` | express, @types/express 의존성 추가 |

---

### Task 1: Express 의존성 추가

**Files:**
- Modify: `package.json`

- [ ] **Step 1: express 설치**

```bash
cd C:\Users\Scrap-2\bizbee-hub\hub-worker
npm install express
npm install --save-dev @types/express
```

Expected: `node_modules/express` 생성, package.json dependencies에 express 추가됨

- [ ] **Step 2: 타입체크 통과 확인**

```bash
npm run check
```

Expected: 에러 없음 (기존 코드이므로)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express dependency for HTTP server"
```

---

### Task 2: ICollectHandler 인터페이스 생성

**Files:**
- Create: `src/handlers/ICollectHandler.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/handlers/ICollectHandler.ts
import type { JobHandlerMessage } from "./IJobHandler.js";

export type CollectResult = {
  requestId: string;
  channelCd: string;
  totalCount: number;
  orders: unknown[];
};

export interface ICollectHandler {
  handle(message: JobHandlerMessage): Promise<CollectResult>;
}
```

- [ ] **Step 2: 타입체크 통과 확인**

```bash
npm run check
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/handlers/ICollectHandler.ts
git commit -m "feat: add ICollectHandler interface for HTTP collect flow"
```

---

### Task 3: CollectHandlerRegistry 생성

**Files:**
- Create: `src/handlers/CollectHandlerRegistry.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/handlers/CollectHandlerRegistry.ts
import type { ICollectHandler } from "./ICollectHandler.js";

export class CollectHandlerRegistry {
  private readonly handlers = new Map<string, ICollectHandler>();

  register(channelCd: string, handler: ICollectHandler): void {
    this.handlers.set(channelCd, handler);
  }

  get(channelCd: string): ICollectHandler | undefined {
    return this.handlers.get(channelCd);
  }
}
```

- [ ] **Step 2: 타입체크 확인**

```bash
npm run check
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/handlers/CollectHandlerRegistry.ts
git commit -m "feat: add CollectHandlerRegistry for HTTP channel routing"
```

---

### Task 4: ElevenStCollectHandler 생성

**Files:**
- Create: `src/channels/elevenst/ElevenStCollectHandler.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/channels/elevenst/ElevenStCollectHandler.ts
import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { ElevenStApiClient } from "./ElevenStApiClient.js";

type ElevenStPayload = {
  corpCd: string;
  channelCd: "11ST";
  channelAccountId: string;
  authType: "API_KEY";
  authInfo: {
    apiKey: string;
  };
  frDt: string;
  toDt: string;
};

export class ElevenStCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new ElevenStApiClient(payload.authInfo.apiKey);
    const { orders } = await client.fetchOrders(payload.frDt, payload.toDt);

    console.log(`[${message.requestId}] 11ST orders collected: ${orders.length}`);

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: orders.length,
      orders
    };
  }
}

function parsePayload(payload: Record<string, unknown>): ElevenStPayload {
  const authInfo = toRecord(payload.authInfo);
  const parsed = {
    corpCd: requireString(payload.corpCd, "corpCd"),
    channelCd: requireString(payload.channelCd, "channelCd"),
    channelAccountId: requireString(payload.channelAccountId, "channelAccountId"),
    authType: requireString(payload.authType, "authType"),
    authInfo: {
      apiKey: requireString(authInfo.apiKey, "authInfo.apiKey")
    },
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "11ST") {
    throw new Error(`Unsupported channelCd for 11ST handler: ${parsed.channelCd}`);
  }

  if (parsed.authType !== "API_KEY") {
    throw new Error(`Unsupported authType for 11ST: ${parsed.authType}`);
  }

  return parsed as ElevenStPayload;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
```

- [ ] **Step 2: 타입체크 확인**

```bash
npm run check
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/channels/elevenst/ElevenStCollectHandler.ts
git commit -m "feat: add ElevenStCollectHandler for HTTP collect flow"
```

---

### Task 5: GchanCollectHandler 생성

**Files:**
- Create: `src/channels/gchan/GchanCollectHandler.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/channels/gchan/GchanCollectHandler.ts
import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { GchanApiClient } from "./GchanApiClient.js";

type GchanPayload = {
  corpCd: string;
  channelCd: "GCHAN";
  channelAccountId: string;
  authType: "ID_PW";
  authInfo: {
    sellerId: string;
    password: string;
  };
  frDt: string;
  toDt: string;
};

export class GchanCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new GchanApiClient();
    const { accessToken, sellerSeq } = await client.login(
      payload.authInfo.sellerId,
      payload.authInfo.password
    );
    const orders = await client.fetchOrders(accessToken, sellerSeq, payload.frDt, payload.toDt);

    console.log(`[${message.requestId}] GCHAN orders collected: ${orders.length}`);

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: orders.length,
      orders
    };
  }
}

function parsePayload(payload: Record<string, unknown>): GchanPayload {
  const authInfo = toRecord(payload.authInfo);
  const parsed = {
    corpCd: requireString(payload.corpCd, "corpCd"),
    channelCd: requireString(payload.channelCd, "channelCd"),
    channelAccountId: requireString(payload.channelAccountId, "channelAccountId"),
    authType: requireString(payload.authType, "authType"),
    authInfo: {
      sellerId: requireString(authInfo.sellerId, "authInfo.sellerId"),
      password: requireString(authInfo.password, "authInfo.password")
    },
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "GCHAN") {
    throw new Error(`Unsupported channelCd for GCHAN handler: ${parsed.channelCd}`);
  }

  if (parsed.authType !== "ID_PW") {
    throw new Error(`Unsupported authType for GCHAN: ${parsed.authType}`);
  }

  return parsed as GchanPayload;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
```

- [ ] **Step 2: 타입체크 확인**

```bash
npm run check
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/channels/gchan/GchanCollectHandler.ts
git commit -m "feat: add GchanCollectHandler for HTTP collect flow"
```

---

### Task 6: CoupangCollectHandler 생성

**Files:**
- Create: `src/channels/coupang/CoupangCollectHandler.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/channels/coupang/CoupangCollectHandler.ts
import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { CoupangApiClient } from "./CoupangApiClient.js";

type CoupangPayload = {
  corpCd: string;
  channelCd: "COUPANG";
  channelAccountId: string;
  authType: "API_KEY";
  authInfo: {
    apiKey: string;
    secretKey: string;
    vendorId: string;
  };
  frDt: string;
  toDt: string;
};

export class CoupangCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new CoupangApiClient();
    const orders = await client.fetchOrders(
      payload.authInfo.apiKey,
      payload.authInfo.secretKey,
      payload.authInfo.vendorId,
      payload.frDt,
      payload.toDt
    );

    console.log(`[${message.requestId}] COUPANG orders collected: ${orders.length}`);

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: orders.length,
      orders
    };
  }
}

function parsePayload(payload: Record<string, unknown>): CoupangPayload {
  const authInfo = toRecord(payload.authInfo);
  const parsed = {
    corpCd: requireString(payload.corpCd, "corpCd"),
    channelCd: requireString(payload.channelCd, "channelCd"),
    channelAccountId: requireString(payload.channelAccountId, "channelAccountId"),
    authType: requireString(payload.authType, "authType"),
    authInfo: {
      apiKey: requireString(authInfo.apiKey, "authInfo.apiKey"),
      secretKey: requireString(authInfo.secretKey, "authInfo.secretKey"),
      vendorId: requireString(authInfo.vendorId, "authInfo.vendorId")
    },
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "COUPANG") {
    throw new Error(`Unsupported channelCd for COUPANG handler: ${parsed.channelCd}`);
  }

  if (parsed.authType !== "API_KEY") {
    throw new Error(`Unsupported authType for COUPANG: ${parsed.authType}`);
  }

  return parsed as CoupangPayload;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
```

- [ ] **Step 2: 타입체크 확인**

```bash
npm run check
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/channels/coupang/CoupangCollectHandler.ts
git commit -m "feat: add CoupangCollectHandler for HTTP collect flow"
```

---

### Task 7: NfaCollectHandler 생성

**Files:**
- Create: `src/channels/nfa/NfaCollectHandler.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/channels/nfa/NfaCollectHandler.ts
import type { JobHandlerMessage } from "../../handlers/IJobHandler.js";
import type { CollectResult, ICollectHandler } from "../../handlers/ICollectHandler.js";
import { NfaApiClient } from "./NfaApiClient.js";

type NfaPayload = {
  corpCd: string;
  channelCd: "NSS";
  channelAccountId: string;
  authType: "API_KEY" | "ID_PW";
  authInfo: {
    clientId: string;
    clientSecret: string;
  };
  frDt: string;
  toDt: string;
};

export class NfaCollectHandler implements ICollectHandler {
  async handle(message: JobHandlerMessage): Promise<CollectResult> {
    const payload = parsePayload(message.payload);
    const client = new NfaApiClient();
    const orders = await client.fetchOrders(
      payload.authInfo.clientId,
      payload.authInfo.clientSecret,
      payload.frDt,
      payload.toDt
    );

    console.log(`[${message.requestId}] NSS orders collected: ${orders.length}`);

    return {
      requestId: message.requestId,
      channelCd: payload.channelCd,
      totalCount: orders.length,
      orders
    };
  }
}

function parsePayload(payload: Record<string, unknown>): NfaPayload {
  const authInfo = toRecord(payload.authInfo);
  const parsed = {
    corpCd: requireString(payload.corpCd, "corpCd"),
    channelCd: requireString(payload.channelCd, "channelCd"),
    channelAccountId: requireString(payload.channelAccountId, "channelAccountId"),
    authType: requireString(payload.authType, "authType"),
    authInfo: {
      clientId: requireString(authInfo.clientId, "authInfo.clientId"),
      clientSecret: requireString(authInfo.clientSecret, "authInfo.clientSecret")
    },
    frDt: requireString(payload.frDt, "frDt"),
    toDt: requireString(payload.toDt, "toDt")
  };

  if (parsed.channelCd !== "NSS") {
    throw new Error(`Unsupported channelCd for NSS handler: ${parsed.channelCd}`);
  }

  if (parsed.authType !== "API_KEY" && parsed.authType !== "ID_PW") {
    throw new Error(`Unsupported authType for NSS: ${parsed.authType}`);
  }

  return parsed as NfaPayload;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
```

- [ ] **Step 2: 타입체크 확인**

```bash
npm run check
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/channels/nfa/NfaCollectHandler.ts
git commit -m "feat: add NfaCollectHandler for HTTP collect flow"
```

---

### Task 8: Express 서버 생성 (server.ts)

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/server.ts
import express, { type Request, type Response } from "express";
import { CollectHandlerRegistry } from "./handlers/CollectHandlerRegistry.js";
import { ElevenStCollectHandler } from "./channels/elevenst/ElevenStCollectHandler.js";
import { GchanCollectHandler } from "./channels/gchan/GchanCollectHandler.js";
import { CoupangCollectHandler } from "./channels/coupang/CoupangCollectHandler.js";
import { NfaCollectHandler } from "./channels/nfa/NfaCollectHandler.js";
import type { JobHandlerMessage } from "./handlers/IJobHandler.js";

const registry = new CollectHandlerRegistry();
registry.register("11ST", new ElevenStCollectHandler());
registry.register("GCHAN", new GchanCollectHandler());
registry.register("COUPANG", new CoupangCollectHandler());
registry.register("NSS", new NfaCollectHandler());

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  app.post("/collect", (req: Request, res: Response): void => {
    const message = req.body as JobHandlerMessage;
    const requestId = message?.requestId ?? "unknown";

    if (!message?.requestId || !message?.payload) {
      res.status(400).json({ requestId, error: "requestId and payload are required" });
      return;
    }

    const channelCd = String(message.payload.channelCd ?? "");
    const handler = registry.get(channelCd);

    if (!handler) {
      console.log(`[${requestId}] unsupported channelCd: ${channelCd}`);
      res.status(400).json({ requestId, error: `unsupported channelCd: ${channelCd}` });
      return;
    }

    console.log(`[${requestId}] POST /collect channelCd=${channelCd}`);

    handler.handle(message).then((result) => {
      console.log(`[${requestId}] collect completed totalCount=${result.totalCount}`);
      res.json(result);
    }).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${requestId}] collect failed: ${errorMessage}`, error);
      res.status(500).json({ requestId, error: errorMessage });
    });
  });

  return app;
}

export function startServer(port: number): void {
  const app = createApp();
  app.listen(port, () => {
    console.log(`[worker] HTTP server listening on port ${port}`);
  });
}
```

- [ ] **Step 2: 타입체크 확인**

```bash
npm run check
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add Express HTTP server with POST /collect endpoint"
```

---

### Task 9: index.ts 수정

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: index.ts 수정 — HTTP 서버만 시작, DB/Kafka 관련 코드 완전 제거**

`src/index.ts` 파일 전체를 아래 내용으로 교체한다 (DB import, Kafka import, recovery import 모두 제거):

```typescript
import "dotenv/config";
import { startServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3000);

function shutdown(signal: string): void {
  console.log(`[worker] ${signal} received, shutting down`);
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

startServer(PORT);
```

- [ ] **Step 2: 타입체크 확인**

```bash
npm run check
```

Expected: 에러 없음

- [ ] **Step 3: 로컬 서버 기동 확인**

```bash
npm run dev
```

Expected: `[worker] HTTP server listening on port 3000` 출력

- [ ] **Step 4: 동작 확인 (다른 터미널에서)**

```bash
curl -X POST http://localhost:3000/collect \
  -H "Content-Type: application/json" \
  -d "{\"requestId\":\"test-001\",\"sourceErp\":\"ERP\",\"jobType\":\"ORDER_COLLECT\",\"requestKey\":\"k1\",\"payload\":{\"channelCd\":\"INVALID\"}}"
```

Expected: `{"requestId":"test-001","error":"unsupported channelCd: INVALID"}`

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: switch worker entry point to HTTP server, comment out Kafka startup"
```

---

### Task 10: .env.example 업데이트

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: PORT 항목 추가**

`.env.example` 파일 맨 위에 다음 항목 추가:

```
PORT=3000
```

- [ ] **Step 2: .env 파일에도 동일하게 추가**

`.env` 파일 맨 위에 추가:

```
PORT=3000
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add PORT env variable for HTTP server"
```

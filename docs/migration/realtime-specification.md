# Real-Time Subsystem Migration & Interface Specification

This document details the real-time bidirectional communication and streaming architecture migrated from Spring Boot (STOMP/WebSocket + SSE) into the Node.js/Express/MongoDB engine (`backend-node/`).

---

## 1. Architecture Overview

To maintain **100% zero-regression backward compatibility** with the existing React frontend while supporting modern Socket.IO clients, the Node.js backend implements a **Dual-Stack Real-Time Engine** mediated by `realtimeBroker`:

```
                                  ┌────────────────────────┐
                                  │   React 18 Frontend    │
                                  └───────────┬────────────┘
                                              │
                      ┌───────────────────────┼───────────────────────┐
                      │ (Existing STOMP)      │ (SSE Stream)          │ (Socket.IO client)
                      ▼                       ▼                       ▼
            /api/ws-native (ws)      /api/notifications/stream    /socket.io
                      │                       │                       │
             stompAdapter.js                  │               socketioServer.js
                      │                       │                       │
                      └───────────────────────┼───────────────────────┘
                                              │
                                              ▼
                                   ┌──────────────────────┐
                                   │    realtimeBroker    │
                                   └──────────┬───────────┘
                                              │
                   ┌──────────────────────────┴──────────────────────────┐
                   ▼                                                     ▼
     Mongoose Persistence                                   Authorization & Guards
- EventCommunityMessage (MongoDB)                     - Event Registration Check (Booking)
- DirectMessage (MongoDB)                             - Organizer Event Ownership
- Notification (MongoDB)                              - Sliding-window Rate Limiter (DoS protection)
```

---

## 2. Transports & Protocols

| Channel | Protocol | Endpoint | Primary Use Case |
|---|---|---|---|
| **STOMP-over-WS** | STOMP 1.2 over WebSocket | `/api/ws-native` | Existing React components (`EventCommunityChat`, `AttendanceScanner`, `Networking`) |
| **Socket.IO** | Engine.IO v4 / Socket.IO v4 | `/socket.io` | Modern authenticated bidirectional micro-events & room namespaces |
| **SSE** | HTTP EventSource | `/api/notifications/stream?token=...` | Push notifications to inbox (`Notifications.jsx`) |

---

## 3. Socket.IO Events & Payload Specification

### Connection & Authentication Handshake
- **Transport**: `websocket`, `polling`
- **Path**: `/socket.io`
- **Handshake Auth**:
  ```json
  { "token": "<JWT_ACCESS_TOKEN>" }
  ```
  *(Fallback: `Authorization: Bearer <token>` in handshake headers or `?token=<jwt>` in query parameters)*
- **Handshake Validation**: Validates JWT signature, claims, and non-expired status. Attaches `socket.user = { id, email, role }`.
- **Automatic Room Join**: Client automatically joins personal room `user:${socket.user.id}`.

### Event Names, Payloads & Acknowledgment Formats

#### 3.1 Event Community Chat

| Event Name | Direction | Payload | Acknowledgment Format | Auth Guard |
|---|---|---|---|---|
| `community:join` | Client -> Server | `{ "eventId": 881 }` | `{ "success": true, "eventId": 881 }` or `{ "success": false, "error": string }` | Confirmed booking OR event organizer OR ADMIN |
| `community:leave`| Client -> Server | `{ "eventId": 881 }` | `{ "success": true }` | Authenticated |
| `community:send` | Client -> Server | `{ "eventId": 881, "message": string, "messageType"?: "TEXT"\|"FILE"\|"IMAGE", "attachmentUrl"?: string, "announcement"?: boolean, "pin"?: boolean }` | `{ "success": true, "message": MessageDoc }` | Confirmed attendee, event not ended, not muted |
| `community:message` | Server -> Client | `{ "action": "created"\|"updated", "message": MessageDoc }` | N/A (Broadcast) | Sent to `event:${eventId}` members |

#### 3.2 External Scanner Relay

| Event Name | Direction | Payload | Acknowledgment Format | Auth Guard |
|---|---|---|---|---|
| `scanner:join` | Client -> Server | `{ "eventId": 881, "sessionId": "SESSION-XYZ" }` | `{ "success": true }` or `{ "success": false, "error": string }` | Event Organizer OR ADMIN |
| `scanner:relay`| Client -> Server | `{ "eventId": 881, "sessionId": "SESSION-XYZ", "ticketId": "TKT-...", "device": "iPhone" }` | `{ "success": true }` | Event Organizer OR ADMIN |
| `scanner:scan` | Server -> Client | `{ "ticketId": string, "device": string, "eventId": number, "timestamp": number }` | N/A (Broadcast) | Sent to `scanner:${eventId}:${sessionId}` |

> [!IMPORTANT]
> **Strict Validation Security Rule**: The `scanner:relay` event strictly transfers raw scanner input to the organizer's active console. It **never marks attendance** on the server. Ticket verification and check-in are performed solely when the organizer console calls `POST /api/attendance/scan`, which validates event ownership, active ticket status, payment success, and enforces duplicate check-in prevention against MongoDB.

#### 3.3 Direct Chat

| Event Name | Direction | Payload | Acknowledgment Format | Auth Guard |
|---|---|---|---|---|
| `chat:send` | Client -> Server | `{ "receiverId": 123, "content": string, "messageType"?: string, "voiceUrl"?: string, "voiceDurationSeconds"?: number }` | `{ "success": true, "message": DirectMessageDoc }` | Role USER |
| `chat:message` | Server -> Client | `{ "action": "created"\|"updated"\|"deletedForMe", "message": DirectMessageDoc }` | N/A | Recipient user room `user:${userId}` |

#### 3.4 Notifications & Read State

| Event Name | Direction | Payload | Acknowledgment Format | Auth Guard |
|---|---|---|---|---|
| `notification:push` | Server -> Client | `NotificationDoc` | N/A | Recipient user room `user:${recipientId}` |
| `notification:read` | Client -> Server | `{ "notificationId": "<ObjectId>" }` | `{ "success": true }` | Must own the notification |

---

## 4. STOMP-over-WebSocket Protocol (`/api/ws-native`)

Existing React components connect using native WebSocket frames:

### 4.1 Frame Exchanges

#### CONNECT
```stomp
CONNECT
Authorization:Bearer <jwt_token>
accept-version:1.2
heart-beat:10000,10000

^@
```
**Response on Success**:
```stomp
CONNECTED
version:1.2
heart-beat:10000,10000

^@
```
**Response on Failure**:
```stomp
ERROR
message:Valid JWT is required for WebSocket connections

^@
```

#### SUBSCRIBE Destinations & Guards

1. `/topic/events/{eventId}/community`:
   - **Guard**: User must have a `CONFIRMED` booking for `eventId`, be the organizer of `eventId`, or be an `ADMIN`.
2. `/topic/scanner-relay/{eventId}/{sessionId}`:
   - **Guard**: Must be the event organizer or `ADMIN`.
3. `/queue/users/{userId}/chat`:
   - **Guard**: Authenticated `socket.user.id` must equal `{userId}`.
4. `/queue/users/{userId}/notifications`:
   - **Guard**: Authenticated `socket.user.id` must equal `{userId}`.

#### MESSAGE Delivery Frame
```stomp
MESSAGE
subscription:sub-1
message-id:msg-42
destination:/topic/events/881/community
content-type:application/json

{"action":"created","message":{"id":12,"content":"Hello!"}}^@
```

---

## 5. Server-Sent Events (SSE) Stream

- **Endpoint**: `GET /api/notifications/stream?token=<jwt_token>`
- **Headers**:
  ```http
  Content-Type: text/event-stream
  Cache-Control: no-cache, no-transform
  Connection: keep-alive
  X-Accel-Buffering: no
  ```
- **Stream Format**:
  ```text
  event: connected
  data: ok

  : keepalive

  event: notification
  data: {"id":101,"recipientId":991,"notificationType":"EVENT_UPDATE","title":"Schedule Change","message":"...","read":false}
  ```

---

## 6. Protection, Rate Limiting & Resource Cleanup

1. **Sliding-Window Rate Limiting**:
   - Each socket connection tracks message timestamps over a 2000ms window (maximum 10 messages/window). Exceeding clients receive `{ message: 'Rate limit exceeded: Too many messages sent' }` without socket termination.
2. **Resource Cleanup**:
   - On client disconnection (`close` or `disconnect`), timers, subscription maps, and rate limiter windows are purged immediately.
3. **Cross-Protocol Broadcast**:
   - Messages sent via REST, Socket.IO, or STOMP are mediated through `realtimeBroker`, ensuring all connected clients receive updates regardless of transport.

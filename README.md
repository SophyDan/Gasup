# GasUp

GasUp is a mobile-first cooking-gas refill shop app for Benin City. This repository uses TanStack Start, React, and Vite. Paystack orders, payments, customers, cylinders, and server automation logs are stored in a local SQLite database. The wider demo UI still has local-storage seeded records. This repository does not use Next.js or Prisma at runtime; `prisma/schema.prisma` records the requested Prisma data model, while the active server uses Node's SQLite module.

## Run locally

Requirements: Node.js 22.13+ (for the built-in `node:sqlite` module).

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env`. Set a long random `SESSION_SECRET`, `STAFF_EMAIL`, and `STAFF_PASSWORD`; these configure signed sessions and the staff account. `SHOP_NAME`, `SHOP_ADDRESS`, `DELIVERY_FEE_NGN`, and `DATABASE_URL` configure the shop. To enable checkout, add matching `pk_test_` and `sk_test_` keys from your Paystack test integration to `.env`; the provided file leaves them blank, so checkout is disabled until you do. The npm scripts load `.env` into the server process. `MAKE_WEBHOOK_URL` is read only by the server; Make is responsible for sending email. The app does not send email through SMTP or Nodemailer.

## Demo features

- Cylinder price calculations, refill ordering, pickup and delivery
- Customer order history and status display
- Customer registration/login and environment-configured staff login, with role-based server sessions
- Staff order board, pricing, walk-in orders, and refill reminder estimates
- Make webhook calls through `/api/automation`, with failed calls visible in the staff email log
- Demo records seeded in the browser; reset them under Staff → Products & settings
- Server-created Paystack orders are written to SQLite, with verification against Paystack's API before the order is marked paid

Customer passwords are stored as scrypt hashes. Staff login is restricted to the single email/password configured in `.env`; configure strong values before exposing the app publicly. Sessions use a signed HTTP-only cookie. Sign-in attempts are throttled after repeated failures. Password reset tokens are random, single-use, expire after 30 minutes, and are delivered by Make as a `PASSWORD_RESET` event.

## Paystack test card

The Paystack checkout creates an order on the server, initializes checkout using an `sk_test_` key, and verifies the reference and kobo amount server-side on callback. A browser redirect alone does not mark an order paid. `/api/paystack/webhook` also validates Paystack's SHA-512 signature before processing `charge.success`. Live keys are rejected.

Paystack test card: `4084 0840 8408 4081`, any future expiry, any 3-digit CVV. Follow any PIN/OTP prompts using the test values in Paystack's [Test Payments documentation](https://paystack.com/docs/payments/test-payments/).

## Build

```sh
npm run build
```

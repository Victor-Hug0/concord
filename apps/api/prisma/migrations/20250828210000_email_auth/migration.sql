-- Drop Google OAuth column and add email/password auth
ALTER TABLE "User" DROP COLUMN "googleSub";
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';

-- Remove placeholder default after backfill (existing rows must be re-seeded)
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;

CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailVerification_email_idx" ON "EmailVerification"("email");
CREATE INDEX "EmailVerification_tokenHash_idx" ON "EmailVerification"("tokenHash");

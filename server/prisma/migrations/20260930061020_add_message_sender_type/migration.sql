-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('agent', 'customer');

-- AlterTable: add nullable, backfill from direction, then make it required
ALTER TABLE "message" ADD COLUMN     "senderType" "MessageSenderType";

UPDATE "message"
SET "senderType" = CASE WHEN "direction" = 'inbound' THEN 'customer'::"MessageSenderType" ELSE 'agent'::"MessageSenderType" END;

ALTER TABLE "message" ALTER COLUMN "senderType" SET NOT NULL;

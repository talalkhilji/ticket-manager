-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'agent');

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "ForwardStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WatchStatus" AS ENUM ('ACTIVE', 'CONFIRMED', 'EXPIRED', 'INACTIVE');

-- CreateTable
CREATE TABLE "disposable_wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "derivationPath" TEXT NOT NULL,
    "qrCode" TEXT,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disposable_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "network" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "webhookSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forward_transactions" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "forwardTxHash" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" "ForwardStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forward_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_watches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT 'USDT',
    "expectedAmount" TEXT NOT NULL,
    "actualAmount" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "WatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "webhookSent" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "txHash" TEXT,
    "paymentId" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disposable_wallets_userId_idx" ON "disposable_wallets"("userId");

-- CreateIndex
CREATE INDEX "disposable_wallets_network_idx" ON "disposable_wallets"("network");

-- CreateIndex
CREATE INDEX "disposable_wallets_address_idx" ON "disposable_wallets"("address");

-- CreateIndex
CREATE INDEX "disposable_wallets_isUsed_idx" ON "disposable_wallets"("isUsed");

-- CreateIndex
CREATE INDEX "disposable_wallets_createdAt_idx" ON "disposable_wallets"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "disposable_wallets_userId_network_key" ON "disposable_wallets"("userId", "network");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_txId_key" ON "deposits"("txId");

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "disposable_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forward_transactions" ADD CONSTRAINT "forward_transactions_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_watches" ADD CONSTRAINT "deposit_watches_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "disposable_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

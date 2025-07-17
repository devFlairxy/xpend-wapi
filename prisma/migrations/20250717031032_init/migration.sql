-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "ForwardStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WatchStatus" AS ENUM ('ACTIVE', 'CONFIRMED', 'EXPIRED', 'INACTIVE');

-- CreateTable
CREATE TABLE "user_wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ethereumAddress" TEXT NOT NULL,
    "ethereumPrivateKey" TEXT NOT NULL,
    "ethereumDerivationPath" TEXT NOT NULL,
    "ethereumQrCode" TEXT,
    "bscAddress" TEXT NOT NULL,
    "bscPrivateKey" TEXT NOT NULL,
    "bscDerivationPath" TEXT NOT NULL,
    "bscQrCode" TEXT,
    "polygonAddress" TEXT NOT NULL,
    "polygonPrivateKey" TEXT NOT NULL,
    "polygonDerivationPath" TEXT NOT NULL,
    "polygonQrCode" TEXT,
    "solanaAddress" TEXT NOT NULL,
    "solanaPrivateKey" TEXT NOT NULL,
    "solanaDerivationPath" TEXT NOT NULL,
    "solanaQrCode" TEXT,
    "tronAddress" TEXT NOT NULL,
    "tronPrivateKey" TEXT NOT NULL,
    "tronDerivationPath" TEXT NOT NULL,
    "tronQrCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userWalletId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "network" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
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
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "expectedAmount" TEXT NOT NULL,
    "actualAmount" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "WatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "webhookSent" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "txHash" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_wallets_userId_key" ON "user_wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_txId_key" ON "deposits"("txId");

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_userWalletId_fkey" FOREIGN KEY ("userWalletId") REFERENCES "user_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forward_transactions" ADD CONSTRAINT "forward_transactions_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

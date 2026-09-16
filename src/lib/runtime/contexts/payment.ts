/**
 * Payment Context: ETH and USDG payments on Robinhood Chain, including x402
 * authorizations (EIP-3009) and the full x402 HTTP flow for paid resources.
 */

import { formatUnits, isAddressEqual, type Address } from "viem";
import { TREASURY_ADDRESS, explorerTx } from "@/lib/chain/config";
import { publicClientFor, type LiveChain } from "@/lib/chain/live";
import {
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  X402_VERSION,
  createAuthorization,
  decodeHeader,
  encodeHeader,
  paymentRequiredSchema,
  toUsdgUnits,
  type PaymentPayload,
  type SettlementResponse,
} from "@/lib/chain/x402";
import { formatAmount, shorten } from "@/lib/format";
import { GAS_UNITS, PRIORITY_ETA, PRIORITY_GAS_MULTIPLIER, RUNTIME_TUNING } from "../catalog";
import { createId } from "../crypto";
import { liveTxRef } from "../tx";
import type { Balances, Currency, FeeEstimate, FeePriority, Payment, PaymentMethod, TraceStep, TxRef } from "../types";
import { nowIso, round } from "../utils";
import { BaseContext } from "./base";
import type { BlockchainContext } from "./blockchain";
import type { PrivacyContext } from "./privacy";
import type { WalletContext } from "./wallet";

export interface PaymentState {
  balances: Record<string, Balances>;
  payments: Payment[];
}

export interface PaymentRequest {
  amount: number;
  currency: Currency;
  recipient: Address;
  memo?: string;
  priority: FeePriority;
  private: boolean;
  method: PaymentMethod;
}

export interface PremiumPurchase {
  payment: Payment;
  data: unknown;
}

const DECIMALS: Record<Currency, number> = { ETH: 18, USDG: 6 };
const PREMIUM_PATH = "/api/x402/premium";

function gasUnitsFor(currency: Currency, method: PaymentMethod): number {
  if (method === "x402") return GAS_UNITS.authorization;
  return currency === "ETH" ? GAS_UNITS.ethTransfer : GAS_UNITS.tokenTransfer;
}

function tracer() {
  const startedAt = performance.now();
  const trace: TraceStep[] = [];
  return {
    trace,
    step: (label: string) => trace.push({ label, offsetMs: Math.round(performance.now() - startedAt) }),
  };
}

export class PaymentContext extends BaseContext<PaymentState> {
  readonly id = "payment";
  readonly name = "Payment Context";
  readonly description = "ETH and USDG payments with x402 authorizations on Robinhood Chain";

  protected initialState(): PaymentState {
    return { balances: {}, payments: [] };
  }

  private get wallet(): WalletContext {
    return this.dependency<WalletContext>("wallet");
  }

  private get privacy(): PrivacyContext {
    return this.dependency<PrivacyContext>("privacy");
  }

  private get blockchain(): BlockchainContext {
    return this.dependency<BlockchainContext>("blockchain");
  }

  /* ------------------------------------------------------------ balances */

  balanceOf(address: string): Balances {
    return this.state.balances[address] ?? { ...RUNTIME_TUNING.startingBalances };
  }

  private storeBalances(address: string, balances: Balances): Balances {
    this.setState({ balances: { ...this.state.balances, [address]: balances } });
    return balances;
  }

  async refreshBalances(): Promise<Balances> {
    const wallet = this.wallet.requireWallet();
    const live = this.wallet.liveChain();
    if (!live) return this.balanceOf(wallet.address);
    return this.storeBalances(wallet.address, await live.balances());
  }

  private settle(address: string, charges: Partial<Balances>): Balances {
    const current = this.balanceOf(address);
    const next = { ...current };

    for (const currency of Object.keys(charges) as Currency[]) {
      const amount = charges[currency] ?? 0;
      if (amount > current[currency] + 1e-12) {
        throw new Error(
          `Insufficient ${currency} balance. Required ${formatAmount(amount, currency, 8)}, available ${formatAmount(current[currency], currency, 8)}.`,
        );
      }
      next[currency] = round(current[currency] - amount, DECIMALS[currency]);
    }
    return next;
  }

  /** Demo ledger check. Live wallets are checked against on-chain balances. */
  assertFunds(address: string, charges: Partial<Balances>): void {
    this.settle(address, charges);
  }

  /** Demo ledger debit. Live balances change on-chain and are re-read instead. */
  debit(address: string, charges: Partial<Balances>): Balances {
    return this.storeBalances(address, this.settle(address, charges));
  }

  async airdrop(input: { currency: Currency }): Promise<{ currency: Currency; amount: number; balances: Balances }> {
    const { address } = this.wallet.requireWallet();
    if (this.wallet.liveChain()) {
      throw new Error(`Airdrops only exist in demo mode. Get testnet ${input.currency} from a Robinhood Chain faucet.`);
    }
    await this.latency.wait(400, 900);

    const amount = RUNTIME_TUNING.airdrop[input.currency];
    const current = this.balanceOf(address);
    const balances = this.storeBalances(address, {
      ...current,
      [input.currency]: round(current[input.currency] + amount, DECIMALS[input.currency]),
    });
    return { currency: input.currency, amount, balances };
  }

  /* ---------------------------------------------------------------- fees */

  estimateFees(input: { currency: Currency; method: PaymentMethod; priority: FeePriority }): FeeEstimate {
    const gasUnits = gasUnitsFor(input.currency, input.method);
    const gasPriceGwei = round(this.blockchain.gasPriceGwei() * PRIORITY_GAS_MULTIPLIER[input.priority], 6);
    return {
      gasUnits,
      gasPriceGwei,
      total: round(gasUnits * gasPriceGwei * 1e-9, 12),
      currency: "ETH",
      priority: input.priority,
      estimatedTime: PRIORITY_ETA[input.priority],
    };
  }

  /**
   * Checks the wallet can cover an amount. Gas is only required when the wallet
   * submits the transaction itself; a facilitator-settled x402 payment needs none.
   */
  private async assertLiveFunds(
    live: LiveChain,
    address: Address,
    currency: Currency,
    amount: number,
    { paysGas = true } = {},
  ): Promise<void> {
    const balances = this.storeBalances(address, await live.balances());
    if (balances[currency] < amount) {
      throw new Error(`Insufficient ${currency} on ${this.blockchain.activeNetwork.name}: ${formatAmount(balances[currency], currency, 6)} available.`);
    }
    if (paysGas && balances.ETH <= 0) throw new Error("This wallet has no ETH for gas. Use a Robinhood Chain faucet first.");
  }

  /* ------------------------------------------------------------ payments */

  async processPayment(request: PaymentRequest): Promise<Payment> {
    const wallet = this.wallet.requireWallet();
    if (isAddressEqual(request.recipient, wallet.address)) throw new Error("Sender and recipient must be different addresses.");
    if (request.method === "x402" && request.currency !== "USDG") throw new Error("x402 authorizations settle in USDG.");

    const live = this.wallet.liveChain();
    const { trace, step } = tracer();
    const gasUnits = gasUnitsFor(request.currency, request.method);
    const estimate = this.estimateFees(request);
    step(request.method === "x402" ? "x402 payment requested" : "Transfer requested");

    const charges = (fee: number): Partial<Balances> =>
      request.currency === "ETH" ? { ETH: request.amount + fee } : { USDG: request.amount, ETH: fee };

    if (live) await this.assertLiveFunds(live, wallet.address, request.currency, request.amount);
    else this.assertFunds(wallet.address, charges(estimate.total));
    step(`Fee estimated · ${estimate.total} ETH`);

    let proofId: string | undefined;
    if (request.private) {
      const proof = await this.privacy.generateProof({
        statement: `payment of ${request.amount} ${request.currency} is within policy`,
        circuit: "payment-range",
        privateInputs: { amount: String(request.amount), recipient: request.recipient, memo: request.memo || "none" },
      });
      proofId = proof.id;
      step("Zero-knowledge proof attached");
    }

    let tx: TxRef;
    if (live) {
      if (request.method === "x402") {
        const authorization = createAuthorization({
          from: wallet.address,
          to: request.recipient,
          value: toUsdgUnits(request.amount),
          validForSeconds: 600,
        });
        const signature = await live.signAuthorization(authorization);
        step("EIP-3009 authorization signed");
        tx = liveTxRef(await live.submitAuthorization(authorization, signature), live.network);
      } else {
        const summary =
          request.currency === "ETH"
            ? await live.transferEth(request.recipient, request.amount)
            : await live.transferUsdg(request.recipient, request.amount);
        tx = liveTxRef(summary, live.network);
      }
      step(`Confirmed in block ${tx.blockNumber}`);
      await this.refreshBalances().catch(() => undefined);
    } else {
      await this.latency.wait(250, 600);
      step(request.method === "x402" ? "EIP-3009 authorization signed" : "Transaction signed");
      tx = this.blockchain.simulateTx(gasUnits);
      this.debit(wallet.address, charges(tx.fee));
      await this.latency.wait(250, 600);
      step(`Confirmed in block ${tx.blockNumber}`);
    }
    step("Settled on Robinhood Chain");

    const payment: Payment = {
      id: createId("pay"),
      amount: request.amount,
      currency: request.currency,
      sender: wallet.address,
      recipient: request.recipient,
      memo: request.memo || undefined,
      priority: request.priority,
      private: request.private,
      proofId,
      method: request.method,
      settledBy: live ? "wallet" : "simulator",
      tx,
      trace,
      createdAt: nowIso(),
    };

    this.recordPayment(payment);
    return payment;
  }

  private recordPayment(payment: Payment): void {
    this.blockchain.recordTransaction({
      kind: payment.method === "x402" ? "authorization" : "transfer",
      from: payment.sender,
      to: payment.recipient,
      data: payment.memo ?? `${payment.amount} ${payment.currency}`,
      value: payment.currency === "ETH" ? payment.amount : 0,
      tx: payment.tx,
    });
    this.setState({ payments: [payment, ...this.state.payments].slice(0, RUNTIME_TUNING.historyLimit) });
  }

  /**
   * Buy the premium resource through the real x402 HTTP flow: 402 challenge,
   * EIP-3009 signature in the wallet, settlement by the server facilitator.
   */
  async purchasePremium(): Promise<PremiumPurchase> {
    const wallet = this.wallet.requireWallet();
    const live = this.wallet.liveChain();
    const url = `${this.options.apiBase}${PREMIUM_PATH}`;
    const { trace, step } = tracer();

    if (!live) {
      const amount = 0.01;
      this.assertFunds(wallet.address, { USDG: amount });
      step(`GET ${PREMIUM_PATH} → 402 Payment Required (simulated)`);
      await this.latency.wait(250, 500);
      step("EIP-3009 authorization signed");
      const tx = { ...this.blockchain.simulateTx(GAS_UNITS.authorization), fee: 0 };
      this.debit(wallet.address, { USDG: amount });
      await this.latency.wait(250, 500);
      step("Facilitator settled · 200 OK");

      const payment = this.buildPremiumPayment(wallet.address, RUNTIME_TUNING.demoTreasury, amount, "simulator", tx, trace, url);
      this.recordPayment(payment);
      return { payment, data: { resource: "zkx8004-signal-feed", simulated: true, signal: { congestion: "normal" } } };
    }

    step(`GET ${PREMIUM_PATH}`);
    const challenge = await fetch(url, { cache: "no-store" });
    if (challenge.status === 503) {
      throw new Error("The server has no x402 facilitator configured. Set X402_FACILITATOR_PRIVATE_KEY and restart.");
    }
    if (challenge.status !== 402) throw new Error(`Expected 402 Payment Required, received ${challenge.status}.`);

    const offer = paymentRequiredSchema.safeParse(await challenge.json());
    const requirements = offer.success ? offer.data.accepts.find((item) => item.network === live.network.id) : undefined;
    if (!requirements) throw new Error(`The resource does not accept payments on ${live.network.name}.`);

    const amount = Number(formatUnits(BigInt(requirements.maxAmountRequired), requirements.extra.decimals));
    step(`402 Payment Required · ${amount} USDG to ${shorten(requirements.payTo)}`);
    // The server facilitator submits the settlement, so the buyer pays no gas.
    await this.assertLiveFunds(live, wallet.address, "USDG", amount, { paysGas: false });

    const authorization = createAuthorization({
      from: wallet.address,
      to: requirements.payTo,
      value: BigInt(requirements.maxAmountRequired),
      validForSeconds: requirements.maxTimeoutSeconds,
    });
    const signature = await live.signAuthorization(authorization);
    step("EIP-3009 authorization signed");

    const payload: PaymentPayload = {
      x402Version: X402_VERSION,
      scheme: "exact",
      network: live.network.id,
      payload: { signature, authorization },
    };
    const response = await fetch(url, { cache: "no-store", headers: { [PAYMENT_HEADER]: encodeHeader(payload) } });
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const reason = body && typeof body === "object" && "error" in body ? String(body.error) : `HTTP ${response.status}`;
      throw new Error(`Payment rejected by the facilitator: ${reason}.`);
    }

    const receiptHeader = response.headers.get(PAYMENT_RESPONSE_HEADER);
    const settlement = receiptHeader ? (decodeHeader(receiptHeader) as SettlementResponse) : undefined;
    if (!settlement?.success || !settlement.transaction) throw new Error("The resource was returned without a settlement receipt.");
    step("Facilitator settled on Robinhood Chain");

    const receipt = await publicClientFor(live.network)
      .getTransactionReceipt({ hash: settlement.transaction })
      .catch(() => undefined);
    const tx: TxRef = {
      hash: settlement.transaction,
      network: live.network.id,
      blockNumber: receipt ? Number(receipt.blockNumber) : 0,
      fee: 0,
      mode: "live",
      explorerUrl: explorerTx(live.network, settlement.transaction),
    };
    step("200 OK · resource unlocked");
    await this.refreshBalances().catch(() => undefined);

    const payment = this.buildPremiumPayment(wallet.address, requirements.payTo, amount, "facilitator", tx, trace, url);
    this.recordPayment(payment);
    return { payment, data: body };
  }

  private buildPremiumPayment(
    sender: Address,
    recipient: Address,
    amount: number,
    settledBy: Payment["settledBy"],
    tx: TxRef,
    trace: TraceStep[],
    resource: string,
  ): Payment {
    return {
      id: createId("pay"),
      amount,
      currency: "USDG",
      sender,
      recipient,
      memo: "Premium signal feed",
      priority: "medium",
      private: false,
      method: "x402",
      settledBy,
      resource,
      tx,
      trace,
      createdAt: nowIso(),
    };
  }

  /** Protocol fee paid by other contexts. Live fees require NEXT_PUBLIC_TREASURY_ADDRESS. */
  async charge(amount: number, memo: string): Promise<Payment | undefined> {
    if (amount <= 0) return undefined;
    const live = this.wallet.liveChain();
    const recipient = live ? TREASURY_ADDRESS : RUNTIME_TUNING.demoTreasury;
    if (!recipient) return undefined;

    return this.processPayment({ amount, currency: "USDG", recipient, memo, priority: "medium", private: false, method: "transfer" });
  }
}

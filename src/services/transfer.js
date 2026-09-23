const crypto = require("node:crypto");
const db = require("../db");
const { audit } = require("./audit");

function reference() {
  return `TXN${Date.now()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function transfer({ userId, senderAccountId, receiverAccountNumber, amount, remarks, ip }) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    throw new Error("Invalid transfer amount");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const senderResult = await client.query(
      `SELECT id, user_id, balance, status
       FROM accounts
       WHERE id=$1 AND user_id=$2
       FOR UPDATE`,
      [senderAccountId, userId]
    );

    if (!senderResult.rowCount) throw new Error("Sender account not found");
    const sender = senderResult.rows[0];

    if (sender.status !== "ACTIVE") throw new Error("Sender account is not active");

    const receiverResult = await client.query(
      `SELECT id, user_id, account_number, status
       FROM accounts
       WHERE account_number=$1
       FOR UPDATE`,
      [receiverAccountNumber]
    );

    if (!receiverResult.rowCount) throw new Error("Receiver account not found");

    const receiver = receiverResult.rows[0];
    if (receiver.status !== "ACTIVE") throw new Error("Receiver account is not active");
    if (Number(sender.id) === Number(receiver.id)) throw new Error("Cannot transfer to the same account");

    const senderBalance = Number(sender.balance);
    if (senderBalance < amount) throw new Error("Insufficient balance");

    await client.query(
      `UPDATE accounts SET balance=balance-$1 WHERE id=$2`,
      [amount, sender.id]
    );

    await client.query(
      `UPDATE accounts SET balance=balance+$1 WHERE id=$2`,
      [amount, receiver.id]
    );

    const ref = reference();

    await client.query(
      `INSERT INTO transactions(
        id,sender_account_id,receiver_account_id,amount,transaction_type,status,reference,remarks
       )
       VALUES($1,$2,$3,$4,'INTERNAL_TRANSFER','SUCCESS',$5,$6)`,
      [crypto.randomUUID(), sender.id, receiver.id, amount, ref, remarks || null]
    );

    await client.query("COMMIT");

    await audit(userId, "FUND_TRANSFER", {
      reference: ref,
      senderAccountId: sender.id,
      receiverAccountNumber,
      amount
    }, ip);

    return { reference: ref };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { transfer };

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash("Demo@12345", 12);

    const userResult = await client.query(
      `INSERT INTO users(customer_id, full_name, email, password_hash)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(customer_id) DO UPDATE SET full_name=EXCLUDED.full_name, email=EXCLUDED.email
       RETURNING id`,
      ["demo", "Demo Customer", "demo@example.local", passwordHash]
    );

    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO accounts(user_id, account_number, account_type, balance)
       VALUES($1,$2,'SAVINGS',250000.00)
       ON CONFLICT(account_number) DO NOTHING`,
      [userId, "SB1000000001"]
    );

    await client.query(
      `INSERT INTO accounts(user_id, account_number, account_type, balance)
       VALUES($1,$2,'SAVINGS',75000.00)
       ON CONFLICT(account_number) DO NOTHING`,
      [userId, "SB1000000002"]
    );

    await client.query(
      `INSERT INTO beneficiaries(user_id,nickname,name,account_number,ifsc)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(user_id,account_number) DO NOTHING`,
      [userId, "DemoPayee", "Demo Payee", "SB1000000002", "SBIN0000001"]
    );

    await client.query("COMMIT");
    console.log("Seed completed.");
    console.log("Customer ID: demo");
    console.log("Password: Demo@12345");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

require("dotenv").config();

const path = require("node:path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");

const db = require("./db");
const csrfMiddleware = require("./csrf");
const { requireAuth } = require("./middleware/auth");
const { audit } = require("./services/audit");
const { transfer } = require("./services/transfer");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  store: new pgSession({
    pool: db,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 60 * 1000
  }
}));

app.use(csrfMiddleware);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.render("home");
});

app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "UP", database: "UP", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "DOWN", database: "DOWN" });
  }
});

app.get("/auth/login", (req, res) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  req.session.captcha = Array.from({length: 5}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  res.render("login", { captcha: req.session.captcha });
});

app.post("/auth/login", loginLimiter, async (req, res) => {
  const { customerId, password, captcha } = req.body;

  if (!captcha || captcha.toUpperCase() !== req.session.captcha) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    req.session.captcha = Array.from({length: 5}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return res.status(401).render("login", { error: "Invalid captcha", captcha: req.session.captcha });
  }

  try {
    const result = await db.query(
      `SELECT id, customer_id, full_name, email, password_hash
       FROM users WHERE customer_id=$1`,
      [String(customerId || "").trim()]
    );

    if (!result.rowCount) return res.status(401).render("login", { error: "Invalid credentials" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(String(password || ""), user.password_hash);

    if (!valid) return res.status(401).render("login", { error: "Invalid credentials" });

    req.session.regenerate(async (err) => {
      if (err) return res.status(500).send("Session error");
      req.session.user = {
        id: user.id,
        customerId: user.customer_id,
        fullName: user.full_name,
        email: user.email
      };
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
      await audit(user.id, "LOGIN_SUCCESS", {}, req.ip);
      res.redirect("/dashboard");
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("login", { error: "Unable to process login" });
  }
});

app.get("/auth/register", (req, res) => res.render("register"));

app.post("/auth/register", loginLimiter, async (req, res) => {
  const { customerId, fullName, email, password } = req.body;

  if (!/^[a-zA-Z0-9_]{4,50}$/.test(customerId || "")) {
    return res.status(400).render("register", { error: "Customer ID must be 4-50 letters, numbers or underscore." });
  }

  if (!fullName || !email || !password || password.length < 10) {
    return res.status(400).render("register", { error: "Enter all fields. Password must be at least 10 characters." });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users(customer_id,full_name,email,password_hash)
       VALUES($1,$2,$3,$4)
       RETURNING id`,
      [customerId.trim(), fullName.trim(), email.trim().toLowerCase(), hash]
    );

    const accountNumber = `SB${Math.floor(1000000000 + Math.random() * 8999999999)}`;

    await db.query(
      `INSERT INTO accounts(user_id,account_number,account_type,balance)
       VALUES($1,$2,'SAVINGS',0)`,
      [result.rows[0].id, accountNumber]
    );

    res.redirect("/auth/login");
  } catch (err) {
    console.error(err);
    res.status(400).render("register", { error: "Registration failed. Customer ID/email may already exist." });
  }
});

app.post("/auth/logout", requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  await audit(userId, "LOGOUT", {}, req.ip);
  req.session.destroy(() => res.redirect("/"));
});

app.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const accounts = await db.query(
      `SELECT id, account_number, account_type, balance, currency, status
       FROM accounts WHERE user_id=$1 ORDER BY id`,
      [req.session.user.id]
    );

    const txns = await db.query(
      `SELECT t.reference,t.amount,t.transaction_type,t.status,t.remarks,t.created_at,
              sa.account_number sender_account, ra.account_number receiver_account
       FROM transactions t
       LEFT JOIN accounts sa ON sa.id=t.sender_account_id
       LEFT JOIN accounts ra ON ra.id=t.receiver_account_id
       WHERE sa.user_id=$1 OR ra.user_id=$1
       ORDER BY t.created_at DESC LIMIT 10`,
      [req.session.user.id]
    );

    res.render("dashboard", {
      accounts: accounts.rows,
      transactions: txns.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to load dashboard");
  }
});

app.get("/accounts", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, account_number, account_type, balance, currency, status
       FROM accounts WHERE user_id=$1 ORDER BY id`,
      [req.session.user.id]
    );

    if (!result.rowCount) return res.status(404).render("error", { message: "No accounts found for this customer." });

    res.render("accounts", { accounts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).render("error", { message: "Unable to load accounts" });
  }
});

app.get("/transfer", requireAuth, async (req, res) => {
  const accounts = await db.query(
    `SELECT id,account_number,balance FROM accounts WHERE user_id=$1 AND status='ACTIVE'`,
    [req.session.user.id]
  );

  const beneficiaries = await db.query(
    `SELECT id,nickname,name,account_number,ifsc FROM beneficiaries WHERE user_id=$1 ORDER BY nickname`,
    [req.session.user.id]
  );

  res.render("transfer", { accounts: accounts.rows, beneficiaries: beneficiaries.rows });
});

app.post("/beneficiaries", requireAuth, async (req, res) => {
  const { nickname, name, accountNumber, ifsc } = req.body;

  if (!nickname || !name || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc || "")) {
    return res.status(400).send("Invalid beneficiary details");
  }

  await db.query(
    `INSERT INTO beneficiaries(user_id,nickname,name,account_number,ifsc)
     VALUES($1,$2,$3,$4,$5)`,
    [req.session.user.id, nickname.trim(), name.trim(), accountNumber.trim(), ifsc.trim().toUpperCase()]
  );

  await audit(req.session.user.id, "BENEFICIARY_ADDED", {
    nickname, accountNumber: accountNumber.slice(-4), ifsc
  }, req.ip);

  res.redirect("/transfer");
});

app.post("/transfer", requireAuth, async (req, res) => {
  const { senderAccountId, receiverAccountNumber, amount, remarks } = req.body;

  try {
    const result = await transfer({
      userId: req.session.user.id,
      senderAccountId: Number(senderAccountId),
      receiverAccountNumber: String(receiverAccountNumber).trim(),
      amount: Number(amount),
      remarks: String(remarks || "").slice(0, 255),
      ip: req.ip
    });

    res.render("success", { reference: result.reference, amount: Number(amount).toFixed(2) });
  } catch (err) {
    console.error(err);
    res.status(400).render("error", { message: err.message });
  }
});

app.get("/api/accounts", requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT id,account_number,account_type,balance,currency,status
     FROM accounts WHERE user_id=$1`,
    [req.session.user.id]
  );
  res.json(result.rows);
});

app.get("/api/transactions", requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT t.reference,t.amount,t.transaction_type,t.status,t.remarks,t.created_at,
            sa.account_number sender_account,ra.account_number receiver_account
     FROM transactions t
     LEFT JOIN accounts sa ON sa.id=t.sender_account_id
     LEFT JOIN accounts ra ON ra.id=t.receiver_account_id
     WHERE sa.user_id=$1 OR ra.user_id=$1
     ORDER BY t.created_at DESC LIMIT 50`,
    [req.session.user.id]
  );
  res.json(result.rows);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Internal server error");
});

app.listen(PORT, () => {
  console.log(`SecureBank running at http://localhost:${PORT}`);
});

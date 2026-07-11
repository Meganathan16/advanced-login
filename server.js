// ==============================
// server.js - PART 1
// ==============================

require("dotenv").config();


const axios = require("axios");
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bodyParser = require("body-parser");
const SibApiV3Sdk = require("@getbrevo/brevo");

const app = express();

// Middleware
app.use(express.static("public"));
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));


// ==============================
// MySQL Connection Pool
// ==============================
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Create users table automatically
(async () => {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                is_verified TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("✅ Users table is ready");
    } catch (err) {
        console.error("❌ Error creating table:", err);
    }
})();

// 👇 ADD THE FUNCTION HERE
async function sendOTP(email, otp, subject) {
    try {
        await axios.post(
            "https://api.brevo.com/v3/smtp/email",
            {
                sender: {
                    name: "Advanced Login",
                    email: process.env.SENDER_EMAIL
                },
                to: [
                    {
                        email: email
                    }
                ],
                subject: subject,
                htmlContent: `
                    <h2>Your OTP</h2>
                    <h1>${otp}</h1>
                    <p>This OTP is valid for 5 minutes.</p>
                `
            },
            {
                headers: {
                    "api-key": process.env.BREVO_API_KEY,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("✅ OTP Email Sent");
    } catch (err) {
        console.error(err.response?.data || err.message);
        throw err;
    }
}
// ==============================
// Brevo SMTP
// ==============================
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

apiInstance.setApiKey(
    SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
);

transporter.verify((error, success) => {
    if (error) {
        console.error("SMTP Verify Error:", error);
    } else {
        console.log("✅ SMTP Ready");
    }
});

// Test SMTP Connection

// ==============================
// Temporary OTP Storage
// ==============================
let pendingSignups = {};
let pendingLogins = {};

// ==============================
// SIGNUP
// ==============================
app.post("/signup", async (req, res) => {

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            message: "All fields are required."
        });
    }

    try {

        // Check if account already exists
        const [rows] = await db.execute(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if (rows.length > 0) {
            return res.status(400).json({
                message: "Account already exists."
            });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000);

        // Store temporarily
        pendingSignups[email] = {
            name,
            email,
            password,
            otp
        };

        // Send OTP Email
       await sendOTP(email, otp, "Signup OTP");

        res.json({
            success: true,
            message: "OTP sent successfully."
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

// ==============================
// VERIFY SIGNUP OTP
// ==============================

app.post("/verify-signup-otp", async (req, res) => {

    const { email, otp } = req.body;

    try {

        const pending = pendingSignups[email];

        if (!pending) {
            return res.status(400).json({
                success: false,
                message: "No pending signup found."
            });
        }

        if (Number(otp) !== pending.otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP."
            });
        }

        // Save user to database
        await db.execute(
            `INSERT INTO users
            (name, email, password, is_verified)
            VALUES (?, ?, ?, ?)`,
            [
                pending.name,
                pending.email,
                pending.password,
                1
            ]
        );

        // Remove pending signup
        delete pendingSignups[email];

        res.json({
            success: true,
            message: "Signup successful! You can now login."
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

// ==============================
// LOGIN
// ==============================

app.post("/login", async (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required."
        });
    }

    try {

        // Find user
        const [rows] = await db.execute(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Account not found."
            });
        }

        const user = rows[0];

        // Check email verification
        if (user.is_verified != 1) {
            return res.status(400).json({
                success: false,
                message: "Please verify your email first."
            });
        }

        // Check password
        if (user.password !== password) {
            return res.status(400).json({
                success: false,
                message: "Incorrect password."
            });
        }

        // Generate Login OTP
        const otp = Math.floor(100000 + Math.random() * 900000);

        pendingLogins[email] = {
            otp
        };

        // Send OTP
await sendOTP(email, otp, "Login OTP");

        res.json({
            success: true,
            message: "Login OTP sent successfully."
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

// ==============================
// VERIFY LOGIN OTP
// ==============================

app.post("/verify-login-otp", async (req, res) => {

    const { email, otp } = req.body;

    try {

        const pending = pendingLogins[email];

        if (!pending) {
            return res.status(400).json({
                success: false,
                message: "No pending login found."
            });
        }

        if (Number(otp) !== pending.otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP."
            });
        }

        delete pendingLogins[email];

        res.json({
            success: true,
            message: "Login successful!",
            user: {
                email: email
            }
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

// ==============================
// DEFAULT ROUTE
// ==============================



// ==============================
// START SERVER
// ==============================


const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server Running on port ${PORT}`);
});

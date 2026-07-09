-- Create Database
CREATE DATABASE IF NOT EXISTS red_bus;

-- Use Database
USE red_bus;

-- Drop table if it already exists (Optional)
DROP TABLE IF EXISTS users;

-- Create Users Table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    is_verified TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

select * from users;

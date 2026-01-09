# Account Management Application

A comprehensive account management system with purchase order tracking, customer management, and billing features.

## Features

- **Account Management**: Create and manage customer accounts
- **Purchase Order Management**: Track purchase orders with line items
- **Billing Details**: Manage billing information for orders
- **Activity Logging**: Track all system activities with timestamps
- **User Authentication**: Secure login system

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite
- **Frontend**: HTML, CSS, JavaScript

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/rachitas29/Account-Management.git
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   node server.js
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Project Structure

- `server.js` - Main server file
- `database.js` - Database configuration and queries
- `public/` - Frontend files (HTML, CSS, JavaScript)
- `database.sqlite` - SQLite database file

## Database Schema

The application uses SQLite with tables for:
- Users
- Accounts
- Purchase Orders
- Line Items
- Billing Details
- Activities

## License

ISC

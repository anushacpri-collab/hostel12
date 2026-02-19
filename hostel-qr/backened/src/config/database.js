const mysql = require('mysql2/promise');
require('dotenv').config();

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hostel_qr_system',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test database connection
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
};

// Execute query helper
const query = async (sql, params) => {
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error.message);
        throw error;
    }
};

// Transaction helper
const transaction = async (callback) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// Get single row
const getOne = async (sql, params) => {
    const results = await query(sql, params);
    return results.length > 0 ? results[0] : null;
};

// Get multiple rows
const getMany = async (sql, params) => {
    return await query(sql, params);
};

// Insert and return ID
const insert = async (sql, params) => {
    const result = await query(sql, params);
    return result.insertId;
};

// Update and return affected rows
const update = async (sql, params) => {
    const result = await query(sql, params);
    return result.affectedRows;
};

// Delete and return affected rows
const remove = async (sql, params) => {
    const result = await query(sql, params);
    return result.affectedRows;
};

// Close pool
const closePool = async () => {
    await pool.end();
    console.log('Database pool closed');
};

module.exports = {
    pool,
    testConnection,
    query,
    transaction,
    getOne,
    getMany,
    insert,
    update,
    remove,
    closePool
};
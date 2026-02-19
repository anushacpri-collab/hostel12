// =====================================================
// UTILITY FUNCTIONS
// =====================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('../config/database');

// =====================================================
// JWT UTILITIES
// =====================================================

/**
 * Generate JWT access token
 */
const generateAccessToken = (userId, roleId, roleName) => {
    return jwt.sign(
        { userId, roleId, roleName },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (userId) => {
    return jwt.sign(
        { userId, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
        return null;
    }
};

// =====================================================
// PASSWORD UTILITIES
// =====================================================

/**
 * Hash password using bcrypt
 */
const hashPassword = async (password) => {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    return await bcrypt.hash(password, rounds);
};

/**
 * Compare password with hash
 */
const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

// =====================================================
// OTP UTILITIES
// =====================================================

/**
 * Generate random OTP
 */
const generateOTP = () => {
    const length = parseInt(process.env.OTP_LENGTH) || 6;
    return crypto.randomInt(100000, 999999).toString().padStart(length, '0');
};

/**
 * Store OTP in database
 */
const storeOTP = async (userId, phoneNumber, purpose = 'LOGIN') => {
    const otp = generateOTP();
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await db.query(
        `INSERT INTO otp_verifications (user_id, phone_number, otp_code, purpose, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, phoneNumber, otp, purpose, expiresAt]
    );

    return otp;
};

/**
 * Verify OTP
 */
const verifyOTP = async (phoneNumber, otp, purpose = 'LOGIN') => {
    const result = await db.getOne(
        `SELECT * FROM otp_verifications 
         WHERE phone_number = ? 
         AND otp_code = ? 
         AND purpose = ? 
         AND is_verified = FALSE 
         AND expires_at > NOW()
         ORDER BY created_at DESC 
         LIMIT 1`,
        [phoneNumber, otp, purpose]
    );

    if (!result) {
        return { success: false, message: 'Invalid or expired OTP' };
    }

    // Mark OTP as verified
    await db.query(
        'UPDATE otp_verifications SET is_verified = TRUE WHERE id = ?',
        [result.id]
    );

    return { success: true, userId: result.user_id };
};

/**
 * Send OTP via SMS (Twilio integration)
 */
const sendOTP = async (phoneNumber, otp) => {
    // For development, just log the OTP
    if (process.env.NODE_ENV === 'development') {
        console.log(`📱 OTP for ${phoneNumber}: ${otp}`);
        return { success: true };
    }

    // Production: Use Twilio
    try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

        if (!accountSid || !authToken || !twilioPhone) {
            console.warn('Twilio credentials not configured. OTP:', otp);
            return { success: true };
        }

        const client = require('twilio')(accountSid, authToken);
        
        await client.messages.create({
            body: `Your Hostel System OTP is: ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.`,
            from: twilioPhone,
            to: phoneNumber
        });

        return { success: true };
    } catch (error) {
        console.error('SMS sending error:', error);
        return { success: false, error: error.message };
    }
};

// =====================================================
// QR CODE UTILITIES
// =====================================================

/**
 * Generate QR code data for leave application
 */
const generateQRCodeData = (leaveApplication, student) => {
    const data = {
        leaveId: leaveApplication.id,
        studentId: student.id,
        collegeId: student.college_id,
        studentName: student.student_name,
        fromDate: leaveApplication.from_date,
        toDate: leaveApplication.to_date,
        validFrom: leaveApplication.qr_code_expires_at,
        hash: generateHash({
            leaveId: leaveApplication.id,
            studentId: student.id,
            fromDate: leaveApplication.from_date
        })
    };

    return JSON.stringify(data);
};

/**
 * Generate QR code image (base64)
 */
const generateQRCodeImage = async (data) => {
    try {
        const size = parseInt(process.env.QR_CODE_SIZE) || 300;
        const qrCodeDataURL = await QRCode.toDataURL(data, {
            width: size,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        return qrCodeDataURL;
    } catch (error) {
        console.error('QR code generation error:', error);
        throw error;
    }
};

/**
 * Validate QR code data
 */
const validateQRCode = async (qrData) => {
    try {
        const data = JSON.parse(qrData);
        
        // Verify hash
        const expectedHash = generateHash({
            leaveId: data.leaveId,
            studentId: data.studentId,
            fromDate: data.fromDate
        });

        if (data.hash !== expectedHash) {
            return { valid: false, message: 'QR code tampered or invalid' };
        }

        // Check leave application
        const leave = await db.getOne(
            `SELECT la.*, s.college_id, s.student_name 
             FROM leave_applications la
             JOIN students s ON la.student_id = s.id
             WHERE la.id = ? AND s.id = ?`,
            [data.leaveId, data.studentId]
        );

        if (!leave) {
            return { valid: false, message: 'Leave application not found' };
        }

        if (leave.status !== 'APPROVED_DW' && leave.status !== 'APPROVED_PRINCIPAL') {
            return { valid: false, message: 'Leave not approved' };
        }

        // Check if QR code is expired
        const now = new Date();
        const validFrom = new Date(leave.qr_code_expires_at);
        
        if (now < validFrom) {
            return { 
                valid: false, 
                message: `QR code not yet valid. Valid from ${validFrom.toLocaleString()}` 
            };
        }

        // Check if leave period is valid
        const fromDate = new Date(leave.from_date);
        const toDate = new Date(leave.to_date);
        toDate.setHours(23, 59, 59); // End of day

        if (now > toDate) {
            return { valid: false, message: 'Leave period expired' };
        }

        return { 
            valid: true, 
            leave,
            message: 'Valid QR code'
        };
    } catch (error) {
        console.error('QR validation error:', error);
        return { valid: false, message: 'Invalid QR code format' };
    }
};

// =====================================================
// HELPER UTILITIES
// =====================================================

/**
 * Generate secure hash
 */
const generateHash = (data) => {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(data) + process.env.JWT_SECRET)
        .digest('hex');
};

/**
 * Calculate date difference in days
 */
const daysBetween = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

/**
 * Format date to MySQL format
 */
const formatDateForMySQL = (date) => {
    return date.toISOString().split('T')[0];
};

/**
 * Check if date is in the future
 */
const isFutureDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate > today;
};

/**
 * Sanitize phone number
 */
const sanitizePhoneNumber = (phone) => {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add country code if not present
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
        cleaned = '91' + cleaned;
    }
    
    // Add + prefix
    if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }
    
    return cleaned;
};

/**
 * Generate random string
 */
const generateRandomString = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

module.exports = {
    // JWT
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    
    // Password
    hashPassword,
    comparePassword,
    
    // OTP
    generateOTP,
    storeOTP,
    verifyOTP,
    sendOTP,
    
    // QR Code
    generateQRCodeData,
    generateQRCodeImage,
    validateQRCode,
    
    // Helpers
    generateHash,
    daysBetween,
    formatDateForMySQL,
    isFutureDate,
    sanitizePhoneNumber,
    generateRandomString
};
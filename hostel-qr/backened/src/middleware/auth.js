// =====================================================
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// =====================================================

const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await db.getOne(
            `SELECT u.*, r.role_name 
             FROM users u 
             JOIN roles r ON u.role_id = r.id 
             WHERE u.id = ?`,
            [decoded.userId]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Account is not active. Please complete verification.'
            });
        }

        // Attach user to request
        req.user = {
            id: user.id,
            roleId: user.role_id,
            roleName: user.role_name,
            email: user.email,
            phoneNumber: user.phone_number,
            isVerified: user.is_verified
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        console.error('Authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// Role-based authorization
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!allowedRoles.includes(req.user.roleName)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Insufficient permissions.'
            });
        }

        next();
    };
};

// Check if student is verified (parent verification completed)
const checkStudentVerification = async (req, res, next) => {
    try {
        if (req.user.roleName !== 'STUDENT') {
            return next();
        }

        const student = await db.getOne(
            `SELECT s.*, u.is_active as student_active, 
                    p_user.is_verified as parent_verified
             FROM students s
             JOIN users u ON s.user_id = u.id
             LEFT JOIN users p_user ON s.parent_id = p_user.id
             WHERE s.user_id = ?`,
            [req.user.id]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student profile not found'
            });
        }

        // Check if parent is verified
        if (!student.parent_id || !student.parent_verified) {
            return res.status(403).json({
                success: false,
                message: 'Account locked. Parent verification pending.',
                requiresParentVerification: true
            });
        }

        // Attach student info to request
        req.student = student;
        next();
    } catch (error) {
        console.error('Student verification check error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification check failed'
        });
    }
};

// Check if profile is completed (for students)
const checkProfileCompleted = async (req, res, next) => {
    try {
        if (req.user.roleName !== 'STUDENT') {
            return next();
        }

        const student = await db.getOne(
            'SELECT profile_completed FROM students WHERE user_id = ?',
            [req.user.id]
        );

        if (!student || !student.profile_completed) {
            return res.status(403).json({
                success: false,
                message: 'Please complete your profile first',
                requiresProfileCompletion: true
            });
        }

        next();
    } catch (error) {
        console.error('Profile check error:', error);
        res.status(500).json({
            success: false,
            message: 'Profile check failed'
        });
    }
};

// Optional authentication (token not required but validated if present)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.getOne(
            `SELECT u.*, r.role_name 
             FROM users u 
             JOIN roles r ON u.role_id = r.id 
             WHERE u.id = ?`,
            [decoded.userId]
        );

        if (user && user.is_active) {
            req.user = {
                id: user.id,
                roleId: user.role_id,
                roleName: user.role_name,
                email: user.email,
                phoneNumber: user.phone_number,
                isVerified: user.is_verified
            };
        }

        next();
    } catch (error) {
        // Ignore errors for optional auth
        next();
    }
};

module.exports = {
    authenticateToken,
    authorizeRoles,
    checkStudentVerification,
    checkProfileCompleted,
    optionalAuth
};
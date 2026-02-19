// =====================================================
// API ROUTES
// =====================================================

const express = require('express');
const router = express.Router();

// Import controllers
const authController = require('../controllers/authController');
const studentController = require('../controllers/studentController');
const parentController = require('../controllers/parentController');
const leaveController = require('../controllers/leaveController');
const qrController = require('../controllers/qrController');

// Import middleware
const {
    authenticateToken,
    authorizeRoles,
    checkStudentVerification,
    checkProfileCompleted
} = require('../middleware/auth');

// =====================================================
// PUBLIC ROUTES (No authentication required)
// =====================================================

// Health check
router.get('/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Hostel QR System API is running',
        timestamp: new Date().toISOString()
    });
});

// =====================================================
// AUTHENTICATION ROUTES
// =====================================================

// Student registration (Step 1)
router.post('/auth/student/register', authController.registerStudent);

// Student login (Only after parent verification)
router.post('/auth/student/login', authController.loginStudent);

// Parent registration (Step 2)
router.post('/auth/parent/register', authController.registerParent);

// Parent OTP verification (Step 3 - Activates student account)
router.post('/auth/parent/verify-otp', authController.verifyParentOTP);

// Parent login - Request OTP
router.post('/auth/parent/request-otp', authController.requestParentOTP);

// Parent login - Verify OTP
router.post('/auth/parent/login', authController.loginParent);

// Staff login (Deputy Warden, Principal, Watchman)
router.post('/auth/staff/login', authController.loginStaff);

// =====================================================
// STUDENT ROUTES
// =====================================================

// Get student profile
router.get(
    '/student/profile',
    authenticateToken,
    authorizeRoles('STUDENT'),
    checkStudentVerification,
    studentController.getProfile
);

// Complete profile (after parent verification)
router.post(
    '/student/profile/complete',
    authenticateToken,
    authorizeRoles('STUDENT'),
    checkStudentVerification,
    studentController.completeProfile
);

// Update profile
router.put(
    '/student/profile',
    authenticateToken,
    authorizeRoles('STUDENT'),
    checkStudentVerification,
    studentController.updateProfile
);

// Get dashboard
router.get(
    '/student/dashboard',
    authenticateToken,
    authorizeRoles('STUDENT'),
    checkStudentVerification,
    studentController.getDashboard
);

// Apply for leave
router.post(
    '/student/leave/apply',
    authenticateToken,
    authorizeRoles('STUDENT'),
    checkStudentVerification,
    checkProfileCompleted,
    leaveController.applyLeave
);

// Get my leave applications
router.get(
    '/student/leave/my-leaves',
    authenticateToken,
    authorizeRoles('STUDENT'),
    checkStudentVerification,
    leaveController.getMyLeaves
);

// Get QR code for approved leave
router.get(
    '/student/leave/:leaveId/qr-code',
    authenticateToken,
    authorizeRoles('STUDENT'),
    checkStudentVerification,
    leaveController.getLeaveQRCode
);

// =====================================================
// PARENT ROUTES
// =====================================================

// Get parent dashboard
router.get(
    '/parent/dashboard',
    authenticateToken,
    authorizeRoles('PARENT'),
    parentController.getDashboard
);

// Get children's leave applications
router.get(
    '/parent/leaves',
    authenticateToken,
    authorizeRoles('PARENT'),
    parentController.getChildrenLeaves
);

// Request emergency extension
router.post(
    '/parent/leave/emergency-extension',
    authenticateToken,
    authorizeRoles('PARENT'),
    leaveController.requestEmergencyExtension
);

// Get emergency extension requests
router.get(
    '/parent/emergency-extensions',
    authenticateToken,
    authorizeRoles('PARENT'),
    parentController.getEmergencyExtensions
);

// Get student gate history
router.get(
    '/parent/student/:studentId/gate-history',
    authenticateToken,
    authorizeRoles('PARENT'),
    parentController.getStudentGateHistory
);

// Get notifications
router.get(
    '/parent/notifications',
    authenticateToken,
    authorizeRoles('PARENT'),
    parentController.getNotifications
);

// Mark notification as read
router.put(
    '/parent/notifications/:notificationId/read',
    authenticateToken,
    authorizeRoles('PARENT'),
    parentController.markNotificationRead
);

// Mark all notifications as read
router.put(
    '/parent/notifications/read-all',
    authenticateToken,
    authorizeRoles('PARENT'),
    parentController.markAllNotificationsRead
);

// =====================================================
// DEPUTY WARDEN ROUTES
// =====================================================

// Get pending leave requests (≤15 days)
router.get(
    '/deputy-warden/leaves/pending',
    authenticateToken,
    authorizeRoles('DEPUTY_WARDEN'),
    leaveController.getPendingLeaves
);

// Approve/Reject leave
router.post(
    '/deputy-warden/leaves/:leaveId/process',
    authenticateToken,
    authorizeRoles('DEPUTY_WARDEN'),
    leaveController.processLeaveByDW
);

// Process emergency extension
router.post(
    '/deputy-warden/extension/:extensionId/process',
    authenticateToken,
    authorizeRoles('DEPUTY_WARDEN'),
    leaveController.processEmergencyExtension
);

// Get gate logs
router.get(
    '/deputy-warden/gate-logs',
    authenticateToken,
    authorizeRoles('DEPUTY_WARDEN'),
    qrController.getGateLogs
);

// Get students currently outside
router.get(
    '/deputy-warden/students-outside',
    authenticateToken,
    authorizeRoles('DEPUTY_WARDEN'),
    qrController.getStudentsOutside
);

// =====================================================
// PRINCIPAL ROUTES
// =====================================================

// Get leaves requiring principal approval (>15 days)
router.get(
    '/principal/leaves/pending',
    authenticateToken,
    authorizeRoles('PRINCIPAL'),
    leaveController.getLeavesForPrincipal
);

// Approve/Reject leave
router.post(
    '/principal/leaves/:leaveId/process',
    authenticateToken,
    authorizeRoles('PRINCIPAL'),
    leaveController.processLeaveByPrincipal
);

// Get gate logs (monitoring)
router.get(
    '/principal/gate-logs',
    authenticateToken,
    authorizeRoles('PRINCIPAL'),
    qrController.getGateLogs
);

// =====================================================
// WATCHMAN ROUTES
// =====================================================

// Scan QR code (main functionality)
router.post(
    '/watchman/scan-qr',
    authenticateToken,
    authorizeRoles('WATCHMAN'),
    qrController.scanQRCode
);

// Get today's gate logs
router.get(
    '/watchman/gate-logs',
    authenticateToken,
    authorizeRoles('WATCHMAN'),
    qrController.getGateLogs
);

// Manual entry/exit (emergency)
router.post(
    '/watchman/manual-entry',
    authenticateToken,
    authorizeRoles('WATCHMAN'),
    qrController.manualEntryExit
);

// Get students currently outside
router.get(
    '/watchman/students-outside',
    authenticateToken,
    authorizeRoles('WATCHMAN'),
    qrController.getStudentsOutside
);

// Get student gate history
router.get(
    '/watchman/student/:studentId/history',
    authenticateToken,
    authorizeRoles('WATCHMAN'),
    qrController.getStudentGateHistory
);

// =====================================================
// COMMON ROUTES (Multiple roles)
// =====================================================

// Get notifications (for all authenticated users)
router.get(
    '/notifications',
    authenticateToken,
    parentController.getNotifications
);

// Mark notification as read
router.put(
    '/notifications/:notificationId/read',
    authenticateToken,
    parentController.markNotificationRead
);

module.exports = router;
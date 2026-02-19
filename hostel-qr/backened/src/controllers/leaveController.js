// =====================================================
// LEAVE APPLICATION CONTROLLER
// =====================================================

const db = require('../config/database');
const {
    daysBetween,
    isFutureDate,
    generateQRCodeData,
    generateQRCodeImage,
    validateQRCode
} = require('../utils/helpers');

// =====================================================
// STUDENT LEAVE OPERATIONS
// =====================================================

/**
 * Apply for leave
 */
const applyLeave = async (req, res) => {
    try {
        const {
            fromDate,
            toDate,
            reason,
            destination,
            contactDuringLeave,
            leaveType
        } = req.body;

        // Get student ID from authenticated user
        const student = await db.getOne(
            'SELECT id, student_name, parent_id FROM students WHERE user_id = ?',
            [req.user.id]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student profile not found'
            });
        }

        // Validate dates
        if (!fromDate || !toDate || !reason) {
            return res.status(400).json({
                success: false,
                message: 'From date, to date, and reason are required'
            });
        }

        const from = new Date(fromDate);
        const to = new Date(toDate);

        if (to < from) {
            return res.status(400).json({
                success: false,
                message: 'To date must be after from date'
            });
        }

        // Check minimum advance days
        const minAdvanceDays = parseInt(process.env.MIN_ADVANCE_DAYS) || 2;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntilLeave = Math.ceil((from - today) / (1000 * 60 * 60 * 24));

        if (daysUntilLeave < minAdvanceDays) {
            return res.status(400).json({
                success: false,
                message: `Leave must be applied at least ${minAdvanceDays} days in advance`
            });
        }

        // Check for overlapping leaves
        const overlappingLeave = await db.getOne(
            `SELECT id FROM leave_applications 
             WHERE student_id = ? 
             AND status IN ('PENDING', 'APPROVED_DW', 'APPROVED_PRINCIPAL')
             AND (
                 (? BETWEEN from_date AND to_date)
                 OR (? BETWEEN from_date AND to_date)
                 OR (from_date BETWEEN ? AND ?)
             )`,
            [student.id, fromDate, toDate, fromDate, toDate]
        );

        if (overlappingLeave) {
            return res.status(409).json({
                success: false,
                message: 'You have an overlapping leave application'
            });
        }

        // Calculate leave duration
        const duration = daysBetween(fromDate, toDate);

        // Start transaction
        const result = await db.transaction(async (conn) => {
            // Create leave application
            const [leaveResult] = await conn.execute(
                `INSERT INTO leave_applications 
                 (student_id, leave_type, from_date, to_date, reason, destination, 
                  contact_during_leave, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
                [student.id, leaveType || 'REGULAR', fromDate, toDate, reason, 
                 destination, contactDuringLeave]
            );

            const leaveId = leaveResult.insertId;

            // Notify parent
            if (student.parent_id) {
                await conn.execute(
                    `INSERT INTO notifications 
                     (user_id, notification_type, title, message, related_leave_id)
                     VALUES (?, 'LEAVE_APPLIED', 'Leave Application', ?, ?)`,
                    [
                        student.parent_id,
                        `${student.student_name} has applied for leave from ${fromDate} to ${toDate}`,
                        leaveId
                    ]
                );
            }

            // Notify Deputy Warden
            const deputyWardens = await conn.query(
                `SELECT u.id FROM users u 
                 JOIN roles r ON u.role_id = r.id 
                 WHERE r.role_name = 'DEPUTY_WARDEN' AND u.is_active = TRUE`
            );

            for (const dw of deputyWardens[0]) {
                await conn.execute(
                    `INSERT INTO notifications 
                     (user_id, notification_type, title, message, related_leave_id)
                     VALUES (?, 'LEAVE_PENDING', 'New Leave Request', ?, ?)`,
                    [
                        dw.id,
                        `New leave request from ${student.student_name} for ${duration} days`,
                        leaveId
                    ]
                );
            }

            return leaveId;
        });

        res.status(201).json({
            success: true,
            message: 'Leave application submitted successfully',
            data: {
                leaveId: result,
                duration,
                requiresPrincipalApproval: duration > (parseInt(process.env.MAX_REGULAR_LEAVE_DAYS) || 15)
            }
        });

    } catch (error) {
        console.error('Leave application error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit leave application'
        });
    }
};

/**
 * Get student's leave applications
 */
const getMyLeaves = async (req, res) => {
    try {
        const student = await db.getOne(
            'SELECT id FROM students WHERE user_id = ?',
            [req.user.id]
        );

        const leaves = await db.getMany(
            `SELECT la.*, 
                    dw.staff_name as approved_by_dw_name,
                    p.staff_name as approved_by_principal_name
             FROM leave_applications la
             LEFT JOIN staff dw ON la.approved_by_dw = dw.id
             LEFT JOIN staff p ON la.approved_by_principal = p.id
             WHERE la.student_id = ?
             ORDER BY la.created_at DESC`,
            [student.id]
        );

        res.json({
            success: true,
            data: leaves
        });

    } catch (error) {
        console.error('Get leaves error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leave applications'
        });
    }
};

/**
 * Get QR code for approved leave
 */
const getLeaveQRCode = async (req, res) => {
    try {
        const { leaveId } = req.params;

        const student = await db.getOne(
            'SELECT * FROM students WHERE user_id = ?',
            [req.user.id]
        );

        const leave = await db.getOne(
            `SELECT * FROM leave_applications 
             WHERE id = ? AND student_id = ?`,
            [leaveId, student.id]
        );

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: 'Leave application not found'
            });
        }

        if (leave.status !== 'APPROVED_DW' && leave.status !== 'APPROVED_PRINCIPAL') {
            return res.status(400).json({
                success: false,
                message: 'QR code only available for approved leaves'
            });
        }

        // Generate QR code if not already generated
        if (!leave.qr_code_generated) {
            // Calculate QR validity (2 hours before leave starts)
            const validityHours = parseInt(process.env.QR_CODE_VALIDITY_HOURS) || 2;
            const fromDate = new Date(leave.from_date);
            const qrValidFrom = new Date(fromDate.getTime() - validityHours * 60 * 60 * 1000);

            // Generate QR data
            const qrData = generateQRCodeData(leave, student);

            // Update leave with QR data
            await db.query(
                `UPDATE leave_applications 
                 SET qr_code_data = ?, qr_code_generated = TRUE, qr_code_expires_at = ?
                 WHERE id = ?`,
                [qrData, qrValidFrom, leaveId]
            );

            leave.qr_code_data = qrData;
            leave.qr_code_expires_at = qrValidFrom;
        }

        // Generate QR image
        const qrImage = await generateQRCodeImage(leave.qr_code_data);

        res.json({
            success: true,
            data: {
                qrCode: qrImage,
                validFrom: leave.qr_code_expires_at,
                fromDate: leave.from_date,
                toDate: leave.to_date,
                status: leave.status
            }
        });

    } catch (error) {
        console.error('QR code generation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate QR code'
        });
    }
};

// =====================================================
// DEPUTY WARDEN OPERATIONS
// =====================================================

/**
 * Get pending leave requests for deputy warden
 */
const getPendingLeaves = async (req, res) => {
    try {
        const maxDays = parseInt(process.env.MAX_REGULAR_LEAVE_DAYS) || 15;

        const leaves = await db.getMany(
            `SELECT la.*, 
                    s.college_id, s.student_name, s.department, s.hostel_block, s.room_number,
                    DATEDIFF(la.to_date, la.from_date) + 1 as duration
             FROM leave_applications la
             JOIN students s ON la.student_id = s.id
             WHERE la.status = 'PENDING'
             AND DATEDIFF(la.to_date, la.from_date) + 1 <= ?
             ORDER BY la.created_at ASC`,
            [maxDays]
        );

        res.json({
            success: true,
            data: leaves
        });

    } catch (error) {
        console.error('Get pending leaves error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending leaves'
        });
    }
};

/**
 * Approve/Reject leave by deputy warden
 */
const processLeaveByDW = async (req, res) => {
    try {
        const { leaveId } = req.params;
        const { action, remarks } = req.body; // action: 'approve' or 'reject'

        if (!action || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Valid action (approve/reject) is required'
            });
        }

        // Get staff ID
        const staff = await db.getOne(
            'SELECT id FROM staff WHERE user_id = ?',
            [req.user.id]
        );

        const leave = await db.getOne(
            `SELECT la.*, s.student_name, s.user_id as student_user_id,
                    DATEDIFF(la.to_date, la.from_date) + 1 as duration
             FROM leave_applications la
             JOIN students s ON la.student_id = s.id
             WHERE la.id = ? AND la.status = 'PENDING'`,
            [leaveId]
        );

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: 'Leave application not found or already processed'
            });
        }

        const maxDays = parseInt(process.env.MAX_REGULAR_LEAVE_DAYS) || 15;

        if (leave.duration > maxDays) {
            return res.status(400).json({
                success: false,
                message: `Leave duration exceeds ${maxDays} days. Principal approval required.`
            });
        }

        await db.transaction(async (conn) => {
            const newStatus = action === 'approve' ? 'APPROVED_DW' : 'REJECTED';

            // Update leave status
            await conn.execute(
                `UPDATE leave_applications 
                 SET status = ?, approved_by_dw = ?, dw_remarks = ?, dw_approved_at = NOW()
                 WHERE id = ?`,
                [newStatus, staff.id, remarks, leaveId]
            );

            // Notify student
            const notifMessage = action === 'approve' 
                ? 'Your leave application has been approved'
                : `Your leave application has been rejected. Reason: ${remarks || 'Not specified'}`;

            await conn.execute(
                `INSERT INTO notifications 
                 (user_id, notification_type, title, message, related_leave_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    leave.student_user_id,
                    action === 'approve' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
                    action === 'approve' ? 'Leave Approved' : 'Leave Rejected',
                    notifMessage,
                    leaveId
                ]
            );
        });

        res.json({
            success: true,
            message: `Leave ${action === 'approve' ? 'approved' : 'rejected'} successfully`
        });

    } catch (error) {
        console.error('Leave processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process leave application'
        });
    }
};

// =====================================================
// PRINCIPAL OPERATIONS
// =====================================================

/**
 * Get leaves requiring principal approval
 */
const getLeavesForPrincipal = async (req, res) => {
    try {
        const maxDays = parseInt(process.env.MAX_REGULAR_LEAVE_DAYS) || 15;

        const leaves = await db.getMany(
            `SELECT la.*, 
                    s.college_id, s.student_name, s.department, s.hostel_block,
                    dw.staff_name as approved_by_dw_name,
                    DATEDIFF(la.to_date, la.from_date) + 1 as duration
             FROM leave_applications la
             JOIN students s ON la.student_id = s.id
             LEFT JOIN staff dw ON la.approved_by_dw = dw.id
             WHERE la.status = 'PENDING'
             AND DATEDIFF(la.to_date, la.from_date) + 1 > ?
             ORDER BY la.created_at ASC`,
            [maxDays]
        );

        res.json({
            success: true,
            data: leaves
        });

    } catch (error) {
        console.error('Get principal leaves error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leaves'
        });
    }
};

/**
 * Approve/Reject leave by principal
 */
const processLeaveByPrincipal = async (req, res) => {
    try {
        const { leaveId } = req.params;
        const { action, remarks } = req.body;

        if (!action || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Valid action (approve/reject) is required'
            });
        }

        const staff = await db.getOne(
            'SELECT id FROM staff WHERE user_id = ?',
            [req.user.id]
        );

        const leave = await db.getOne(
            `SELECT la.*, s.student_name, s.user_id as student_user_id
             FROM leave_applications la
             JOIN students s ON la.student_id = s.id
             WHERE la.id = ? AND la.status = 'PENDING'`,
            [leaveId]
        );

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: 'Leave application not found or already processed'
            });
        }

        await db.transaction(async (conn) => {
            const newStatus = action === 'approve' ? 'APPROVED_PRINCIPAL' : 'REJECTED';

            await conn.execute(
                `UPDATE leave_applications 
                 SET status = ?, approved_by_principal = ?, principal_remarks = ?, 
                     principal_approved_at = NOW()
                 WHERE id = ?`,
                [newStatus, staff.id, remarks, leaveId]
            );

            const notifMessage = action === 'approve' 
                ? 'Your leave application has been approved by Principal'
                : `Your leave application has been rejected. Reason: ${remarks || 'Not specified'}`;

            await conn.execute(
                `INSERT INTO notifications 
                 (user_id, notification_type, title, message, related_leave_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    leave.student_user_id,
                    action === 'approve' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
                    action === 'approve' ? 'Leave Approved' : 'Leave Rejected',
                    notifMessage,
                    leaveId
                ]
            );
        });

        res.json({
            success: true,
            message: `Leave ${action === 'approve' ? 'approved' : 'rejected'} successfully`
        });

    } catch (error) {
        console.error('Principal leave processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process leave application'
        });
    }
};

// =====================================================
// EMERGENCY EXTENSION (Parent Request)
// =====================================================

/**
 * Parent requests emergency extension
 */
const requestEmergencyExtension = async (req, res) => {
    try {
        const { leaveId, extendedToDate, reason } = req.body;

        const parent = await db.getOne(
            'SELECT id FROM parents WHERE user_id = ?',
            [req.user.id]
        );

        // Validate leave belongs to parent's child
        const leave = await db.getOne(
            `SELECT la.*, s.student_name, s.parent_id
             FROM leave_applications la
             JOIN students s ON la.student_id = s.id
             WHERE la.id = ? AND s.parent_id = ?`,
            [leaveId, req.user.id]
        );

        if (!leave) {
            return res.status(404).json({
                success: false,
                message: 'Leave application not found'
            });
        }

        if (leave.status !== 'APPROVED_DW' && leave.status !== 'APPROVED_PRINCIPAL') {
            return res.status(400).json({
                success: false,
                message: 'Can only extend approved leaves'
            });
        }

        const newToDate = new Date(extendedToDate);
        const currentToDate = new Date(leave.to_date);

        if (newToDate <= currentToDate) {
            return res.status(400).json({
                success: false,
                message: 'Extended date must be after current end date'
            });
        }

        const result = await db.transaction(async (conn) => {
            const [extensionResult] = await conn.execute(
                `INSERT INTO emergency_extensions 
                 (leave_application_id, requested_by_parent, extended_to_date, reason, status)
                 VALUES (?, ?, ?, ?, 'PENDING')`,
                [leaveId, parent.id, extendedToDate, reason]
            );

            // Notify deputy wardens
            const deputyWardens = await conn.query(
                `SELECT u.id FROM users u 
                 JOIN roles r ON u.role_id = r.id 
                 WHERE r.role_name = 'DEPUTY_WARDEN' AND u.is_active = TRUE`
            );

            for (const dw of deputyWardens[0]) {
                await conn.execute(
                    `INSERT INTO notifications 
                     (user_id, notification_type, title, message, related_leave_id)
                     VALUES (?, 'EXTENSION_REQUEST', 'Emergency Extension Request', ?, ?)`,
                    [
                        dw.id,
                        `Emergency extension requested for ${leave.student_name}'s leave`,
                        leaveId
                    ]
                );
            }

            return extensionResult.insertId;
        });

        res.status(201).json({
            success: true,
            message: 'Emergency extension requested successfully',
            data: { extensionId: result }
        });

    } catch (error) {
        console.error('Emergency extension error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to request extension'
        });
    }
};

/**
 * Process emergency extension (Deputy Warden)
 */
const processEmergencyExtension = async (req, res) => {
    try {
        const { extensionId } = req.params;
        const { action, remarks } = req.body;

        const staff = await db.getOne(
            'SELECT id FROM staff WHERE user_id = ?',
            [req.user.id]
        );

        const extension = await db.getOne(
            `SELECT ee.*, la.student_id, s.user_id as student_user_id,
                    p.user_id as parent_user_id
             FROM emergency_extensions ee
             JOIN leave_applications la ON ee.leave_application_id = la.id
             JOIN students s ON la.student_id = s.id
             JOIN parents p ON ee.requested_by_parent = p.id
             WHERE ee.id = ? AND ee.status = 'PENDING'`,
            [extensionId]
        );

        if (!extension) {
            return res.status(404).json({
                success: false,
                message: 'Extension request not found or already processed'
            });
        }

        await db.transaction(async (conn) => {
            const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';

            await conn.execute(
                `UPDATE emergency_extensions 
                 SET status = ?, approved_by = ?, remarks = ?, approved_at = NOW()
                 WHERE id = ?`,
                [newStatus, staff.id, remarks, extensionId]
            );

            // If approved, update the leave application
            if (action === 'approve') {
                await conn.execute(
                    'UPDATE leave_applications SET to_date = ? WHERE id = ?',
                    [extension.extended_to_date, extension.leave_application_id]
                );
            }

            // Notify parent and student
            const message = action === 'approve' 
                ? 'Emergency extension approved'
                : `Emergency extension rejected. Reason: ${remarks || 'Not specified'}`;

            for (const userId of [extension.parent_user_id, extension.student_user_id]) {
                await conn.execute(
                    `INSERT INTO notifications 
                     (user_id, notification_type, title, message, related_leave_id)
                     VALUES (?, 'EXTENSION_PROCESSED', ?, ?, ?)`,
                    [userId, message, message, extension.leave_application_id]
                );
            }
        });

        res.json({
            success: true,
            message: `Extension ${action === 'approve' ? 'approved' : 'rejected'} successfully`
        });

    } catch (error) {
        console.error('Extension processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process extension'
        });
    }
};

module.exports = {
    // Student operations
    applyLeave,
    getMyLeaves,
    getLeaveQRCode,
    
    // Deputy Warden operations
    getPendingLeaves,
    processLeaveByDW,
    
    // Principal operations
    getLeavesForPrincipal,
    processLeaveByPrincipal,
    
    // Emergency extensions
    requestEmergencyExtension,
    processEmergencyExtension
};
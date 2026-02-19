// =====================================================
// QR CODE SCANNING CONTROLLER (Watchman)
// =====================================================

const db = require('../config/database');
const { validateQRCode } = require('../utils/helpers');

/**
 * Scan and validate QR code at gate
 */
const scanQRCode = async (req, res) => {
    try {
        const { qrData, actionType, location } = req.body;

        if (!qrData || !actionType) {
            return res.status(400).json({
                success: false,
                message: 'QR data and action type are required'
            });
        }

        if (!['EXIT', 'ENTRY'].includes(actionType)) {
            return res.status(400).json({
                success: false,
                message: 'Action type must be EXIT or ENTRY'
            });
        }

        // Validate QR code
        const validation = await validateQRCode(qrData);

        let logEntry = {
            studentId: null,
            leaveApplicationId: null,
            actionType,
            scannedBy: req.user.id,
            qrCodeData: qrData,
            validationStatus: validation.valid ? 'VALID' : 'INVALID',
            validationMessage: validation.message,
            location: location || 'Main Gate'
        };

        // If valid, extract student and leave info
        if (validation.valid) {
            const qrDataParsed = JSON.parse(qrData);
            logEntry.studentId = qrDataParsed.studentId;
            logEntry.leaveApplicationId = qrDataParsed.leaveId;

            // Additional checks for entry
            if (actionType === 'ENTRY') {
                // Check if student had an exit record
                const lastLog = await db.getOne(
                    `SELECT action_type FROM gate_logs 
                     WHERE student_id = ? AND leave_application_id = ?
                     ORDER BY scan_timestamp DESC LIMIT 1`,
                    [qrDataParsed.studentId, qrDataParsed.leaveId]
                );

                if (!lastLog || lastLog.action_type !== 'EXIT') {
                    validation.valid = false;
                    validation.message = 'No exit record found. Entry not allowed.';
                    logEntry.validationStatus = 'INVALID';
                    logEntry.validationMessage = validation.message;
                }
            }

            // Check if re-entry is within leave period
            if (actionType === 'ENTRY' && validation.valid) {
                const today = new Date();
                const toDate = new Date(validation.leave.to_date);
                toDate.setHours(23, 59, 59);

                if (today > toDate) {
                    validation.valid = false;
                    validation.message = 'Leave period expired';
                    logEntry.validationStatus = 'EXPIRED';
                    logEntry.validationMessage = validation.message;
                }
            }
        }

        // Log the scan event
        const logId = await db.insert(
            `INSERT INTO gate_logs 
             (student_id, leave_application_id, action_type, scanned_by, 
              validation_status, validation_message, qr_code_data, location)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                logEntry.studentId,
                logEntry.leaveApplicationId,
                logEntry.actionType,
                logEntry.scannedBy,
                logEntry.validationStatus,
                logEntry.validationMessage,
                logEntry.qrCodeData,
                logEntry.location
            ]
        );

        // Get student details if valid
        let studentDetails = null;
        if (validation.valid && logEntry.studentId) {
            studentDetails = await db.getOne(
                `SELECT s.college_id, s.student_name, s.department, 
                        s.hostel_block, s.room_number, s.photo_url
                 FROM students s
                 WHERE s.id = ?`,
                [logEntry.studentId]
            );
        }

        // Response
        res.json({
            success: validation.valid,
            message: validation.message,
            data: {
                logId,
                actionType,
                validationStatus: logEntry.validationStatus,
                timestamp: new Date().toISOString(),
                student: studentDetails,
                leave: validation.valid ? {
                    fromDate: validation.leave.from_date,
                    toDate: validation.leave.to_date,
                    status: validation.leave.status
                } : null,
                allowed: validation.valid
            }
        });

    } catch (error) {
        console.error('QR scan error:', error);
        res.status(500).json({
            success: false,
            message: 'QR code scanning failed'
        });
    }
};

/**
 * Get gate logs (for watchman)
 */
const getGateLogs = async (req, res) => {
    try {
        const { date, actionType, status } = req.query;
        
        let query = `
            SELECT gl.*, 
                   s.college_id, s.student_name, s.department,
                   w.staff_name as scanned_by_name
            FROM gate_logs gl
            JOIN students s ON gl.student_id = s.id
            JOIN staff w ON gl.scanned_by = w.user_id
            WHERE 1=1
        `;
        const params = [];

        if (date) {
            query += ' AND DATE(gl.scan_timestamp) = ?';
            params.push(date);
        } else {
            // Default to today
            query += ' AND DATE(gl.scan_timestamp) = CURDATE()';
        }

        if (actionType) {
            query += ' AND gl.action_type = ?';
            params.push(actionType);
        }

        if (status) {
            query += ' AND gl.validation_status = ?';
            params.push(status);
        }

        query += ' ORDER BY gl.scan_timestamp DESC LIMIT 100';

        const logs = await db.getMany(query, params);

        res.json({
            success: true,
            data: logs
        });

    } catch (error) {
        console.error('Get gate logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch gate logs'
        });
    }
};

/**
 * Get student entry/exit history
 */
const getStudentGateHistory = async (req, res) => {
    try {
        const { studentId } = req.params;

        const logs = await db.getMany(
            `SELECT gl.*, 
                    w.staff_name as scanned_by_name,
                    la.from_date, la.to_date
             FROM gate_logs gl
             LEFT JOIN staff w ON gl.scanned_by = w.user_id
             LEFT JOIN leave_applications la ON gl.leave_application_id = la.id
             WHERE gl.student_id = ?
             ORDER BY gl.scan_timestamp DESC
             LIMIT 50`,
            [studentId]
        );

        res.json({
            success: true,
            data: logs
        });

    } catch (error) {
        console.error('Get student history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch student gate history'
        });
    }
};

/**
 * Get current students outside hostel
 */
const getStudentsOutside = async (req, res) => {
    try {
        const studentsOutside = await db.getMany(
            `SELECT DISTINCT
                 s.id, s.college_id, s.student_name, s.department,
                 s.hostel_block, s.room_number,
                 la.from_date, la.to_date,
                 gl.scan_timestamp as exit_time
             FROM gate_logs gl
             JOIN students s ON gl.student_id = s.id
             JOIN leave_applications la ON gl.leave_application_id = la.id
             WHERE gl.action_type = 'EXIT'
             AND gl.validation_status = 'VALID'
             AND gl.student_id NOT IN (
                 SELECT student_id 
                 FROM gate_logs 
                 WHERE action_type = 'ENTRY' 
                 AND scan_timestamp > gl.scan_timestamp
             )
             AND la.to_date >= CURDATE()
             ORDER BY gl.scan_timestamp DESC`
        );

        res.json({
            success: true,
            data: studentsOutside,
            count: studentsOutside.length
        });

    } catch (error) {
        console.error('Get students outside error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch students outside'
        });
    }
};

/**
 * Manual entry/exit (Emergency - for watchman)
 */
const manualEntryExit = async (req, res) => {
    try {
        const { collegeId, actionType, reason } = req.body;

        if (!collegeId || !actionType || !reason) {
            return res.status(400).json({
                success: false,
                message: 'College ID, action type, and reason are required'
            });
        }

        // Get student
        const student = await db.getOne(
            'SELECT id, student_name FROM students WHERE college_id = ?',
            [collegeId]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Create manual log
        const logId = await db.insert(
            `INSERT INTO gate_logs 
             (student_id, action_type, scanned_by, validation_status, 
              validation_message, location)
             VALUES (?, ?, ?, 'MANUAL', ?, 'Main Gate')`,
            [student.id, actionType, req.user.id, `Manual ${actionType}: ${reason}`]
        );

        res.json({
            success: true,
            message: `Manual ${actionType} recorded successfully`,
            data: {
                logId,
                studentName: student.student_name,
                actionType
            }
        });

    } catch (error) {
        console.error('Manual entry/exit error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record manual entry/exit'
        });
    }
};

module.exports = {
    scanQRCode,
    getGateLogs,
    getStudentGateHistory,
    getStudentsOutside,
    manualEntryExit
};
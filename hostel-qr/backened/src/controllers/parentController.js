// =====================================================
// PARENT CONTROLLER
// =====================================================

const db = require('../config/database');

/**
 * Get parent dashboard
 */
const getDashboard = async (req, res) => {
    try {
        // Get linked students
        const students = await db.getMany(
            `SELECT s.*, u.email, u.is_active
             FROM students s
             JOIN users u ON s.user_id = u.id
             WHERE s.parent_id = ?`,
            [req.user.id]
        );

        // Get statistics for each student
        const dashboardData = await Promise.all(students.map(async (student) => {
            // Leave statistics
            const leaveStats = await db.getOne(
                `SELECT 
                    COUNT(*) as total_leaves,
                    SUM(CASE WHEN status IN ('APPROVED_DW', 'APPROVED_PRINCIPAL') THEN 1 ELSE 0 END) as approved,
                    SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
                 FROM leave_applications
                 WHERE student_id = ?`,
                [student.id]
            );

            // Active leave
            const activeLeave = await db.getOne(
                `SELECT * FROM leave_applications
                 WHERE student_id = ?
                 AND status IN ('APPROVED_DW', 'APPROVED_PRINCIPAL')
                 AND CURDATE() BETWEEN from_date AND to_date`,
                [student.id]
            );

            // Recent gate logs
            const recentActivity = await db.getMany(
                `SELECT gl.*, la.from_date, la.to_date
                 FROM gate_logs gl
                 LEFT JOIN leave_applications la ON gl.leave_application_id = la.id
                 WHERE gl.student_id = ?
                 ORDER BY gl.scan_timestamp DESC
                 LIMIT 5`,
                [student.id]
            );

            return {
                student: {
                    id: student.id,
                    collegeId: student.college_id,
                    name: student.student_name,
                    department: student.department,
                    hostelBlock: student.hostel_block,
                    roomNumber: student.room_number
                },
                statistics: leaveStats,
                activeLeave,
                recentActivity
            };
        }));

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        console.error('Get parent dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data'
        });
    }
};

/**
 * Get all leave applications of linked students
 */
const getChildrenLeaves = async (req, res) => {
    try {
        const { status, studentId } = req.query;

        let query = `
            SELECT la.*, 
                   s.college_id, s.student_name, s.department,
                   dw.staff_name as approved_by_dw_name,
                   p.staff_name as approved_by_principal_name
            FROM leave_applications la
            JOIN students s ON la.student_id = s.id
            LEFT JOIN staff dw ON la.approved_by_dw = dw.id
            LEFT JOIN staff p ON la.approved_by_principal = p.id
            WHERE s.parent_id = ?
        `;
        const params = [req.user.id];

        if (status) {
            query += ' AND la.status = ?';
            params.push(status);
        }

        if (studentId) {
            query += ' AND s.id = ?';
            params.push(studentId);
        }

        query += ' ORDER BY la.created_at DESC';

        const leaves = await db.getMany(query, params);

        res.json({
            success: true,
            data: leaves
        });

    } catch (error) {
        console.error('Get children leaves error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leave applications'
        });
    }
};

/**
 * Get emergency extension requests
 */
const getEmergencyExtensions = async (req, res) => {
    try {
        const parent = await db.getOne(
            'SELECT id FROM parents WHERE user_id = ?',
            [req.user.id]
        );

        const extensions = await db.getMany(
            `SELECT ee.*, 
                    la.from_date, la.to_date, la.reason as leave_reason,
                    s.college_id, s.student_name,
                    st.staff_name as approved_by_name
             FROM emergency_extensions ee
             JOIN leave_applications la ON ee.leave_application_id = la.id
             JOIN students s ON la.student_id = s.id
             LEFT JOIN staff st ON ee.approved_by = st.id
             WHERE ee.requested_by_parent = ?
             ORDER BY ee.created_at DESC`,
            [parent.id]
        );

        res.json({
            success: true,
            data: extensions
        });

    } catch (error) {
        console.error('Get extensions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch extension requests'
        });
    }
};

/**
 * Get student gate history (for parent monitoring)
 */
const getStudentGateHistory = async (req, res) => {
    try {
        const { studentId } = req.params;

        // Verify student is linked to this parent
        const student = await db.getOne(
            'SELECT id FROM students WHERE id = ? AND parent_id = ?',
            [studentId, req.user.id]
        );

        if (!student) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const logs = await db.getMany(
            `SELECT gl.*, 
                    la.from_date, la.to_date,
                    st.staff_name as scanned_by_name
             FROM gate_logs gl
             LEFT JOIN leave_applications la ON gl.leave_application_id = la.id
             LEFT JOIN staff st ON gl.scanned_by = st.user_id
             WHERE gl.student_id = ?
             ORDER BY gl.scan_timestamp DESC
             LIMIT 30`,
            [studentId]
        );

        res.json({
            success: true,
            data: logs
        });

    } catch (error) {
        console.error('Get gate history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch gate history'
        });
    }
};

/**
 * Get notifications
 */
const getNotifications = async (req, res) => {
    try {
        const { limit = 20, unreadOnly = false } = req.query;

        let query = 'SELECT * FROM notifications WHERE user_id = ?';
        const params = [req.user.id];

        if (unreadOnly === 'true') {
            query += ' AND is_read = FALSE';
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const notifications = await db.getMany(query, params);

        res.json({
            success: true,
            data: notifications
        });

    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications'
        });
    }
};

/**
 * Mark notification as read
 */
const markNotificationRead = async (req, res) => {
    try {
        const { notificationId } = req.params;

        await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [notificationId, req.user.id]
        );

        res.json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        console.error('Mark notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notification'
        });
    }
};

/**
 * Mark all notifications as read
 */
const markAllNotificationsRead = async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
            [req.user.id]
        );

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });

    } catch (error) {
        console.error('Mark all notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notifications'
        });
    }
};

module.exports = {
    getDashboard,
    getChildrenLeaves,
    getEmergencyExtensions,
    getStudentGateHistory,
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead
};
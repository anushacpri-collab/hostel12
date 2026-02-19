// =====================================================
// STUDENT PROFILE CONTROLLER
// =====================================================

const db = require('../config/database');
const path = require('path');

/**
 * Get student profile
 */
const getProfile = async (req, res) => {
    try {
        const profile = await db.getOne(
            `SELECT s.*, u.email, u.phone_number, u.is_verified,
                    p.parent_name, p.relationship, p.user_id as parent_user_id,
                    pu.phone_number as parent_phone_verified,
                    pu.is_verified as parent_verified
             FROM students s
             JOIN users u ON s.user_id = u.id
             LEFT JOIN users pu ON s.parent_id = pu.id
             LEFT JOIN parents p ON pu.id = p.user_id
             WHERE s.user_id = ?`,
            [req.user.id]
        );

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found'
            });
        }

        res.json({
            success: true,
            data: profile
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile'
        });
    }
};

/**
 * Complete student profile (only after parent verification)
 */
const completeProfile = async (req, res) => {
    try {
        const {
            phoneNumber,
            hostelBlock,
            roomNumber,
            bloodGroup,
            emergencyContact,
            medicalConditions
        } = req.body;

        // Get student
        const student = await db.getOne(
            `SELECT s.*, u.is_active, pu.is_verified as parent_verified
             FROM students s
             JOIN users u ON s.user_id = u.id
             LEFT JOIN users pu ON s.parent_id = pu.id
             WHERE s.user_id = ?`,
            [req.user.id]
        );

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Check parent verification
        if (!student.parent_id || !student.parent_verified) {
            return res.status(403).json({
                success: false,
                message: 'Cannot complete profile. Parent verification pending.'
            });
        }

        if (!student.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Account not activated'
            });
        }

        // Update profile
        await db.transaction(async (conn) => {
            // Update student profile
            await conn.execute(
                `UPDATE students 
                 SET hostel_block = ?, room_number = ?, profile_completed = TRUE
                 WHERE id = ?`,
                [hostelBlock, roomNumber, student.id]
            );

            // Update user phone if provided
            if (phoneNumber) {
                await conn.execute(
                    'UPDATE users SET phone_number = ? WHERE id = ?',
                    [phoneNumber, req.user.id]
                );
            }

            // Create notification
            await conn.execute(
                `INSERT INTO notifications 
                 (user_id, notification_type, title, message)
                 VALUES (?, 'PROFILE_COMPLETED', 'Profile Completed', 
                         'Your profile has been completed successfully. You can now apply for leave.')`,
                [req.user.id]
            );
        });

        res.json({
            success: true,
            message: 'Profile completed successfully'
        });

    } catch (error) {
        console.error('Complete profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete profile'
        });
    }
};

/**
 * Update student profile
 */
const updateProfile = async (req, res) => {
    try {
        const {
            phoneNumber,
            email,
            hostelBlock,
            roomNumber
        } = req.body;

        const student = await db.getOne(
            'SELECT id FROM students WHERE user_id = ?',
            [req.user.id]
        );

        await db.transaction(async (conn) => {
            // Update student table
            if (hostelBlock || roomNumber) {
                const updates = [];
                const params = [];

                if (hostelBlock) {
                    updates.push('hostel_block = ?');
                    params.push(hostelBlock);
                }
                if (roomNumber) {
                    updates.push('room_number = ?');
                    params.push(roomNumber);
                }

                if (updates.length > 0) {
                    params.push(student.id);
                    await conn.execute(
                        `UPDATE students SET ${updates.join(', ')} WHERE id = ?`,
                        params
                    );
                }
            }

            // Update users table
            if (phoneNumber || email) {
                const updates = [];
                const params = [];

                if (phoneNumber) {
                    updates.push('phone_number = ?');
                    params.push(phoneNumber);
                }
                if (email) {
                    updates.push('email = ?');
                    params.push(email);
                }

                if (updates.length > 0) {
                    params.push(req.user.id);
                    await conn.execute(
                        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                        params
                    );
                }
            }
        });

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
};

/**
 * Get student dashboard statistics
 */
const getDashboard = async (req, res) => {
    try {
        const student = await db.getOne(
            'SELECT id FROM students WHERE user_id = ?',
            [req.user.id]
        );

        // Get statistics
        const stats = await db.getOne(
            `SELECT 
                COUNT(*) as total_leaves,
                SUM(CASE WHEN status IN ('APPROVED_DW', 'APPROVED_PRINCIPAL') THEN 1 ELSE 0 END) as approved_leaves,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_leaves,
                SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_leaves,
                SUM(CASE WHEN status IN ('APPROVED_DW', 'APPROVED_PRINCIPAL') THEN DATEDIFF(to_date, from_date) + 1 ELSE 0 END) as total_days_on_leave
             FROM leave_applications
             WHERE student_id = ?`,
            [student.id]
        );

        // Get active leave
        const activeLeave = await db.getOne(
            `SELECT * FROM leave_applications
             WHERE student_id = ?
             AND status IN ('APPROVED_DW', 'APPROVED_PRINCIPAL')
             AND CURDATE() BETWEEN from_date AND to_date
             LIMIT 1`,
            [student.id]
        );

        // Get recent leaves
        const recentLeaves = await db.getMany(
            `SELECT * FROM leave_applications
             WHERE student_id = ?
             ORDER BY created_at DESC
             LIMIT 5`,
            [student.id]
        );

        // Get unread notifications
        const unreadNotifications = await db.getOne(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [req.user.id]
        );

        res.json({
            success: true,
            data: {
                statistics: stats,
                activeLeave,
                recentLeaves,
                unreadNotifications: unreadNotifications.count
            }
        });

    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data'
        });
    }
};

module.exports = {
    getProfile,
    completeProfile,
    updateProfile,
    getDashboard
};
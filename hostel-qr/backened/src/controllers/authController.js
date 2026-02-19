// AUTHENTICATION CONTROLLER
// =====================================================



// =====================================================
// PARENT REGISTRATION & VERIFICATION
// =====================================================

/**
 * Step 2: Parent Registration
 * Parent registers using phone number linked to student
 */
const registerParent = async (req, res) => {
    try {
        const {
            phoneNumber,
            parentName,
            relationship,
            alternatePhone,
            address
        } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Sanitize phone
        const sanitizedPhone = sanitizePhoneNumber(phoneNumber);

        // Check if phone is linked to any student
        const linkedStudents = await db.getMany(
            'SELECT id, student_name, college_id FROM students WHERE parent_phone = ?',
            [sanitizedPhone]
        );

        if (linkedStudents.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No student found with this parent phone number'
            });
        }

        // Check if parent already registered
        const existingParent = await db.getOne(
            'SELECT id FROM users WHERE phone_number = ?',
            [sanitizedPhone]
        );

        if (existingParent) {
            return res.status(409).json({
                success: false,
                message: 'Parent account already exists. Please login.'
            });
        }

        // Get PARENT role ID
        const parentRole = await db.getOne(
            "SELECT id FROM roles WHERE role_name = 'PARENT'"
        );

        // Start transaction
        const result = await db.transaction(async (conn) => {
            // Create parent user account (UNVERIFIED)
            const [userResult] = await conn.execute(
                `INSERT INTO users (role_id, phone_number, is_verified, is_active)
                 VALUES (?, ?, FALSE, FALSE)`,
                [parentRole.id, sanitizedPhone]
            );

            const userId = userResult.insertId;

            // Create parent profile
            const [parentResult] = await conn.execute(
                `INSERT INTO parents (user_id, parent_name, relationship, alternate_phone, address)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, parentName, relationship, alternatePhone, address]
            );

            // Link parent to all students with this phone
            for (const student of linkedStudents) {
                await conn.execute(
                    'UPDATE students SET parent_id = ? WHERE id = ?',
                    [userId, student.id]
                );
            }

            // Generate and send OTP
            const otp = await storeOTP(userId, sanitizedPhone, 'VERIFICATION');
            await sendOTP(sanitizedPhone, otp);

            return { 
                userId, 
                parentId: parentResult.insertId,
                linkedStudents: linkedStudents.length 
            };
        });

        res.status(201).json({
            success: true,
            message: 'Parent registered successfully. OTP sent for verification.',
            data: {
                userId: result.userId,
                phoneNumber: sanitizedPhone,
                linkedStudents: result.linkedStudents,
                requiresOTPVerification: true
            }
        });

    } catch (error) {
        console.error('Parent registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
};

/**
 * Step 3: Verify Parent OTP
 * Activates both parent and linked student accounts
 */
const verifyParentOTP = async (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP are required'
            });
        }

        const sanitizedPhone = sanitizePhoneNumber(phoneNumber);

        // Verify OTP
        const verification = await verifyOTP(sanitizedPhone, otp, 'VERIFICATION');

        if (!verification.success) {
            return res.status(400).json({
                success: false,
                message: verification.message
            });
        }

        // Activate parent and student accounts
        const result = await db.transaction(async (conn) => {
            // Activate parent account
            await conn.execute(
                'UPDATE users SET is_verified = TRUE, is_active = TRUE WHERE id = ?',
                [verification.userId]
            );

            // Get all linked students
            const students = await conn.query(
                'SELECT id, user_id, student_name FROM students WHERE parent_id = ?',
                [verification.userId]
            );

            // Activate all linked student accounts
            for (const student of students[0]) {
                await conn.execute(
                    'UPDATE users SET is_active = TRUE, is_verified = TRUE WHERE id = ?',
                    [student.user_id]
                );

                // Create notification for student
                await conn.execute(
                    `INSERT INTO notifications 
                     (user_id, notification_type, title, message)
                     VALUES (?, 'ACCOUNT_ACTIVATED', 'Account Activated', 
                             'Your account has been activated. You can now complete your profile and apply for leave.')`,
                    [student.user_id]
                );
            }

            // Audit log
            await conn.execute(
                `INSERT INTO audit_logs (user_id, action, table_name, record_id)
                 VALUES (?, 'PARENT_VERIFIED', 'users', ?)`,
                [verification.userId, verification.userId]
            );

            return { studentsActivated: students[0].length };
        });

        // Generate tokens for parent
        const parentUser = await db.getOne(
            `SELECT u.*, r.role_name 
             FROM users u 
             JOIN roles r ON u.role_id = r.id 
             WHERE u.id = ?`,
            [verification.userId]
        );

        const accessToken = generateAccessToken(
            parentUser.id,
            parentUser.role_id,
            parentUser.role_name
        );
        const refreshToken = generateRefreshToken(parentUser.id);

        res.json({
            success: true,
            message: 'Parent verified successfully. Student accounts activated.',
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: parentUser.id,
                    phoneNumber: parentUser.phone_number,
                    role: parentUser.role_name,
                    isVerified: true
                },
                studentsActivated: result.studentsActivated
            }
        });

    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed. Please try again.'
        });
    }
};

// =====================================================
// STUDENT LOGIN
// =====================================================

/**
 * Student Login
 * Only allowed after parent verification
 */
const loginStudent = async (req, res) => {
    try {
        const { collegeId, password } = req.body;

        if (!collegeId || !password) {
            return res.status(400).json({
                success: false,
                message: 'College ID and password are required'
            });
        }

        // Get student with user details
        const student = await db.getOne(
            `SELECT s.*, u.id as user_id, u.password_hash, u.is_active, 
                    u.is_verified, r.id as role_id, r.role_name,
                    p_user.is_verified as parent_verified
             FROM students s
             JOIN users u ON s.user_id = u.id
             JOIN roles r ON u.role_id = r.id
             LEFT JOIN users p_user ON s.parent_id = p_user.id
             WHERE s.college_id = ?`,
            [collegeId]
        );

        if (!student) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Verify password
        const passwordMatch = await comparePassword(password, student.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if parent is verified
        if (!student.parent_id || !student.parent_verified) {
            return res.status(403).json({
                success: false,
                message: 'Account locked. Parent verification pending.',
                requiresParentVerification: true,
                parentPhone: student.parent_phone
            });
        }

        // Check if account is active
        if (!student.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Account is not active. Please contact administration.'
            });
        }

        // Generate tokens
        const accessToken = generateAccessToken(
            student.user_id,
            student.role_id,
            student.role_name
        );
        const refreshToken = generateRefreshToken(student.user_id);

        // Update last login
        await db.query(
            'UPDATE users SET updated_at = NOW() WHERE id = ?',
            [student.user_id]
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: student.user_id,
                    studentId: student.id,
                    collegeId: student.college_id,
                    name: student.student_name,
                    email: student.email,
                    role: student.role_name,
                    department: student.department,
                    profileCompleted: student.profile_completed
                }
            }
        });

    } catch (error) {
        console.error('Student login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
};

// =====================================================
// PARENT LOGIN (OTP-based)
// =====================================================

/**
 * Step 1: Request OTP for parent login
 */
const requestParentOTP = async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        const sanitizedPhone = sanitizePhoneNumber(phoneNumber);

        // Check if parent exists
        const parent = await db.getOne(
            `SELECT u.id, u.is_verified 
             FROM users u 
             JOIN roles r ON u.role_id = r.id 
             WHERE u.phone_number = ? AND r.role_name = 'PARENT'`,
            [sanitizedPhone]
        );

        if (!parent) {
            return res.status(404).json({
                success: false,
                message: 'Parent account not found. Please register first.'
            });
        }

        // Generate and send OTP
        const otp = await storeOTP(parent.id, sanitizedPhone, 'LOGIN');
        await sendOTP(sanitizedPhone, otp);

        res.json({
            success: true,
            message: 'OTP sent successfully',
            data: {
                phoneNumber: sanitizedPhone
            }
        });

    } catch (error) {
        console.error('OTP request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP. Please try again.'
        });
    }
};

/**
 * Step 2: Verify OTP and login parent
 */
const loginParent = async (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP are required'
            });
        }

        const sanitizedPhone = sanitizePhoneNumber(phoneNumber);

        // Verify OTP
        const verification = await verifyOTP(sanitizedPhone, otp, 'LOGIN');

        if (!verification.success) {
            return res.status(400).json({
                success: false,
                message: verification.message
            });
        }

        // Get parent details
        const parent = await db.getOne(
            `SELECT u.*, r.role_name, p.parent_name
             FROM users u
             JOIN roles r ON u.role_id = r.id
             JOIN parents p ON u.id = p.user_id
             WHERE u.id = ?`,
            [verification.userId]
        );

        // Generate tokens
        const accessToken = generateAccessToken(
            parent.id,
            parent.role_id,
            parent.role_name
        );
        const refreshToken = generateRefreshToken(parent.id);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: parent.id,
                    phoneNumber: parent.phone_number,
                    name: parent.parent_name,
                    role: parent.role_name,
                    isVerified: parent.is_verified
                }
            }
        });

    } catch (error) {
        console.error('Parent login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
};

// =====================================================
// STAFF LOGIN (Deputy Warden, Principal, Watchman)
// =====================================================

const loginStaff = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Get staff user
        const user = await db.getOne(
            `SELECT u.*, r.role_name, s.staff_name, s.designation
             FROM users u
             JOIN roles r ON u.role_id = r.id
             JOIN staff s ON u.id = s.user_id
             WHERE u.email = ? AND r.role_name IN ('DEPUTY_WARDEN', 'PRINCIPAL', 'WATCHMAN')`,
            [email]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Verify password
        const passwordMatch = await comparePassword(password, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Account is not active'
            });
        }

        // Generate tokens
        const accessToken = generateAccessToken(
            user.id,
            user.role_id,
            user.role_name
        );
        const refreshToken = generateRefreshToken(user.id);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.staff_name,
                    role: user.role_name,
                    designation: user.designation
                }
            }
        });

    } catch (error) {
        console.error('Staff login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
};

module.exports = {
    registerStudent,
    registerParent,
    verifyParentOTP,
    loginStudent,
    requestParentOTP,
    loginParent,
    loginStaff
};